// +build ignore
// (This file is compiled directly by cgo via the package, not by the Go tool.)

#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <X11/keysym.h>
#include <stdlib.h>

static Display *gDisplay = NULL;
static Window   gRoot    = 0;

int initX11Hotkey(void) {
	gDisplay = XOpenDisplay(NULL);
	if (!gDisplay) return -1;

	gRoot = DefaultRootWindow(gDisplay);

	KeyCode keyCode = XKeysymToKeycode(gDisplay, XK_V);

	// Grab Ctrl+Shift+V
	XGrabKey(gDisplay, keyCode, ControlMask | ShiftMask, gRoot, True, GrabModeAsync, GrabModeAsync);

	XSelectInput(gDisplay, gRoot, KeyPressMask);
	return 0;
}

// runX11EventLoop blocks and processes X11 events, calling the Go callback
// when Ctrl+Shift+V is detected.
void runX11EventLoop(void) {
	XEvent event;
	KeyCode vKeyCode = XKeysymToKeycode(gDisplay, XK_V);

	while (1) {
		XNextEvent(gDisplay, &event);
		if (event.type == KeyPress) {
			XKeyEvent *kev = (XKeyEvent *)&event;
			if (kev->keycode == vKeyCode &&
			    (kev->state & (ControlMask | ShiftMask)) == (ControlMask | ShiftMask)) {
				extern void linuxHotkeyFired(void);
				linuxHotkeyFired();
			}
		}
	}
}
