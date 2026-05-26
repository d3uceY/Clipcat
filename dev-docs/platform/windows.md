# Windows — Platform Architecture

## Overview

The Windows build uses Win32 message-window APIs for both clipboard monitoring and global hotkey registration. All system calls go through `syscall.NewLazyDLL` — no external C code. The systray uses `github.com/getlantern/systray`. The installer is built with NSIS via `wails build -nsis`.

---

## Boot Sequence

```
main.go
  └─ EnsureSingleInstance()          // backend/platform/single_instance_windows.go
       └─ CreateMutex("ClipcatSingleInstance")
            ├─ Mutex already owned: FindWindow("ClipcatClipboardWindow") → show + exit
            └─ Mutex acquired: continue

  └─ wails.Run(...)                  // launch_other.go (no-op relaunch on Windows)
       └─ app.startup()              // app.go
            ├─ store.InitDB / migrations
            ├─ store.InitEncryption
            ├─ clipboard.SetIgnoredProcesses
            ├─ clipboard.SetOurProcessID(os.Getpid())
            ├─ clipboard.StartFocusTracker
            ├─ a.startTray()               // tray_windows.go → backend/tray/tray_windows.go
            └─ clipboard.StartClipboardListener(onChange, onHotkey)
```

---

## Clipboard Listener

**File:** `backend/lib/clipboard/listener_windows.go`

A single goroutine creates a hidden **message-only window** (`HWND_MESSAGE`) and processes its message pump. Two Win32 mechanisms are registered on that window:

### `WM_CLIPBOARDUPDATE` — clipboard monitoring

```
AddClipboardFormatListener(hwnd)
  └─ OS sends WM_CLIPBOARDUPDATE whenever clipboard content changes

wndProc(WM_CLIPBOARDUPDATE)
  ├─ isPaused?                   → drop
  ├─ isForegroundProcessIgnored? → drop
  └─ 150 ms debounce
       └─ onChangeCallback()     →  app.go reads clipboard, persists clip, emits event
```

The 150 ms debounce is enforced in the message handler itself using `lastClipboardChange` from `shared.go`.

### `WM_HOTKEY` — global Ctrl+Shift+V

```
RegisterHotKey(hwnd, id=1, MOD_CONTROL|MOD_SHIFT, VK_V)

wndProc(WM_HOTKEY, wParam=1)
  ├─ capturePreviousWindow()   ← snapshot before Clipcat steals focus
  └─ onHotkeyCallback()        →  app shows window, brings to front
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
| `isForegroundProcessIgnored()` | `GetForegroundWindow` → `GetWindowThreadProcessId` → `OpenProcess` → `GetModuleBaseNameW` |

### Paste flow

```
app.PasteToWindow(content)
  ├─ gclip.Write(FmtText, content)
  ├─ [ghost mode] runtime.WindowHide
  ├─ time.Sleep(80ms)
  ├─ clipboard.FocusPreviousWindow()   →  SetForegroundWindow(prevHWND)
  ├─ time.Sleep(100ms)
  └─ clipboard.SimulatePaste()         →  keybd_event Ctrl+V sequence
```

### Process name resolution

```
GetForegroundWindow()
  └─ GetWindowThreadProcessId → pid
       └─ OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ)
            └─ GetModuleBaseNameW → "1password.exe"
                 └─ lowercased, compared against ignore list
```

---

## System Tray

**Files:** `tray_windows.go`, `backend/tray/tray_windows.go`

`tray_windows.go` (root) embeds the `.ico` from `build/windows/` and calls `tray.Start(iconBytes, showFn, quitFn)`. The `showFn` calls `runtime.WindowShow`; `quitFn` calls `runtime.Quit`.

`backend/tray/tray_windows.go` runs `systray.Run` on a new goroutine, sets the icon/tooltip, and adds **Show** and **Quit** menu items.

`Activate()` is a no-op on Windows (`tray_other_activation.go`).

---

## Single Instance

**File:** `backend/platform/single_instance_windows.go`

1. `CreateMutex(nil, false, "ClipcatSingleInstance")` — if `GetLastError()` returns `ERROR_ALREADY_EXISTS`, another instance is running.
2. Finds the hidden clipboard window by class name `"ClipcatClipboardWindow"` via `FindWindow`.
3. Calls `ShowWindow(SW_RESTORE)` + `SetForegroundWindow` to bring the existing instance to the front.
4. `os.Exit(0)`.

---

## Autostart

**File:** `backend/lib/startup/startup_windows.go`

Uses PowerShell's `WScript.Shell` COM object to create / remove a `.lnk` shortcut in the user's `Startup` folder (`shell:startup`).

```
EnableStartup:  New-Object -ComObject WScript.Shell → CreateShortcut → .Save()
DisableStartup: Remove-Item "$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\Clipcat.lnk"
IsStartupEnabled: Test-Path of the same .lnk
```

---

## Build & Installer

- `wails build -nsis -o Clipcat-windows-amd64` produces both a portable `.exe` and an NSIS-based installer (`*-installer.exe`).
- NSIS script lives in `build/windows/installer/project.nsi`.
- `build/windows/wails.exe.manifest` declares DPI-awareness and UAC level.
- `build/windows/info.json` populates the PE version resource (company, product, copyright).
