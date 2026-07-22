//go:build windows

package clipboard

import (
	"strings"
	"syscall"
	"time"
	"unsafe"
)

//
// Win32 DLL procs used across this package
//

var (
	user32   = syscall.NewLazyDLL("user32.dll")
	kernel32 = syscall.NewLazyDLL("kernel32.dll")
	psapi    = syscall.NewLazyDLL("psapi.dll")

	procGetForegroundWindow      = user32.NewProc("GetForegroundWindow")
	procSetForegroundWindow      = user32.NewProc("SetForegroundWindow")
	procGetWindowThreadProcessId = user32.NewProc("GetWindowThreadProcessId")
	procRegisterHotKey           = user32.NewProc("RegisterHotKey")
	procUnregisterHotKey         = user32.NewProc("UnregisterHotKey")
	procKeybdEvent               = user32.NewProc("keybd_event")
	// AllowSetForegroundWindow must be called from the thread that currently
	// holds the foreground lock so that a later SetForegroundWindow call from
	// any other goroutine/process will succeed.
	procAllowSetForegroundWindow = user32.NewProc("AllowSetForegroundWindow")

	procOpenProcess       = kernel32.NewProc("OpenProcess")
	procCloseHandle       = kernel32.NewProc("CloseHandle")
	procGetModuleBaseName = psapi.NewProc("GetModuleBaseNameW")

	procGetCursorPos      = user32.NewProc("GetCursorPos")
	procMonitorFromPoint  = user32.NewProc("MonitorFromPoint")
	procMonitorFromWindow = user32.NewProc("MonitorFromWindow")
	procGetMonitorInfo    = user32.NewProc("GetMonitorInfoW")
	procFindWindowW       = user32.NewProc("FindWindowW")
)

const (
	processQueryInformation = 0x0400
	processVMRead           = 0x0010

	VK_CONTROL      = 0x11
	KEYEVENTF_KEYUP = 0x0002
)

//
// Previous window tracking
//

var (
	prevHWND uintptr
	ourPID   uint32
)

// SetOurProcessID stores the host process PID so StartFocusTracker can tell
// Clipcat windows apart from everything else.
func SetOurProcessID(pid uint32) {
	ourPID = pid
}

// StartFocusTracker polls GetForegroundWindow every 150 ms and stores the
// most recently focused window that does NOT belong to this process.
func StartFocusTracker() {
	go func() {
		for {
			time.Sleep(150 * time.Millisecond)
			hwnd, _, _ := procGetForegroundWindow.Call()
			if hwnd == 0 {
				continue
			}
			var pid uint32
			procGetWindowThreadProcessId.Call(hwnd, uintptr(unsafe.Pointer(&pid)))
			if pid != 0 && pid != ourPID {
				prevHWND = hwnd
			}
		}
	}()
}

// capturePreviousWindow is called synchronously on the WM_HOTKEY message
// thread, before the goroutine is spawned. This is the only moment we hold
// the Windows foreground lock, so we:
//  1. Snapshot the current foreground window as the paste target.
//  2. Call AllowSetForegroundWindow(ASFW_ANY) to hand the foreground token to
//     any process for one call - the goroutine that follows uses it to bring
//     the Clipcat window to the front via WindowShow/SetForegroundWindow.
func capturePreviousWindow() {
	hwnd, _, _ := procGetForegroundWindow.Call()
	if hwnd != 0 {
		var pid uint32
		procGetWindowThreadProcessId.Call(hwnd, uintptr(unsafe.Pointer(&pid)))
		if pid != 0 && pid != ourPID {
			prevHWND = hwnd
		}
	}
	const ASFW_ANY = 0xFFFFFFFF
	procAllowSetForegroundWindow.Call(ASFW_ANY)
}

// HasPreviousWindow reports whether a non-Clipcat window has been seen yet.
func HasPreviousWindow() bool {
	return prevHWND != 0
}

// FocusPreviousWindow restores keyboard focus to the last tracked window.
func FocusPreviousWindow() {
	if prevHWND == 0 {
		return
	}
	procSetForegroundWindow.Call(prevHWND)
}

// SimulatePaste sends a Ctrl+V keystroke sequence to the focused window.
// Caller should ensure the right window is focused before calling this.
func SimulatePaste() {
	time.Sleep(80 * time.Millisecond)
	procKeybdEvent.Call(VK_CONTROL, 0, 0, 0)
	procKeybdEvent.Call(VK_V, 0, 0, 0)
	procKeybdEvent.Call(VK_V, 0, KEYEVENTF_KEYUP, 0)
	procKeybdEvent.Call(VK_CONTROL, 0, KEYEVENTF_KEYUP, 0)
}

//
// Cursor position and monitor bounds
//

// tagPOINT mirrors the Win32 POINT struct.
type tagPOINT struct{ X, Y int32 }

// tagRECT mirrors the Win32 RECT struct.
type tagRECT struct{ Left, Top, Right, Bottom int32 }

// tagMONITORINFO mirrors the Win32 MONITORINFO struct.
type tagMONITORINFO struct {
	CbSize    uint32
	RcMonitor tagRECT
	RcWork    tagRECT
	DwFlags   uint32
}

// GetCursorPos returns the current cursor position in screen coordinates.
func GetCursorPos() (x, y int) {
	var pt tagPOINT
	procGetCursorPos.Call(uintptr(unsafe.Pointer(&pt)))
	return int(pt.X), int(pt.Y)
}

// GetMonitorBoundsAt returns the working area (taskbar excluded) of the monitor
// that contains the screen point (px, py).  Falls back to a 1920×1080 region
// at the origin when the Win32 call fails.
func GetMonitorBoundsAt(px, py int) (mx, my, mw, mh int) {
	// Build a POINT on the stack and reinterpret its memory as a single
	// uintptr so the x64 ABI receives the struct in one register - the
	// correct calling convention for MonitorFromPoint.
	pt := tagPOINT{X: int32(px), Y: int32(py)}
	const MONITOR_DEFAULTTONEAREST = 2
	hmon, _, _ := procMonitorFromPoint.Call(
		*(*uintptr)(unsafe.Pointer(&pt)),
		MONITOR_DEFAULTTONEAREST,
	)
	if hmon == 0 {
		return 0, 0, 1920, 1080
	}

	var mi tagMONITORINFO
	mi.CbSize = uint32(unsafe.Sizeof(mi))
	procGetMonitorInfo.Call(hmon, uintptr(unsafe.Pointer(&mi)))

	// rcWork excludes the taskbar so the window is never placed behind it,
	// which matters on secondary monitors that host the taskbar.
	if mi.RcWork.Right == 0 && mi.RcWork.Bottom == 0 {
		// GetMonitorInfoW failed - fall back to the raw monitor rect.
		return int(mi.RcMonitor.Left),
			int(mi.RcMonitor.Top),
			int(mi.RcMonitor.Right - mi.RcMonitor.Left),
			int(mi.RcMonitor.Bottom - mi.RcMonitor.Top)
	}
	return int(mi.RcWork.Left),
		int(mi.RcWork.Top),
		int(mi.RcWork.Right - mi.RcWork.Left),
		int(mi.RcWork.Bottom - mi.RcWork.Top)
}

// GetWindowMonitorWorkOrigin returns the top-left corner of the work area of
// the monitor that currently contains the Clipcat main window.
//
// Wails' WindowSetPosition(x, y) is NOT absolute - it internally adds the
// origin of the window's current monitor before calling SetWindowPos:
//
//	SetWindowPos(hwnd, ..., workRect.Left + x, workRect.Top + y, ...)
//
// To place the window at an absolute screen position P, callers must pass
// (P.X - originX, P.Y - originY) so that Wails' addition cancels out.
func GetWindowMonitorWorkOrigin() (ox, oy int) {
	title, err := syscall.UTF16PtrFromString("Clipcat")
	if err != nil {
		return 0, 0
	}
	hwnd, _, _ := procFindWindowW.Call(0, uintptr(unsafe.Pointer(title)))
	if hwnd == 0 {
		return 0, 0
	}

	const MONITOR_DEFAULTTONEAREST = 2
	hmon, _, _ := procMonitorFromWindow.Call(hwnd, MONITOR_DEFAULTTONEAREST)
	if hmon == 0 {
		return 0, 0
	}

	var mi tagMONITORINFO
	mi.CbSize = uint32(unsafe.Sizeof(mi))
	procGetMonitorInfo.Call(hmon, uintptr(unsafe.Pointer(&mi)))

	if mi.RcWork.Right == 0 && mi.RcWork.Bottom == 0 {
		return int(mi.RcMonitor.Left), int(mi.RcMonitor.Top)
	}
	return int(mi.RcWork.Left), int(mi.RcWork.Top)
}

//
// Process ignore list - Windows implementation
//

// isForegroundProcessIgnored returns true if the process that currently has
// focus matches any entry in the ignore list.
func isForegroundProcessIgnored() bool {
	ignoredProcessesMu.RLock()
	defer ignoredProcessesMu.RUnlock()

	if len(ignoredProcesses) == 0 {
		return false
	}

	hwnd, _, _ := procGetForegroundWindow.Call()
	name := getProcessNameForHWND(hwnd)
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

// getProcessNameForHWND returns the lowercase exe name of the process that owns
// the given window handle, e.g. "1password.exe".
func getProcessNameForHWND(hwnd uintptr) string {
	var pid uint32
	procGetWindowThreadProcessId.Call(hwnd, uintptr(unsafe.Pointer(&pid)))
	if pid == 0 {
		return ""
	}

	handle, _, _ := procOpenProcess.Call(processQueryInformation|processVMRead, 0, uintptr(pid))
	if handle == 0 {
		return ""
	}
	defer procCloseHandle.Call(handle)

	buf := make([]uint16, 256)
	procGetModuleBaseName.Call(handle, 0, uintptr(unsafe.Pointer(&buf[0])), uintptr(len(buf)))
	return strings.ToLower(syscall.UTF16ToString(buf))
}
