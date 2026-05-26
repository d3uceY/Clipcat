//go:build darwin

package clipboard

/*
#cgo LDFLAGS: -framework Carbon -framework ApplicationServices

// Declared in clipboard_darwin.c
extern void sendPasteDarwin(void);
*/
import "C"
import (
	"fmt"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"
)

//
// Previous app tracking (macOS)
//

var (
	prevAppBundleID string
	prevAppMu       sync.Mutex
	ourBundleID     string // detected at startup
)

// SetOurProcessID detects our own bundle ID and process name so the focus
// tracker never captures Clipcat itself as the paste target.
func SetOurProcessID(pid uint32) {
	ourBundleID = detectOwnBundleID()
	fmt.Printf("[Clipcat] own bundle ID: %q\n", ourBundleID)
}

// detectOwnBundleID tries several methods to determine our identity.
func detectOwnBundleID() string {
	// Method 1: Read from the app bundle's Info.plist.
	if bid := os.Getenv("CLIPCAT_BUNDLE_ID"); bid != "" {
		return bid
	}

	// Method 2: Use osascript to get our own bundle ID via PID.
	pid := os.Getpid()
	out, err := exec.Command("osascript", "-e",
		fmt.Sprintf(`tell application "System Events" to get bundle identifier of first application process whose unix id is %d`, pid),
	).Output()
	if err == nil {
		bid := strings.TrimSpace(string(out))
		if bid != "" && bid != "missing value" {
			return bid
		}
	}

	// Method 3: Use our process name as the exclusion key.
	return fmt.Sprintf("clipcat-%d", pid)
}

// isOurOwnApp returns true if the given bundle ID / process identifier
// belongs to Clipcat itself.
func isOurOwnApp(name string) bool {
	if name == "" {
		return false
	}
	name = strings.ToLower(name)

	// Direct bundle ID match.
	if ourBundleID != "" && strings.EqualFold(name, ourBundleID) {
		return true
	}

	// Common Clipcat identifiers from Wails builds.
	if strings.Contains(name, "clipcat") || strings.Contains(name, "com.wails.") {
		return true
	}

	return false
}

// StartFocusTracker polls the frontmost app every 300 ms, excluding Clipcat.
func StartFocusTracker() {
	go func() {
		for {
			time.Sleep(300 * time.Millisecond)
			name := getForegroundAppNameDarwin()
			if name != "" && !isOurOwnApp(name) {
				prevAppMu.Lock()
				prevAppBundleID = name
				prevAppMu.Unlock()
			}
		}
	}()
}

// capturePreviousAppDarwin snapshots the frontmost app (called by hotkey handler).
func capturePreviousAppDarwin() {
	name := getForegroundAppNameDarwin()
	if name != "" && !isOurOwnApp(name) {
		prevAppMu.Lock()
		prevAppBundleID = name
		prevAppMu.Unlock()
	}
}

// HasPreviousWindow reports whether a non-Clipcat app has been tracked.
func HasPreviousWindow() bool {
	prevAppMu.Lock()
	defer prevAppMu.Unlock()
	return prevAppBundleID != ""
}

// FocusPreviousWindow activates the previously tracked app via open -b.
func FocusPreviousWindow() {
	prevAppMu.Lock()
	id := prevAppBundleID
	prevAppMu.Unlock()

	if id == "" {
		return
	}

	exec.Command("open", "-b", id).Run()
}

// SimulatePaste fires Cmd+V using CGEvents (implemented in clipboard_darwin.c).
// Requires Accessibility permissions granted to Clipcat in System Settings.
func SimulatePaste() {
	C.sendPasteDarwin()
}

//
// Process ignore list – macOS implementation
//

func isForegroundProcessIgnored() bool {
	ignoredProcessesMu.RLock()
	defer ignoredProcessesMu.RUnlock()

	if len(ignoredProcesses) == 0 {
		return false
	}

	name := getForegroundAppNameDarwin()
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
