//go:build linux

package clipboard

/*
#cgo LDFLAGS: -lX11

#include <X11/Xlib.h>
#include <X11/Xutil.h>
#include <X11/keysym.h>
#include <stdlib.h>

static Display *gDisplay = NULL;
static Window gRoot = 0;

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
			if (kev->keycode == vKeyCode && (kev->state & (ControlMask | ShiftMask)) == (ControlMask | ShiftMask)) {
				extern void linuxHotkeyFired(void);
				linuxHotkeyFired();
			}
		}
	}
}
*/
import "C"
import (
	"context"
	"os/exec"
	"strings"
	"time"

	gclip "golang.design/x/clipboard"
)

//export linuxHotkeyFired
func linuxHotkeyFired() {
	capturePreviousAppLinux()
	if onHotkeyCallback != nil {
		go onHotkeyCallback()
	}
}

// StartClipboardListener starts clipboard monitoring via polling and registers
// a global Ctrl+Shift+V hotkey via X11.
func StartClipboardListener(onChange func(), onHotkey func()) {
	onChangeCallback = onChange
	onHotkeyCallback = onHotkey

	// Try to register X11 hotkey; fall back gracefully if X11 is unavailable.
	go func() {
		if C.initX11Hotkey() != 0 {
			// X11 hotkey not available (e.g. Wayland session).
			// The app still works via the tray icon.
			return
		}
		C.runX11EventLoop()
	}()

	// Clipboard monitoring via golang.design/x/clipboard Watch
	go func() {
		ctx := context.Background()
		ch := gclip.Watch(ctx, gclip.FmtText)
		imgCh := gclip.Watch(ctx, gclip.FmtImage)

		for {
			select {
			case <-ch:
				if shouldSkip() {
					continue
				}
				fireChange()
			case <-imgCh:
				if shouldSkip() {
					continue
				}
				fireChange()
			}
		}
	}()
}

// getForegroundAppNameLinux returns the process name of the currently focused
// window using xdotool.
func getForegroundAppNameLinux() string {
	// Get active window PID
	pidOut, err := exec.Command("xdotool", "getactivewindow", "getwindowpid").Output()
	if err != nil {
		return ""
	}
	pid := strings.TrimSpace(string(pidOut))
	if pid == "" {
		return ""
	}

	// Read process comm from /proc
	commOut, err := exec.Command("cat", "/proc/"+pid+"/comm").Output()
	if err != nil {
		return ""
	}
	return strings.ToLower(strings.TrimSpace(string(commOut)))
}
