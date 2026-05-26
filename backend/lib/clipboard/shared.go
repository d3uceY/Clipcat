package clipboard

import (
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

// Shared state used by all platform-specific implementations.

var (
	lastClipboardChange time.Time
	clipboardMutex      sync.Mutex

	onChangeCallback func()
	onHotkeyCallback func()

	// isPaused stops new clips from being saved without stopping the listener.
	isPaused atomic.Bool
)

// PauseCapture stops new clipboard events from being saved.
func PauseCapture() { isPaused.Store(true) }

// ResumeCapture re-enables clipboard capture.
func ResumeCapture() { isPaused.Store(false) }

// IsPaused reports whether capture is currently paused.
func IsPaused() bool { return isPaused.Load() }

//
// Process ignore list (platform-agnostic portion)
//

var (
	ignoredProcesses   []string
	ignoredProcessesMu sync.RWMutex
)

// SetIgnoredProcesses replaces the in-memory ignore list.
// Names are lowercased for case-insensitive matching.
func SetIgnoredProcesses(names []string) {
	ignoredProcessesMu.Lock()
	defer ignoredProcessesMu.Unlock()
	ignoredProcesses = make([]string, len(names))
	for i, n := range names {
		ignoredProcesses[i] = strings.ToLower(n)
	}
}
