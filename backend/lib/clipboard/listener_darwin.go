//go:build darwin

package clipboard

/*
#cgo LDFLAGS: -framework Carbon

#include <Carbon/Carbon.h>

// Declared in clipboard_darwin.c
extern void registerDarwinHotkey(void);
extern void unregisterDarwinHotkey(void);
*/
import "C"
import (
	"context"
	"os/exec"
	"strings"
	"time"

	gclip "golang.design/x/clipboard"
)

//export darwinHotkeyFired
func darwinHotkeyFired() {
	capturePreviousAppDarwin()
	if onHotkeyCallback != nil {
		go onHotkeyCallback()
	}
}

// StartClipboardListener starts clipboard monitoring and registers a global
// Ctrl+Shift+V hotkey via Carbon. The hotkey registration is best-effort;
// clipboard monitoring works regardless.
func StartClipboardListener(onChange func(), onHotkey func()) {
	onChangeCallback = onChange
	onHotkeyCallback = onHotkey

	// Register global hotkey with Carbon on a slight delay to let NSApplication
	// finish launching. Wrapped in recover to avoid crashing the app.
	go func() {
		time.Sleep(500 * time.Millisecond)
		func() {
			defer func() { recover() }()
			C.registerDarwinHotkey()
		}()
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

// getForegroundAppNameDarwin returns the Bundle ID of the frontmost app via osascript.
func getForegroundAppNameDarwin() string {
	out, err := exec.Command("osascript", "-e",
		`tell application "System Events" to get bundle identifier of first application process whose frontmost is true`,
	).Output()
	if err != nil {
		return ""
	}
	return strings.ToLower(strings.TrimSpace(string(out)))
}
