//go:build linux

package tray

// Start is a no-op on Linux.
// The app is summoned via Ctrl+Shift+V (X11) or shown automatically on startup
// (Wayland).  getlantern/systray depends on libappindicator (X11/D-Bus) and
// crashes on Wayland compositors.  Wails v3 will ship native, cross-platform
// systray support — this stub will be replaced then.
//
// Wails v3 native systray replaces this entire file.
func Start(iconBytes []byte, onShow func(), onQuit func()) {}
