//go:build linux

package clipboard

/*
#cgo LDFLAGS: -lX11

// Implementations live in x11_hotkey_linux.c to avoid multiple-definition
// linker errors that occur when CGo includes a preamble in every translation unit.
extern int  initX11Hotkey(void);
extern void runX11EventLoop(void);
*/
import "C"
import (
	"context"
	"os/exec"
	"strings"
	"time"

	gclip "golang.design/x/clipboard"
)

func shouldSkip() bool {
	if isPaused.Load() {
		return true
	}
	if isForegroundProcessIgnored() {
		return true
	}
	return false
}

func fireChange() {
	now := time.Now()
	clipboardMutex.Lock()
	if now.Sub(lastClipboardChange) > 150*time.Millisecond {
		lastClipboardChange = now
		clipboardMutex.Unlock()
		if onChangeCallback != nil {
			onChangeCallback()
		}
	} else {
		clipboardMutex.Unlock()
	}
}

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
