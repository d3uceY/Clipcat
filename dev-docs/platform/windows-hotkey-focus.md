# Windows hotkey focus flow (Ctrl+Shift+V)

How pressing Ctrl+Shift+V brings the Clipcat window to the front on Windows,
end-to-end across every function involved.

---

## Background: the Windows foreground lock

Windows only allows an app to steal keyboard focus (call `SetForegroundWindow`)
if that process currently "holds the foreground lock". The lock is granted
automatically to the process that just received a user-input event such as a
global hotkey. If you try to call `SetForegroundWindow` from a goroutine that
runs after the message thread has moved on, Windows silently refuses and the
window flashes in the taskbar instead of coming to front.

The workaround is `AllowSetForegroundWindow(ASFW_ANY)`: when called by the
process that **currently** holds the lock, it grants a one-shot permission for
any process to call `SetForegroundWindow` once. Clipcat calls this on the
Win32 message thread immediately after receiving `WM_HOTKEY`, before spinning
up the goroutine that calls `WindowShow`.

---

## Component map

| File | Responsibility |
|------|----------------|
| `backend/lib/clipboard/listener_windows.go` | Creates the hidden Win32 window; registers the hotkey; runs the message loop |
| `backend/lib/clipboard/window_utils_windows.go` | Loads Win32 DLL procs; tracks the previous foreground window; calls `AllowSetForegroundWindow` |
| `app.go` `ServiceStartup()` | Receives the hotkey callback; calls `WindowShow` + `Focus` + `AlwaysOnTop` restore |

---

## Step-by-step flow

### 1. App startup - `StartClipboardListener` (`listener_windows.go`)

```go
StartClipboardListener(onChange func(), onHotkey func())
```

Spawns a dedicated OS thread goroutine (Go pins it via the message loop) that:

1. Registers a Win32 window class (`"ClipcatClipboardWindow"`).
2. Creates a **message-only window** (`HWND_MESSAGE` parent) - invisible,
   zero-size, just a message sink.
3. Calls `AddClipboardFormatListener` so clipboard changes arrive as
   `WM_CLIPBOARDUPDATE`.
4. Calls `RegisterHotKey(hwnd, 1, MOD_CONTROL|MOD_SHIFT, VK_V)` to claim the
   global `Ctrl+Shift+V` hotkey system-wide. If it fails (another app is
   holding the same combo), it retries up to 5 times with exponential backoff
   (1 s, 2 s, 4 s, 8 s, 16 s), calling `UnregisterHotKey` before each retry to
   clear any stale registration from a previous Clipcat run.
5. Enters `GetMessage` / `TranslateMessage` / `DispatchMessage` loop forever.

### 2. User presses Ctrl+Shift+V - `wndProc` receives `WM_HOTKEY`

```go
case WM_HOTKEY:
    if wParam == hotkeyID {
        capturePreviousWindow()   // ← must happen on THIS thread
        if onHotkeyCallback != nil {
            go onHotkeyCallback() // ← goroutine for everything else
        }
    }
```

This runs **synchronously on the message thread** - the thread that currently
holds the Windows foreground lock. Both actions before the goroutine is
spawned are intentional.

### 3. Snapshot + foreground unlock - `capturePreviousWindow` (`window_utils_windows.go`)

```go
func capturePreviousWindow() {
    hwnd, _, _ := procGetForegroundWindow.Call()
    if hwnd != 0 {
        var pid uint32
        procGetWindowThreadProcessId.Call(hwnd, uintptr(unsafe.Pointer(&pid)))
        if pid != 0 && pid != ourPID {
            prevHWND = hwnd   // remember the editor/browser the user was in
        }
    }
    const ASFW_ANY = 0xFFFFFFFF
    procAllowSetForegroundWindow.Call(ASFW_ANY)
}
```

Two things happen:

- **`prevHWND`** is updated with the window that had focus the instant the
  hotkey fired. This is used later when the user picks a clip and Clipcat
  pastes it back to their editor via `FocusPreviousWindow()` + `SimulatePaste()`.
- **`AllowSetForegroundWindow(ASFW_ANY)`** is called. Because this runs on
  the thread that received `WM_HOTKEY`, the foreground lock is still valid.
  The call hands a one-shot `SetForegroundWindow` permission to any process
  (including Clipcat's own Wails/WebView2 window). Without this, `WindowShow`
  would be blocked by Windows and the window would only flash in the taskbar.

There is also a background poller (`StartFocusTracker`) that updates `prevHWND`
every 150 ms, but `capturePreviousWindow` overwrites it with a more accurate
snapshot taken at the exact instant of the keypress, which is preferred.

### 4. Show Clipcat - hotkey callback in `app.go`

```go
a.window.Show()
a.window.Focus()
if alwaysOnTop, err := store.GetAlwaysOnTop(); err == nil {
    a.window.SetAlwaysOnTop(alwaysOnTop)
}
```

This runs in a goroutine (spawned in step 2). By now `AllowSetForegroundWindow`
has already been called on the message thread, so `Show` (which internally
calls `SetForegroundWindow` / `BringWindowToTop`) succeeds and the Clipcat
window actually takes focus.

- **`a.window.Show()`** - restores the window if minimised and brings it forward.
- **`a.window.Focus()`** - ensures keyboard focus lands on the webview.
- **`a.window.SetAlwaysOnTop`** - re-applies the user's stored AlwaysOnTop preference.

### 5. After the user picks a clip - `FocusPreviousWindow` + `SimulatePaste`

When a clip is selected for pasting, the app calls:

```go
clipboard.FocusPreviousWindow()  // SetForegroundWindow(prevHWND)
clipboard.SimulatePaste()        // keybd_event Ctrl+V after 80 ms
```

`prevHWND` is the handle captured in step 3 - the editor or browser the user
was in when they hit the hotkey.

---

## Why the old approach failed

The previous code was:

```go
runtime.WindowSetAlwaysOnTop(a.ctx, true)
time.Sleep(150 * time.Millisecond)
runtime.WindowSetAlwaysOnTop(a.ctx, false)
```

This tried to exploit the fact that `WS_EX_TOPMOST` windows bypass some
foreground restrictions. It failed for several reasons:

1. By the time the goroutine ran, the message thread had already processed more
   messages and the foreground lock had expired - `SetForegroundWindow` inside
   Wails was silently ignored.
2. `AlwaysOnTop` is a user preference. Toggling it and turning it off broke the
   window for any user who had it enabled.
3. The 150 ms `time.Sleep` was a guess and introduced visible jank.

---

## Win32 procs loaded (`window_utils_windows.go`)

| Proc | DLL | Purpose |
|------|-----|---------|
| `GetForegroundWindow` | user32 | Get the currently focused window handle |
| `SetForegroundWindow` | user32 | Bring a window to the front and give it focus |
| `GetWindowThreadProcessId` | user32 | Map a window handle to its owner PID |
| `RegisterHotKey` | user32 | Claim a system-wide hotkey combination |
| `UnregisterHotKey` | user32 | Release a registered hotkey (used in retry loop) |
| `keybd_event` | user32 | Simulate keyboard input for the paste operation |
| `AllowSetForegroundWindow` | user32 | Grant one-shot foreground permission to any process |
| `OpenProcess` / `CloseHandle` | kernel32 | Open a process handle for name lookup |
| `GetModuleBaseNameW` | psapi | Get the exe name of a process (ignore list matching) |
