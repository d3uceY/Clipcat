# Linux — Platform Architecture

## Overview

The Linux build relies on **X11** for the global hotkey and `xdotool` for window tracking and paste simulation. Clipboard monitoring uses the cross-platform `golang.design/x/clipboard` watcher. The systray uses `github.com/getlantern/systray` backed by `libayatana-appindicator3`.

---

## Boot Sequence

```
main.go
  └─ EnsureSingleInstance()          // backend/platform/single_instance_linux.go
       └─ PID lock file in ~/.cache/clipcat/clipcat.lock
            ├─ If stale: overwrite and continue
            └─ If live:  wmctrl -a Clipcat  →  exit

  └─ wails.Run(...)                  // launch_other.go (no-op relaunch on Linux)
       └─ app.startup()              // app.go
            ├─ store.InitDB / migrations
            ├─ store.InitEncryption
            ├─ clipboard.SetIgnoredProcesses
            ├─ clipboard.SetOurProcessID   // no-op on Linux
            ├─ clipboard.StartFocusTracker
            ├─ a.startTray()               // tray_other.go → backend/tray/tray_linux.go
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
                 └─ onHotkeyCallback()  →  app shows window
```

If `XOpenDisplay` fails (Wayland session without XWayland), the goroutine returns silently and the app continues working via the tray icon.

#### Why a separate C file?

CGo includes the preamble comment into **every** generated `.c` translation unit. Defining `initX11Hotkey` and `runX11EventLoop` directly in the preamble causes duplicate-symbol linker errors. Moving the implementation to `x11_hotkey_linux.c` means CGo compiles it once as a regular object file.

### 2. Clipboard watcher goroutine

```
gclip.Watch(ctx, FmtText)   \
gclip.Watch(ctx, FmtImage)   ├─ select loop
                              |    └─ shouldSkip()  →  isPaused || isForegroundProcessIgnored()
                              └─    fireChange()    →  150 ms debounce → onChangeCallback()
```

`shouldSkip` and `fireChange` are defined locally in `listener_linux.go` (they mirror the macOS helpers — each platform file must define its own copy because Go build tags mean they live in separate compilation units).

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

### Paste flow

```
app.PasteToWindow(content)
  ├─ gclip.Write(FmtText, content)
  ├─ [ghost mode] runtime.WindowHide
  ├─ time.Sleep(80ms)
  ├─ clipboard.FocusPreviousWindow()   →  xdotool windowactivate
  ├─ time.Sleep(100ms)
  └─ clipboard.SimulatePaste()         →  xdotool key ctrl+v
```

---

## System Tray

**File:** `backend/tray/tray_linux.go`

Uses `github.com/getlantern/systray` (requires `libayatana-appindicator3-dev` at build time). Sets up a status icon with **Show** and **Quit** menu items. `Activate()` is a no-op on Linux (`tray_other_activation.go`).

Root-level `tray_other.go` embeds the icon bytes and wires the systray callbacks to `runtime.WindowShow` / `runtime.Quit`.

---

## Single Instance

**File:** `backend/platform/single_instance_linux.go`

1. Creates `~/.cache/clipcat/clipcat.lock` containing the current PID.
2. On startup, if the file exists: reads the PID, sends signal 0 (`kill -0`) to check liveness.
   - Dead PID → overwrite lock file, continue.
   - Live PID → runs `wmctrl -a Clipcat` to bring the existing window front, then `os.Exit(0)`.

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
| `libayatana-appindicator3-dev` | systray (`ayatana-appindicator3-0.1` pkg-config) |
| `libX11-dev` (transitive) | X11 hotkey via CGo |
| `xdotool` (runtime) | Window focus tracking and paste simulation |
| `wmctrl` (runtime) | Single-instance window activation |

Build tag used in CI: `-tags webkit2gtk_4_1`
