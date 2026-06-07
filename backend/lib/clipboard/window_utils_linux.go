//go:build linux

package clipboard

import (
	"os/exec"
	"strings"
	"sync"
	"time"
	"fmt"
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
// Cursor position and monitor bounds (Linux/X11)
//

// GetCursorPos returns the current cursor position in screen coordinates
// via xdotool.
func GetCursorPos() (x, y int) {
	out, err := exec.Command("xdotool", "getmouselocation", "--shell").Output()
	if err != nil {
		return 0, 0
	}
	for _, line := range strings.Split(string(out), "\n") {
		switch {
		case strings.HasPrefix(line, "X="):
			fmt.Sscanf(line, "X=%d", &x)
		case strings.HasPrefix(line, "Y="):
			fmt.Sscanf(line, "Y=%d", &y)
		}
	}
	return x, y
}

// GetMonitorBoundsAt returns the bounding rectangle of the monitor that
// contains (px, py), parsed from xrandr output.  Falls back to a 1920×1080
// region at the origin when the geometry cannot be determined.
func GetMonitorBoundsAt(px, py int) (mx, my, mw, mh int) {
	out, err := exec.Command("xrandr").Output()
	if err != nil {
		return 0, 0, 1920, 1080
	}

	for _, line := range strings.Split(string(out), "\n") {
		// Lines of interest look like:
		//   HDMI-1 connected 1920x1080+0+0 (normal ...) 527mm x 296mm
		//   eDP-1 connected primary 2560x1440+1920+0 ...
		if !strings.Contains(line, " connected ") {
			continue
		}
		// Extract the WxH+X+Y token.
		fields := strings.Fields(line)
		for _, f := range fields {
			var w, h, ox, oy int
			if n, _ := fmt.Sscanf(f, "%dx%d+%d+%d", &w, &h, &ox, &oy); n == 4 {
				if px >= ox && px < ox+w && py >= oy && py < oy+h {
					return ox, oy, w, h
				}
			}
		}
	}

	// Cursor not found in any monitor rect — fall back to the first one.
	for _, line := range strings.Split(string(out), "\n") {
		if !strings.Contains(line, " connected ") {
			continue
		}
		fields := strings.Fields(line)
		for _, f := range fields {
			var w, h, ox, oy int
			if n, _ := fmt.Sscanf(f, "%dx%d+%d+%d", &w, &h, &ox, &oy); n == 4 {
				return ox, oy, w, h
			}
		}
	}

	return 0, 0, 1920, 1080
}

// GetWindowMonitorWorkOrigin returns (0, 0) on Linux because Wails uses
// absolute screen coordinates for WindowSetPosition on this platform.
func GetWindowMonitorWorkOrigin() (ox, oy int) { return 0, 0 }

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
