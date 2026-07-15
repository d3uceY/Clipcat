// x11_clipboard_linux.c — X11 clipboard reading + XFixes-based monitoring.
//
// ── Data reading ──────────────────────────────────────────────────────
// Uses select() on the X11 connection socket so reads always return within
// a deadline (unlike golang.design/x/clipboard's blocking XNextEvent loop).
//
// ── Clipboard monitoring ──────────────────────────────────────────────
// Uses the XFixes extension (XFixesSelectSelectionInput) to receive
// event-driven notifications when clipboard ownership changes. This is the
// same approach used by CopyQ and other mature clipboard managers — no
// polling, no 1-second delays, no risk of hanging.

#include <X11/Xlib.h>
#include <X11/Xatom.h>
#include <X11/extensions/Xfixes.h>
#include <sys/select.h>
#include <sys/time.h>
#include <stdlib.h>
#include <string.h>

// ── Display A: clipboard data reading ─────────────────────────────────

static Display *cDisplay = NULL;
static Window   cWindow  = 0;
static Atom     cAtom    = None;
static Atom     cProp    = None;

int initClipboardX11(void) {
	if (cDisplay) return 0;
	cDisplay = XOpenDisplay(NULL);
	if (!cDisplay) return -1;
	cWindow = XCreateSimpleWindow(
		cDisplay, DefaultRootWindow(cDisplay),
		0, 0, 1, 1, 0, 0, 0);
	cAtom = XInternAtom(cDisplay, "CLIPBOARD", False);
	cProp = XInternAtom(cDisplay, "CLIPCAT_DATA", False);
	return 0;
}

static int read_clipboard_data(
	Display         *dpy,
	XSelectionEvent *sev,
	Atom             target,
	unsigned char  **buf)
{
	unsigned char *data;
	Atom actual;
	int format;
	unsigned long n = 0, size = 0;

	if (sev->property == None) return 0;

	int ret = XGetWindowProperty(dpy, sev->requestor, sev->property,
		0L, (~0L), 0, AnyPropertyType,
		&actual, &format, &size, &n, &data);
	if (ret != Success) return -1;
	if (!data) return 0;

	// Accept data regardless of the actual atom type — clipboard owners may
	// respond with STRING or text/plain instead of the requested UTF8_STRING.
	int len = 0;
	if (size > 0) {
		len = (int)(size * sizeof(unsigned char));
		*buf = malloc((size_t)len);
		if (*buf) memcpy(*buf, data, (size_t)len);
		else len = -1;
	}
	XFree(data);
	XDeleteProperty(dpy, sev->requestor, sev->property);
	return len;
}

// clipboardReadTargetWithTimeout reads the clipboard for the given target
// atom (e.g. "UTF8_STRING" or "image/png") with a timeout.
//
// Returns: >0 success (*buf allocated), 0 empty/unsupported, -1 timeout, -2 bad atom.
// Caller must free *buf with free().
int clipboardReadTargetWithTimeout(
	const char    *target,
	unsigned char **buf,
	int            timeout_ms)
{
	if (!cDisplay) return -1;

	Atom targetAtom = XInternAtom(cDisplay, target, False);
	if (targetAtom == None) return -2;

	*buf = NULL;

	XConvertSelection(cDisplay, cAtom, targetAtom, cProp, cWindow, CurrentTime);
	XFlush(cDisplay);

	int fd = ConnectionNumber(cDisplay);

	struct timeval start, now;
	gettimeofday(&start, NULL);
	int remaining = timeout_ms;

	while (remaining > 0) {
		struct timeval tv;
		tv.tv_sec  = remaining / 1000;
		tv.tv_usec = (remaining % 1000) * 1000;

		fd_set readFds;
		FD_ZERO(&readFds);
		FD_SET(fd, &readFds);

		int ret = select(fd + 1, &readFds, NULL, NULL, &tv);
		if (ret <= 0) return -1;

		while (XPending(cDisplay)) {
			XEvent event;
			XNextEvent(cDisplay, &event);
			if (event.type == SelectionNotify) {
				return read_clipboard_data(
					cDisplay, &event.xselection, targetAtom, buf);
			}
		}

		gettimeofday(&now, NULL);
		remaining = timeout_ms -
			(int)((now.tv_sec  - start.tv_sec) * 1000 +
			      (now.tv_usec - start.tv_usec) / 1000);
	}

	return -1;
}

// ── Display B: XFixes clipboard change monitoring ─────────────────────

static Display     *mDisplay  = NULL;
static int          mXfixesOpcode = 0;
static Atom         mClipAtom = None;

// initClipboardMonitorX11 opens a second X11 display and registers for
// XFixes clipboard ownership change notifications. Returns 0 on success.
int initClipboardMonitorX11(void) {
	if (mDisplay) return 0;
	mDisplay = XOpenDisplay(NULL);
	if (!mDisplay) return -1;

	// Check XFixes extension availability.
	int eventBase, errorBase;
	if (!XFixesQueryExtension(mDisplay, &eventBase, &errorBase)) {
		XCloseDisplay(mDisplay);
		mDisplay = NULL;
		return -1;
	}
	mXfixesOpcode = eventBase;

	mClipAtom = XInternAtom(mDisplay, "CLIPBOARD", False);

	// Register for clipboard ownership change notifications.
	XFixesSelectSelectionInput(
		mDisplay, DefaultRootWindow(mDisplay),
		mClipAtom,
		XFixesSetSelectionOwnerNotifyMask);

	XFlush(mDisplay);
	return 0;
}

// runX11ClipboardMonitor enters an X11 event loop that calls the Go
// callback via clipboardChangedFired() whenever XFixes detects a clipboard
// ownership change. This never blocks indefinitely because XFixes events
// are delivered by the X server as soon as clipboard ownership changes.
void runX11ClipboardMonitor(void) {
	if (!mDisplay) return;

	while (1) {
		XEvent event;
		XNextEvent(mDisplay, &event);

		if (event.type == mXfixesOpcode + XFixesSelectionNotify) {
			XFixesSelectionNotifyEvent *sev =
				(XFixesSelectionNotifyEvent *)&event;
			if (sev->selection == mClipAtom &&
			    sev->subtype == XFixesSetSelectionOwnerNotifyMask)
			{
				extern void clipboardChangedFired(void);
				clipboardChangedFired();
			}
		}
	}
}
