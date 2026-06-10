//go:build windows

package clipboard

import (
	"syscall"
	"time"
	"unsafe"

	"github.com/lxn/win"
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
		instance := win.GetModuleHandle(nil)
		className, _ := syscall.UTF16PtrFromString("ClipcatClipboardWindow")

		var wc win.WNDCLASSEX
		wc.CbSize = uint32(unsafe.Sizeof(wc))
		wc.LpfnWndProc = syscall.NewCallback(wndProc)
		wc.HInstance = instance
		wc.LpszClassName = className

		if win.RegisterClassEx(&wc) == 0 {
			panic("clipboard: failed to register window class")
		}

		hwnd := win.CreateWindowEx(
			0, className, nil, 0,
			0, 0, 0, 0,
			win.HWND_MESSAGE, // hidden message-only window
			0, instance, nil,
		)
		if hwnd == 0 {
			panic("clipboard: failed to create message window")
		}

		if !win.AddClipboardFormatListener(hwnd) {
			panic("clipboard: failed to register clipboard format listener")
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
	}()
}
