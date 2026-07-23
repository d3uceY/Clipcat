# Linux - Platform Architecture

## Overview

The Linux build relies on **X11** for the global hotkey and `xdotool` for window tracking and paste simulation. Clipboard monitoring uses the cross-platform `golang.design/x/clipboard` watcher. The system tray uses the Wails v3 native `SystemTray` API.

---

## Boot Sequence

```
main.go
  └─ EnsureSingleInstance()          // backend/platform/single_instance_linux.go
       └─ PID lock file in ~/.cache/clipcat/clipcat.lock
            ├─ If stale: overwrite and continue
            └─ If live:  wmctrl -a Clipcat  ->  exit

  └─ wails.Run(...)                  // launch_other.go (no-op relaunch on Linux)
       └─ app.startup()              // app.go
            ├─ store.InitDB / migrations
            ├─ store.InitEncryption
            ├─ clipboard.SetIgnoredProcesses
            ├─ clipboard.SetOurProcessID   // no-op on Linux
            ├─ clipboard.StartFocusTracker
            ├─ a.startTray()               // tray_other.go -> Wails v3 SystemTray
            └─ clipboard.StartClipboardListener(onChange, onHotkey)
```

---

## Clipboard Listener

**File:** `backend/lib/clipboard/listener_linux.go`

Two goroutines are launched inside `StartClipboardListener`:

### 1. X11 Hotkey goroutine

```
initX11Hotkey()          // x11_hotkey_linux.c
  └─ XOpenDisplay
  └─ XGrabKey(Ctrl+Shift+V on root window)
  └─ XSelectInput(KeyPressMask)

runX11EventLoop()        // blocks forever
  └─ XNextEvent loop
       └─ KeyPress + Ctrl+Shift+V match
            └─ linuxHotkeyFired()   ← exported Go callback
                 ├─ capturePreviousAppLinux()
                 └─ onHotkeyCallback()  ->  app shows window
```

If `XOpenDisplay` fails (Wayland session without XWayland), the goroutine returns silently and the app continues working via the tray icon.

#### Why a separate C file?

CGo includes the preamble comment into **every** generated `.c` translation unit. Defining `initX11Hotkey` and `runX11EventLoop` directly in the preamble causes duplicate-symbol linker errors. Moving the implementation to `x11_hotkey_linux.c` means CGo compiles it once as a regular object file.

### 2. Clipboard watcher goroutine

```
gclip.Watch(ctx, FmtText)   \
gclip.Watch(ctx, FmtImage)   ├─ select loop
                              |    └─ shouldSkip()  ->  isPaused || isForegroundProcessIgnored()
                              └─    fireChange()    ->  150 ms debounce -> onChangeCallback()
```

`shouldSkip` and `fireChange` are defined locally in `listener_linux.go` (they mirror the macOS helpers - each platform file must define its own copy because Go build tags mean they live in separate compilation units).

---

## Window Tracking & Paste

**File:** `backend/lib/clipboard/window_utils_linux.go`

| Function | Mechanism |
|---|---|
| `StartFocusTracker()` | Polls `xdotool getactivewindow` every 150 ms; stores last seen window ID |
| `capturePreviousAppLinux()` | Immediate snapshot on hotkey fire |
| `HasPreviousWindow()` | Returns whether `prevWindowID` is non-empty |
| `FocusPreviousWindow()` | `xdotool windowactivate <id>` |
| `SimulatePaste()` | `xdotool key ctrl+v` (after 80 ms sleep) |
| `isForegroundProcessIgnored()` | Reads PID via `xdotool getactivewindow getwindowpid`, then `/proc/<pid>/comm` |
| `GetCursorPos()` | `xdotool getmouselocation --shell` - parses `X=` / `Y=` from output |

Smart Position (see `windows.md` for the full write-up) converts this physical cursor point to DIP and finds the containing monitor's work area via Wails v3's own `application.ScreenNearestPhysicalPoint` / `PhysicalToDipPoint` - no Linux-specific monitor-bounds helper is needed.

### Paste flow

```
app.PasteToWindow(content)
  ├─ gclip.Write(FmtText, content)
  ├─ [ghost mode] runtime.WindowHide
  ├─ time.Sleep(80ms)
  ├─ clipboard.FocusPreviousWindow()   ->  xdotool windowactivate
  ├─ time.Sleep(100ms)
  └─ clipboard.SimulatePaste()         ->  xdotool key ctrl+v
```

---

## System Tray

**File:** `tray_other.go`

Uses the Wails v3 native `SystemTray` API with `SetTemplateIcon` and `SetLabel`. Sets up a menu with **Show** and **Quit** items. The window is attached so left-click toggles visibility and right-click shows the menu.

The previous `getlantern/systray` dependency has been removed.

---

## Single Instance

**File:** `backend/platform/single_instance_linux.go`

1. Creates `~/.cache/clipcat/clipcat.lock` containing the current PID.
2. On startup, if the file exists: reads the PID, sends signal 0 (`kill -0`) to check liveness.
   - Dead PID -> overwrite lock file, continue.
   - Live PID -> runs `wmctrl -a Clipcat` to bring the existing window front, then `os.Exit(0)`.

---

## Autostart

**File:** `backend/lib/startup/startup_linux.go`

Writes / removes `~/.config/autostart/clipcat.desktop`. The `.desktop` file uses `Exec=` pointing at the current executable path.

---

## Build Requirements

| Dependency | Purpose |
|---|---|
| `libgtk-3-dev` | Wails WebView |
| `libwebkit2gtk-4.1-dev` | Wails WebView |
| `libX11-dev` (transitive) | X11 hotkey via CGo |
| `xdotool` (runtime) | Window focus tracking and paste simulation |
| `wmctrl` (runtime) | Single-instance window activation |

Build tag used in CI: `-tags webkit2gtk_4_1`
