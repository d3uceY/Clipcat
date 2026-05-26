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
	procKeybdEvent               = user32.NewProc("keybd_event")

	procOpenProcess       = kernel32.NewProc("OpenProcess")
	procCloseHandle       = kernel32.NewProc("CloseHandle")
	procGetModuleBaseName = psapi.NewProc("GetModuleBaseNameW")
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

// capturePreviousWindow is called by the hotkey handler; it does an immediate
// snapshot that takes priority over the poller's last seen window.
func capturePreviousWindow() {
	hwnd, _, _ := procGetForegroundWindow.Call()
	if hwnd != 0 {
		var pid uint32
		procGetWindowThreadProcessId.Call(hwnd, uintptr(unsafe.Pointer(&pid)))
		if pid != 0 && pid != ourPID {
			prevHWND = hwnd
		}
	}
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
// Process ignore list – Windows implementation
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
