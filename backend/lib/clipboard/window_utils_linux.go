//go:build linux

package clipboard

import (
	"os/exec"
	"strings"
	"sync"
	"time"
)

//
// Previous window tracking (Linux)
//

var (
	prevWindowID string
	prevWinMu    sync.Mutex
)

// SetOurProcessID is a no-op on Linux (kept for API compatibility).
func SetOurProcessID(pid uint32) {}

// StartFocusTracker polls the active X11 window every 150 ms.
func StartFocusTracker() {
	go func() {
		for {
			time.Sleep(150 * time.Millisecond)
			out, err := exec.Command("xdotool", "getactivewindow").Output()
			if err != nil {
				continue
			}
			id := strings.TrimSpace(string(out))
			if id != "" {
				prevWinMu.Lock()
				prevWindowID = id
				prevWinMu.Unlock()
			}
		}
	}()
}

// capturePreviousAppLinux snapshots the currently active X11 window ID.
func capturePreviousAppLinux() {
	out, err := exec.Command("xdotool", "getactivewindow").Output()
	if err != nil {
		return
	}
	id := strings.TrimSpace(string(out))
	if id != "" {
		prevWinMu.Lock()
		prevWindowID = id
		prevWinMu.Unlock()
	}
}

// HasPreviousWindow reports whether a previous window has been tracked.
func HasPreviousWindow() bool {
	prevWinMu.Lock()
	defer prevWinMu.Unlock()
	return prevWindowID != ""
}

// FocusPreviousWindow activates the previously tracked window via xdotool.
func FocusPreviousWindow() {
	prevWinMu.Lock()
	id := prevWindowID
	prevWinMu.Unlock()

	if id == "" {
		return
	}
	exec.Command("xdotool", "windowactivate", id).Run()
}

// SimulatePaste sends Ctrl+V via xdotool.
func SimulatePaste() {
	time.Sleep(80 * time.Millisecond)
	exec.Command("xdotool", "key", "ctrl+v").Run()
}

//
// Process ignore list – Linux implementation
//

// isForegroundProcessIgnored returns true if the frontmost app's process name
// matches any entry in the ignore list.
func isForegroundProcessIgnored() bool {
	ignoredProcessesMu.RLock()
	defer ignoredProcessesMu.RUnlock()

	if len(ignoredProcesses) == 0 {
		return false
	}

	name := getForegroundAppNameLinux()
	if name == "" {
		return false
	}

	for _, ignored := range ignoredProcesses {
		if strings.Contains(name, ignored) {
			return true
		}
	}
	return false
}
