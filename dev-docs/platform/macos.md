# macOS - Platform Architecture

## Overview

The macOS build uses the **Carbon** framework for the global hotkey, **CoreGraphics CGEvents** for synthetic paste, **osascript** for app tracking, and a native **NSStatusItem** menu bar icon written in Objective-C. Because Wails wraps a WebKit `WKWebView` inside a Cocoa window, the app must always be launched inside an `.app` bundle - a special relaunch shim handles the terminal-launch edge case.

---

## Boot Sequence

```
main.go
  └─ prepareDarwinBundleLaunch()     // launch_darwin.go
       └─ If argv[0] is a bare binary (not inside .app/Contents/MacOS/):
            └─ exec.Command("open", "-n", bundlePath)  ->  exit current process
            (Ensures Cocoa / Carbon event loop is properly initialized)

  └─ EnsureSingleInstance()          // backend/platform/single_instance_darwin.go
       └─ PID lock file in ~/Library/Caches/clipcat/clipcat.lock
            ├─ Stale PID: overwrite, continue
            └─ Live PID:  osascript -> activate Clipcat -> os.Exit(0)

  └─ wails.Run(...)
       └─ app.startup()              // app.go
            ├─ store.InitDB / migrations
            ├─ store.InitEncryption
            ├─ clipboard.SetIgnoredProcesses
            ├─ clipboard.SetOurProcessID(os.Getpid())   // detects own bundle ID
            ├─ clipboard.StartFocusTracker
            ├─ a.startTray()               // tray_other.go -> Wails v3 SystemTray
            └─ clipboard.StartClipboardListener(onChange, onHotkey)
```

---

## Bundle Relaunch Shim

**File:** `launch_darwin.go`

On macOS, Carbon hotkeys and the `NSStatusItem` menu bar icon only work correctly when the process is running inside an `.app` bundle with a proper `NSApplication` event loop. If Clipcat is launched directly from the terminal (e.g. `./Clipcat`), the shim detects that `argv[0]` is not under `.app/Contents/MacOS/`, then uses `open -n <bundle>` to relaunch into the bundle context and immediately exits. This is transparent to the user.

---

## Clipboard Listener

**File:** `backend/lib/clipboard/listener_darwin.go`  
**C implementation:** `backend/lib/clipboard/clipboard_darwin.c`

### Global hotkey - Carbon

```
C.registerDarwinHotkey()          // clipboard_darwin.c (called after 500ms delay)
  └─ InstallApplicationEventHandler(hotkeyHandler)
  └─ RegisterEventHotKey(kVK_ANSI_V, controlKey|shiftKey, id='CLIP'/1)

hotkeyHandler (C callback)
  └─ darwinHotkeyFired()          ← exported Go callback
       ├─ capturePreviousAppDarwin()
       └─ onHotkeyCallback()       ->  app shows window

unregisterDarwinHotkey()          // called on shutdown
```

The 500 ms startup delay lets `NSApplication` finish its run-loop setup before Carbon registration, preventing rare crashes. The call is wrapped in `recover()` so a hotkey failure never brings down the app.

### Clipboard watcher goroutine

```
gclip.Watch(ctx, FmtText)   \
gclip.Watch(ctx, FmtImage)   ├─ select loop
                              |    └─ shouldSkip()  ->  isPaused || isForegroundProcessIgnored()
                              └─    fireChange()    ->  150 ms debounce -> onChangeCallback()
```

`shouldSkip` and `fireChange` are defined in `listener_darwin.go` (each platform file owns its own copy; they cannot live in `shared.go` because of build tag isolation).

---

## Window / App Tracking & Paste

**File:** `backend/lib/clipboard/window_utils_darwin.go`  
**C implementation (paste):** `backend/lib/clipboard/clipboard_darwin.c`

macOS tracks the **bundle ID** of the frontmost app rather than a window handle.

| Function | Mechanism |
|---|---|
| `SetOurProcessID(pid)` | Runs `osascript` to get our own bundle ID; stores in `ourBundleID` |
| `StartFocusTracker()` | Polls `getForegroundAppNameDarwin()` every 300 ms; skips Clipcat |
| `capturePreviousAppDarwin()` | Immediate snapshot on hotkey fire |
| `HasPreviousWindow()` | `prevAppBundleID != ""` |
| `FocusPreviousWindow()` | `open -b <bundleID>` |
| `SimulatePaste()` | `C.sendPasteDarwin()` - CGEvent Cmd+V |
| `isForegroundProcessIgnored()` | `getForegroundAppNameDarwin()` (osascript bundle ID) vs ignore list |
| `GetCursorPos()` | CGo `clipcat_cursor_pos` in `winpos_darwin.c` - `CGEventCreate(NULL)` -> `CGEventGetLocation` |

Smart Position (see `windows.md` for the full write-up) converts this physical cursor point to DIP and finds the containing monitor's work area via Wails v3's own `application.ScreenNearestPhysicalPoint` / `PhysicalToDipPoint` - no macOS-specific monitor-bounds helper is needed.

### Own-app detection

```
detectOwnBundleID()
  1. CLIPCAT_BUNDLE_ID env var
  2. osascript: bundle identifier of process with our unix id
  3. Fallback: "clipcat-<pid>"

isOurOwnApp(name)
  └─ exact bundle ID match  OR  contains "clipcat"  OR  contains "com.wails."
```

### Synthetic paste (CGEvent)

```
sendPasteDarwin()             // clipboard_darwin.c
  └─ usleep(80ms)
  └─ CGEventSourceCreate(kCGEventSourceStateHIDSystemState)
  └─ CGEventPost: Cmd↓ -> V↓ -> V↑ -> Cmd↑
```

Requires **Accessibility** permission in System Settings -> Privacy & Security -> Accessibility. Without it, `CGEventPost` silently does nothing.

### Paste flow

```
app.PasteToWindow(content)
  ├─ gclip.Write(FmtText, content)
  ├─ [ghost mode] runtime.WindowHide
  ├─ time.Sleep(80ms)
  ├─ clipboard.FocusPreviousWindow()   ->  open -b <bundleID>
  ├─ time.Sleep(100ms)
  └─ clipboard.SimulatePaste()         ->  CGEvent Cmd+V
```

---

## System Tray (Menu Bar)

**Files:** `tray_other.go`

The tray is implemented entirely via the Wails v3 `SystemTray` API:

```go
systray := a.app.SystemTray.New()
systray.SetTemplateIcon(trayIcon)    // adapts to light/dark mode
systray.SetLabel("Clipcat")          // menu bar label
menu := a.app.NewMenu()
menu.Add("Show Clipcat").OnClick(...)
menu.Add("Quit").OnClick(...)
systray.SetMenu(menu)
systray.AttachWindow(a.window)
```

`AttachWindow` handles left-click show/hide toggle and right-click context menu automatically. The previous custom Cocoa bridge (`backend/tray/`) has been deleted.

The hotkey path calls `a.window.Show()` + `a.window.Focus()` directly - no separate activation call is needed.

---

## Single Instance

**File:** `backend/platform/single_instance_darwin.go`

1. Creates `~/Library/Caches/clipcat/clipcat.lock` containing the current PID.
2. If the file exists: reads PID, sends signal 0 to check liveness.
   - Dead -> overwrite lock, continue.
   - Live -> `osascript: tell application "Clipcat" to activate` -> `os.Exit(0)`.

---

## Autostart

**File:** `backend/lib/startup/startup_darwin.go`

Writes / removes a LaunchAgent plist at `~/Library/LaunchAgents/com.clipcat.app.plist`:

```
EnableStartup:
  1. Write plist (RunAtLoad=true, path to .app executable)
  2. launchctl load ~/Library/LaunchAgents/com.clipcat.app.plist

DisableStartup:
  1. launchctl unload ...
  2. os.Remove(plistPath)

IsStartupEnabled: os.Stat(plistPath) != nil
```

---

## Build Notes

- `wails build -platform darwin/arm64` and `-platform darwin/amd64` are run separately; each produces a `.app` bundle.
- DMG packaging uses `hdiutil create -format UDZO`.
- The app is **not code-signed or notarized** in the open-source CI build. Users may need to right-click -> Open on first launch.
- `Info.plist` (`build/darwin/Info.plist`) declares `NSAppleEventsUsageDescription` and `NSAccessibilityUsageDescription` for the permissions Clipcat requires.
