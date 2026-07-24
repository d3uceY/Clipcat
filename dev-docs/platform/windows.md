# Windows - Platform Architecture

## Overview

The Windows build uses Win32 message-window APIs for both clipboard monitoring and global hotkey registration. All system calls go through `syscall.NewLazyDLL` - no external C code. The system tray uses the Wails v3 native `SystemTray` API.

---

## Boot Sequence

```
main.go
  └─ EnsureSingleInstance()          // backend/platform/single_instance_windows.go
       └─ CreateMutex("ClipcatSingleInstance")
            ├─ Mutex already owned: FindWindow("ClipcatClipboardWindow") -> show + exit
            └─ Mutex acquired: continue

  └─ wails.Run(...)                  // launch_other.go (no-op relaunch on Windows)
       └─ app.startup()              // app.go
            ├─ store.InitDB / migrations
            ├─ store.InitEncryption
            ├─ clipboard.SetIgnoredProcesses
            ├─ clipboard.SetOurProcessID(os.Getpid())
            ├─ clipboard.StartFocusTracker
            ├─ a.startTray()               // tray_windows.go -> Wails v3 SystemTray
            └─ clipboard.StartClipboardListener(onChange, onHotkey)
```

---

## Clipboard Listener

**File:** `backend/lib/clipboard/listener_windows.go`

A single goroutine creates a hidden **message-only window** (`HWND_MESSAGE`) and processes its message pump. Two Win32 mechanisms are registered on that window:

### `WM_CLIPBOARDUPDATE` - clipboard monitoring

```
AddClipboardFormatListener(hwnd)
  └─ OS sends WM_CLIPBOARDUPDATE whenever clipboard content changes

wndProc(WM_CLIPBOARDUPDATE)
  ├─ isPaused?                   -> drop
  ├─ isForegroundProcessIgnored? -> drop
  └─ 150 ms debounce
       └─ onChangeCallback()     ->  app.go reads clipboard, persists clip, emits event
```

The 150 ms debounce is enforced in the message handler itself using `lastClipboardChange` from `shared.go`.

### `WM_HOTKEY` - global Ctrl+Shift+V

```
RegisterHotKey(hwnd, id=1, MOD_CONTROL|MOD_SHIFT, VK_V)

wndProc(WM_HOTKEY, wParam=1)
  ├─ capturePreviousWindow()   <- snapshot before Clipcat steals focus
  └─ onHotkeyCallback()        ->  app shows window, brings to front
```

The message window class name `"ClipcatClipboardWindow"` is also used by the single-instance guard to find an already-running instance.

---

## Window Tracking & Paste

**File:** `backend/lib/clipboard/window_utils_windows.go`

All system calls use lazily-loaded DLL procs from `user32.dll`, `kernel32.dll`, and `psapi.dll`.

| Function | Win32 API |
|---|---|
| `SetOurProcessID(pid)` | Stores PID; poller ignores windows owned by this PID |
| `StartFocusTracker()` | `GetForegroundWindow` every 150 ms; skips own PID |
| `capturePreviousWindow()` | Immediate `GetForegroundWindow` on hotkey fire |
| `HasPreviousWindow()` | `prevHWND != 0` |
| `FocusPreviousWindow()` | `SetForegroundWindow(prevHWND)` |
| `SimulatePaste()` | `keybd_event(VK_CONTROL down, VK_V down/up, VK_CONTROL up)` |
| `isForegroundProcessIgnored()` | `GetForegroundWindow` -> `GetWindowThreadProcessId` -> `OpenProcess` -> `GetModuleBaseNameW` |
| `GetCursorPos()` | `GetCursorPos` - returns the current cursor screen position (physical pixels) |

### Paste flow

```
app.PasteToWindow(content)
  ├─ gclip.Write(FmtText, content)
  ├─ [ghost mode] runtime.WindowHide
  ├─ time.Sleep(80ms)
  ├─ clipboard.FocusPreviousWindow()   ->  SetForegroundWindow(prevHWND)
  ├─ time.Sleep(100ms)
  └─ clipboard.SimulatePaste()         ->  keybd_event Ctrl+V sequence
```

---

### Smart Position (cursor-aware window placement)

**Setting:** `cursor_snap` in the `settings` table (default 1/on).  
**Active only when:** both `cursor_snap` and `quick_paste` are enabled.

When the global hotkey fires, before `Show` is called, `app.go`'s `onHotkeyFired`:

1. Reads the current cursor position via `clipboard.GetCursorPos()` - **physical** (native) pixels, from raw Win32 `GetCursorPos`.
2. Finds the monitor containing that point via `application.ScreenNearestPhysicalPoint()` (Wails v3's own `ScreenManager`) and converts the physical cursor point to **DIP** via `application.PhysicalToDipPoint()`, using that same monitor's scale factor.
3. Reads that monitor's `WorkArea` (already DIP, taskbar excluded) directly from the returned `*application.Screen`.
4. Calls `winpos.CalcWindowPos` (`backend/lib/winpos/winpos.go`) entirely in DIP - cursor point, monitor work area, and the window's own `Width()/Height()` (also DIP) - to compute an ideal position: below-right of the cursor, flipped when a screen edge would be clipped, then hard-clamped to stay fully inside the monitor's work area.
5. Passes the result directly to `a.window.SetPosition(x, y)`, which Wails v3 treats as absolute DIP coordinates.

#### Why the naive port from Wails v2 was broken

The first attempt at porting this feature just called `clipboard.GetMonitorBoundsAt(cx, cy)` (a custom Win32 `MonitorFromPoint` + `GetMonitorInfoW` helper, returning **physical** pixels) and passed the result straight into `CalcWindowPos` alongside `a.window.Width()/Height()`, which Wails v3 always reports in **DIP**. Mixing physical and DIP units is harmless at 100% scaling (they're numerically identical) but produces a bogus position on any monitor with a scale factor other than 100% - explaining the reported symptoms: the window appearing outside the monitor the cursor was on, or far from the cursor, especially in multi-monitor setups where screens have different scale factors.

Wails v3's own `application.PhysicalToDipPoint` / `ScreenNearestPhysicalPoint` (`pkg/application/screenmanager.go`) already do this conversion correctly per-monitor - picking the screen whose bounds contain the point and using *that* screen's `ScaleFactor`. Once cursor position, monitor work area, and window size are all in the same unit (DIP), `a.window.SetPosition` places the window in the correct spot on the correct monitor every time. The old `GetMonitorBoundsAt` and `GetWindowMonitorWorkOrigin` Win32 helpers (a leftover from the Wails v2 `winc` backend, which needed an origin-offset workaround) have been removed as dead code - Wails v3's `ScreenManager` supersedes them entirely.

### Process name resolution

```
GetForegroundWindow()
  └─ GetWindowThreadProcessId -> pid
       └─ OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ)
            └─ GetModuleBaseNameW -> "1password.exe"
                 └─ lowercased, compared against ignore list
```

---

## System Tray

**File:** `tray_windows.go`

Uses the Wails v3 native `SystemTray` API. Embeds the `.ico` from `build/windows/` and creates a menu with Show, Quick Paste (checkbox), Pause Capture (checkbox), and Quit items. The window is attached so left-click toggles visibility.

The previous `getlantern/systray` dependency has been removed.

---

## Single Instance

**File:** `backend/platform/single_instance_windows.go`

1. `CreateMutex(nil, false, "ClipcatSingleInstance")` - if `GetLastError()` returns `ERROR_ALREADY_EXISTS`, another instance is running.
2. Finds the hidden clipboard window by class name `"ClipcatClipboardWindow"` via `FindWindow`.
3. Calls `ShowWindow(SW_RESTORE)` + `SetForegroundWindow` to bring the existing instance to the front.
4. `os.Exit(0)`.

---

## Autostart

**File:** `backend/lib/startup/startup_windows.go`

Uses PowerShell's `WScript.Shell` COM object to create / remove a `.lnk` shortcut in the user's `Startup` folder (`shell:startup`).

```
EnableStartup:  New-Object -ComObject WScript.Shell -> CreateShortcut -> .Save()
DisableStartup: Remove-Item "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\Clipcat.lnk"
IsStartupEnabled: Test-Path of the same .lnk
```

---

## Build & Installer

- `wails build -nsis -o Clipcat-windows-amd64` produces both a portable `.exe` and an NSIS-based installer (`*-installer.exe`).
- NSIS script lives in `build/windows/installer/project.nsi`.
- `build/windows/wails.exe.manifest` declares DPI-awareness and UAC level.
- `build/windows/info.json` populates the PE version resource (company, product, copyright).
