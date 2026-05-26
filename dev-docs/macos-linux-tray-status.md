# Clipcat — macOS and Linux Tray Status

This note explains how the app currently behaves on macOS and Linux, how the tray integration is wired on each platform, and what work has already been done on the macOS side.

This is a status document, not a claim that the macOS tray issue is solved. The current user report is that the macOS tray is still not working reliably.

---

## Scope

- Covers the current tray and hide-to-background behavior on macOS and Linux
- Records the implementation split between the two platforms
- Captures the macOS-specific work already done so future debugging starts with the right context
- Does not cover the Windows tray path in detail

---

## Current Status

| Platform            | Tray implementation                        | Current status                      | Notes                                                                   |
| ------------------- | ------------------------------------------ | ----------------------------------- | ----------------------------------------------------------------------- |
| macOS               | Custom Cocoa/AppKit tray bridge            | Unstable; currently reported broken | Uses native `NSStatusItem` code outside Wails runtime helpers           |
| Linux               | `getlantern/systray`                       | Simpler path; expected baseline     | Uses a standard Go systray loop with Show/Quit menu items               |
| Shared app behavior | Wails window + shared `startTray()` wiring | Working as designed                 | Window hides on close and is expected to remain reachable from the tray |

---

## High-Level App Lifecycle

Relevant files:

- [main.go](../main.go)
- [app.go](../app.go)
- [tray_other.go](../tray_other.go)

The shared app lifecycle is:

1. `main()` optionally normalizes macOS bundle launch behavior.
2. Single-instance protection runs.
3. Wails starts with `HideWindowOnClose: true`.
4. `App.startup()` initializes the database, clipboard, focus tracking, and tray.
5. The tray is expected to keep the app reachable after the window is hidden.

The important shared design point is in [main.go](../main.go): the app does not quit when the window closes. It hides instead. That means tray behavior is not optional on macOS and Linux; it is part of the normal lifecycle.

---

## Shared Tray Wiring

Relevant files:

- [tray_other.go](../tray_other.go)
- [app.go](../app.go)

The shared Go-side tray entrypoint lives in [tray_other.go](../tray_other.go). On non-Windows builds it calls the platform-specific `tray.Start(...)` implementation with two callbacks:

- `Show Clipcat`: shows the Wails window and briefly toggles always-on-top so it comes forward
- `Quit`: exits the app through `runtime.Quit(...)`

At startup, [app.go](../app.go) calls `a.startTray()` before the clipboard listener begins. The hotkey path also calls `tray.Activate()` before showing the window, which matters on macOS and is a no-op on non-Darwin builds.

---

## Why macOS Is Different

Relevant files:

- [go.mod](../go.mod)
- [backend/tray/tray_darwin.go](../backend/tray/tray_darwin.go)
- [backend/tray/tray_darwin.m](../backend/tray/tray_darwin.m)

This repository is on Wails v2.12.0, but the tray implementation on macOS is not handled by a shared Wails tray abstraction inside this codebase. Instead, the project carries a custom native bridge:

- Go calls into Objective-C from [backend/tray/tray_darwin.go](../backend/tray/tray_darwin.go)
- Native AppKit code creates the menu bar item in [backend/tray/tray_darwin.m](../backend/tray/tray_darwin.m)

That means the macOS tray depends on manual coordination between:

- the Wails app lifecycle
- `NSApp` activation state
- custom `NSStatusItem` creation timing
- native-to-Go callbacks for Show/Quit

Linux does not carry this complexity.

---

## Why Not Wails v3 Yet

Relevant files:

- [go.mod](../go.mod)
- [backend/tray/tray_darwin.go](../backend/tray/tray_darwin.go)
- [backend/tray/tray_darwin.m](../backend/tray/tray_darwin.m)

Earlier investigation identified Wails v3 as the version that could potentially simplify the macOS status bar path. In practical terms, that means v3 was treated as the version that might remove some of the custom native tray work that is necessary on Wails v2.

However, that was not used as the immediate fix for Clipcat because:

- this project is currently on Wails v2.12.0
- the app needed a working path on the current codebase, not a framework migration first
- Wails v3 was still in development, so it was not the pragmatic dependency to bet the macOS tray behavior on

So the decision at the time was:

- keep the app on Wails v2
- retain the custom macOS Cocoa tray bridge
- treat Wails v3 as future-looking, not as the current production fix

This matters because future debugging should not assume the custom Darwin tray code is accidental or unnecessary. On the current Wails v2 codebase, it is the implementation that carries the macOS tray behavior.

---

## macOS Implementation

Relevant files:

- [main.go](../main.go)
- [launch_darwin.go](../launch_darwin.go)
- [app.go](../app.go)
- [backend/tray/tray_darwin.go](../backend/tray/tray_darwin.go)
- [backend/tray/tray_darwin.m](../backend/tray/tray_darwin.m)

### Expected macOS flow

1. [main.go](../main.go) calls `prepareDarwinBundleLaunch()` before single-instance logic.
2. [launch_darwin.go](../launch_darwin.go) detects when the inner `.app/Contents/MacOS/Clipcat` binary was launched from a shell and reopens the `.app` bundle with `open -n`.
3. Wails starts with `HideWindowOnClose: true`.
4. [app.go](../app.go) calls `a.startTray()` during startup.
5. [backend/tray/tray_darwin.go](../backend/tray/tray_darwin.go) forwards tray creation into Objective-C.
6. [backend/tray/tray_darwin.m](../backend/tray/tray_darwin.m) waits for `NSApplicationDidBecomeActive`, then creates an `NSStatusItem` and menu.
7. If activation does not arrive in time, a 1-second fallback still attempts tray creation.
8. When the user triggers Show from the tray or the global hotkey path, `activateApp()` runs before the Wails window is shown.

### What was already done on macOS

The current codebase already contains several macOS-specific stabilization changes:

1. Bundle relaunch guard.
   [launch_darwin.go](../launch_darwin.go) tries to reopen the real `.app` bundle when the inner Mach-O binary is launched from Terminal. This exists because app lifecycle behavior on macOS differs when the binary is launched outside the bundle flow.

2. Delayed tray creation.
   [backend/tray/tray_darwin.m](../backend/tray/tray_darwin.m) no longer creates the status item immediately. It waits for `NSApplicationDidBecomeActive` and only then calls `createTrayWhenReady()`.

3. Fallback tray creation.
   The same file also schedules a 1-second fallback so tray creation is attempted even if the activation notification path is missed.

4. Native app activation before showing the window.
   [backend/tray/tray_darwin.go](../backend/tray/tray_darwin.go) exposes `Activate()`, which calls `activateApp()` on the native side. [app.go](../app.go) uses this before `runtime.WindowShow(...)` on the hotkey path.

5. Icon fallback strategy.
   [backend/tray/tray_darwin.m](../backend/tray/tray_darwin.m) tries, in order:
   - the macOS SF Symbol `clipboard`
   - bundled icon bytes as a template image
   - a plain `C` text fallback

### Why the macOS tray is still fragile

The current macOS path is more fragile than Linux because it depends on native AppKit timing outside the normal Wails window flow.

Known fragility points from the current implementation:

- Tray creation depends on app activation timing.
- The tray bridge is custom native code, not a shared cross-platform helper.
- The window is expected to hide instead of quit, so any tray failure becomes user-visible immediately.
- Launch context matters on macOS in a way it does not on Linux, which is why [launch_darwin.go](../launch_darwin.go) exists at all.

At the moment, the right conclusion is: the macOS tray path has had meaningful lifecycle work already, but it should still be treated as an active problem area.

---

## Linux Implementation

Relevant files:

- [tray_other.go](../tray_other.go)
- [backend/tray/tray_linux.go](../backend/tray/tray_linux.go)
- [backend/tray/tray_other_activation.go](../backend/tray/tray_other_activation.go)

Linux uses a much simpler path.

### Expected Linux flow

1. [app.go](../app.go) calls `a.startTray()`.
2. [tray_other.go](../tray_other.go) forwards to `tray.Start(...)`.
3. [backend/tray/tray_linux.go](../backend/tray/tray_linux.go) starts `systray.Run(...)` in a goroutine.
4. The tray icon, title, tooltip, and menu items are created in `onReady(...)`.
5. Clicking Show calls the shared Wails window-show callback.
6. Clicking Quit calls `systray.Quit()` and then the shared Wails quit callback.

### Linux-specific notes

- Linux does not need native activation logic before showing the app window.
- [backend/tray/tray_other_activation.go](../backend/tray/tray_other_activation.go) makes `tray.Activate()` a no-op outside Darwin.
- The Linux tray path is the simpler reference implementation for expected behavior: tray icon exists, Show brings the window forward, Quit exits the app.

---

## Practical Reading Of The Current Status

If someone is debugging the tray today, the safest summary is:

- The app is intentionally designed to hide on close and stay reachable from the tray.
- Linux follows a straightforward systray path and is the lower-risk implementation.
- macOS uses a custom native bridge because the tray behavior is handled outside the shared Wails window layer in this repository.
- Several macOS lifecycle fixes were already added, so future work should start from the existing activation and bundle-launch logic rather than re-discovering those constraints.
- The macOS tray still needs validation and likely more debugging even after those changes.

---

## Files To Check First During Future Debugging

- [main.go](../main.go)
- [launch_darwin.go](../launch_darwin.go)
- [app.go](../app.go)
- [tray_other.go](../tray_other.go)
- [backend/tray/tray_darwin.go](../backend/tray/tray_darwin.go)
- [backend/tray/tray_darwin.m](../backend/tray/tray_darwin.m)
- [backend/tray/tray_linux.go](../backend/tray/tray_linux.go)

These files cover the launch path, tray startup path, native macOS bridge, and Linux reference implementation.
