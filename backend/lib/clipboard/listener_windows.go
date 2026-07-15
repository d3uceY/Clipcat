//go:build windows

package clipboard

import (
	"runtime"
	"syscall"
	"time"
	"unsafe"

	"github.com/lxn/win"
	gclip "golang.design/x/clipboard"
)

const (
	WM_CLIPBOARDUPDATE = 0x031D
	WM_HOTKEY          = 0x0312

	// Global hotkey: Ctrl+Shift+V (ID 1)
	hotkeyID    = 1
	MOD_SHIFT   = 0x0004
	MOD_CONTROL = 0x0002
	VK_V        = 0x56
)

// debounceTimer is reset on every WM_CLIPBOARDUPDATE. The callback fires
// 40 ms after the *last* event in a burst, so rapid Ctrl+C presses are all
// captured (the final copy in each quiet window wins) without hammering the DB.
var debounceTimer *time.Timer

// wndProc handles messages for the hidden clipboard + hotkey window.
func wndProc(hwnd win.HWND, msg uint32, wParam, lParam uintptr) uintptr {
	switch msg {

	case WM_CLIPBOARDUPDATE:
		if isPaused.Load() {
			return 0
		}
		if isForegroundProcessIgnored() {
			return 0
		}

		// Trailing-edge debounce: reset the timer on every event and fire the
		// callback in a goroutine 40 ms after the burst ends. wndProc returns
		// immediately so the message pump is never stalled.
		clipboardMutex.Lock()
		if debounceTimer != nil {
			debounceTimer.Stop()
		}
		debounceTimer = time.AfterFunc(40*time.Millisecond, func() {
			if onChangeCallback != nil {
				onChangeCallback()
			}
		})
		clipboardMutex.Unlock()
		return 0

	case WM_HOTKEY:
		if wParam == hotkeyID {
			// Capture the foreground window now, before Clipcat steals focus.
			capturePreviousWindow()
			if onHotkeyCallback != nil {
				go onHotkeyCallback()
			}
		}
		return 0
	}

	return win.DefWindowProc(hwnd, msg, wParam, lParam)
}

// StartClipboardListener creates a hidden message-only window that:
//   - Listens for clipboard changes, calling onChange (respects pause + ignore list)
//   - Listens for the Ctrl+Shift+V global hotkey, calling onHotkey
func StartClipboardListener(onChange func(), onHotkey func()) {
	onChangeCallback = onChange
	onHotkeyCallback = onHotkey

	go func() {
		// Win32 windows are thread-affine: the message queue belongs to the OS
		// thread that calls CreateWindowEx. Without this lock the Go scheduler
		// can migrate the goroutine to a different OS thread between
		// DispatchMessage and the next GetMessage, causing WM_CLIPBOARDUPDATE
		// and WM_HOTKEY to pile up in the original thread's queue forever.
		runtime.LockOSThread()

		for {
			runMessagePump()
			// runMessagePump should never return under normal operation.
			// If it does (e.g. GetMessage returns -1 on queue corruption),
			// wait briefly then rebuild the window/hotkey registration so
			// the app heals itself without requiring a Windows restart.
			time.Sleep(500 * time.Millisecond)
		}
	}()
}

// runMessagePump creates the hidden clipboard+hotkey window and runs the Win32
// message loop. It is called (and re-called on failure) from a goroutine that
// has already called runtime.LockOSThread().
func runMessagePump() {
	instance := win.GetModuleHandle(nil)
	className, _ := syscall.UTF16PtrFromString("ClipcatClipboardWindow")

	// RegisterClassEx is idempotent across watchdog restarts - if the class is
	// already registered (ERROR_CLASS_ALREADY_EXISTS = 1410) that is fine; we
	// can still create a new window with it.
	var wc win.WNDCLASSEX
	wc.CbSize = uint32(unsafe.Sizeof(wc))
	wc.LpfnWndProc = syscall.NewCallback(wndProc)
	wc.HInstance = instance
	wc.LpszClassName = className
	win.RegisterClassEx(&wc) // ignore error - class may already be registered

	hwnd := win.CreateWindowEx(
		0, className, nil, 0,
		0, 0, 0, 0,
		win.HWND_MESSAGE, // hidden message-only window
		0, instance, nil,
	)
	if hwnd == 0 {
		return // will be retried by the watchdog
	}

	if !win.AddClipboardFormatListener(hwnd) {
		win.DestroyWindow(hwnd)
		return // will be retried by the watchdog
	}

	// Ctrl+Shift+V global hotkey to show/hide Clipcat.
	// Retry with exponential backoff: another app (e.g. Windows Clipboard
	// History) may hold the registration briefly at startup.
	for i := range 5 {
		ret, _, _ := procRegisterHotKey.Call(uintptr(hwnd), hotkeyID, MOD_CONTROL|MOD_SHIFT, VK_V)
		if ret != 0 {
			break
		}
		// Unregister any stale registration from a previous run before retrying.
		procUnregisterHotKey.Call(uintptr(hwnd), hotkeyID)
		time.Sleep(time.Duration(1<<uint(i)) * time.Second)
	}

	var msg win.MSG
	for win.GetMessage(&msg, 0, 0, 0) > 0 {
		win.TranslateMessage(&msg)
		win.DispatchMessage(&msg)
	}

	// Clean up before the watchdog restarts the pump.
	// DestroyWindow also automatically removes the clipboard format listener.
	procUnregisterHotKey.Call(uintptr(hwnd), hotkeyID)
	win.DestroyWindow(hwnd)
}

// ReadText reads the current clipboard text. Uses gclip.Read which is safe
// on Windows (uses GetClipboardSequenceNumber, no risk of hanging).
func ReadText() string {
	return string(gclip.Read(gclip.FmtText))
}

// ReadImage reads the current clipboard image. Returns nil if no image.
func ReadImage() []byte {
	return gclip.Read(gclip.FmtImage)
}
