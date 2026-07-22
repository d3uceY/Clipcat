# Clipcat - System Tray Architecture

This note explains the system tray implementation across all platforms after migrating to the Wails v3 native `SystemTray` API.

---

## Current Status

All platforms now use the Wails v3 native `SystemTray` API (`app.SystemTray.New()`), replacing the previous mix of `getlantern/systray` (Windows/Linux) and custom Cocoa/AppKit bridge (macOS).

| Platform | Tray implementation          | Menu items                          |
| -------- | ---------------------------- | ----------------------------------- |
| macOS    | Wails v3 `SystemTray`        | Show Clipcat, Quit                  |
| Windows  | Wails v3 `SystemTray`        | Show Clipcat, Quick Paste, Pause Capture, Quit |
| Linux    | Wails v3 `SystemTray`        | Show Clipcat, Quit                  |

---

## Shared Tray Wiring

**Key files:**

- [tray_windows.go](../tray_windows.go) — Windows-specific (`_ "embed"` of `.ico`, full menu with Quick Paste & Pause checkboxes)
- [tray_other.go](../tray_other.go) — macOS + Linux (`SetTemplateIcon`, basic Show/Quit menu)
- [app.go](../app.go) — calls `a.startTray()` during `ServiceStartup`

Both platform files use the same Wails v3 pattern:

```go
systray := a.app.SystemTray.New()
systray.SetIcon(trayIcon)        // or SetTemplateIcon on macOS/Linux
systray.SetTooltip("...")        // Windows
systray.SetLabel("Clipcat")      // macOS/Linux
menu := a.app.NewMenu()
menu.Add("Show Clipcat").OnClick(...)
menu.AddSeparator()
menu.Add("Quit").OnClick(...)
systray.SetMenu(menu)
systray.AttachWindow(a.window)
```

The `AttachWindow` call enables automatic show/hide toggle on left-click and right-click context menu, all handled natively by Wails v3.

---

## Platform-Specific Details

### macOS

- Uses `SetTemplateIcon(trayIcon)` — renders as a template (black + transparent), adapts to light/dark mode automatically.
- `SetLabel("Clipcat")` sets the menu bar label next to the icon.
- `SetTemplateIcon` means the icon is treated as a macOS template image (black pixels become the system menu bar color).
- The previous custom Cocoa bridge (`backend/tray/tray_darwin.go`, `tray_darwin.m`) has been deleted.
- The `tray.Activate()` call in the hotkey path is replaced by `a.window.Focus()`.

### Windows

- Uses `SetIcon(trayIcon)` with a `.ico` file embedded via `//go:embed`.
- `SetTooltip("Clipcat – press Ctrl+Shift+V to open")` sets the hover tooltip (max 127 UTF-16 chars).
- Menu uses `AddCheckbox` for Quick Paste and Pause Capture toggle items.
- The `getlantern/systray` dependency has been removed from `go.mod`.

### Linux

- Uses `SetTemplateIcon(trayIcon)` and `SetLabel("Clipcat")`.
- The `getlantern/systray` dependency has been removed.
- Uses Wails v3's StatusNotifierItem implementation; support varies by desktop environment.

---

## Hotkey Path

When the global hotkey (Ctrl+Shift+V) fires, the `onHotkeyFired` callback in [app.go](../app.go):

1. Optionally repositions the window near the cursor (if cursor snap + quick paste are enabled).
2. Calls `a.window.Show()` + `a.window.Focus()` — no longer needs `tray.Activate()` since window focus is handled by Wails.
3. Restores the AlwaysOnTop preference.

---

## App Lifecycle

1. `main()` → optional macOS bundle relaunch → single-instance check.
2. Wails app starts with a hidden window.
3. `ServiceStartup` initializes DB, clipboard, focus tracking, and tray.
4. Window close is cancelled (hook on `WindowClosing`), window is hidden instead.
5. Tray icon keeps the app reachable; Quit in tray menu exits the app.
