# Contributing to Clipcat

Thanks for your interest in contributing! Below is everything you need to get the project running locally and submit changes.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Project Structure](#project-structure)
3. [Architecture](#architecture)
4. [How It Works](#how-it-works)
5. [Setting Up Locally](#setting-up-locally)
6. [Development Workflow](#development-workflow)
7. [Building a Release Binary](#building-a-release-binary)
8. [Code Style](#code-style)
9. [Submitting a Pull Request](#submitting-a-pull-request)
10. [Reporting Bugs](#reporting-bugs)

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Go | ≥ 1.24 | https://go.dev/dl/ |
| Node.js | ≥ 18 | https://nodejs.org |
| npm | bundled with Node | - |
| Wails CLI | v2.12.0 | `go install github.com/wailsapp/wails/v2/cmd/wails@v2.12.0` |
| NSIS (Windows installer only) | latest | https://nsis.sourceforge.io |

**Linux runtime deps (required for the app to fully work on Linux):**
```bash
sudo apt install xdotool wmctrl
```

**macOS:** Xcode Command Line Tools (`xcode-select --install`) are required for CGo.

---

## Project Structure

```
Clipcat/
├── app.go            # Wails App struct - startup, all frontend-exposed methods
├── tray_windows.go   # Windows tray shim - embeds .ico, wires show/quit callbacks
├── tray_other.go     # macOS + Linux tray shim - same interface, different icon embed
├── launch_darwin.go  # Relaunch shim: ensures the app always runs inside .app bundle
├── launch_other.go   # No-op on Windows/Linux
├── main.go           # Wails runtime entry point
├── go.mod / go.sum   # Go module definition
├── wails.json        # Wails configuration (name, output filename, frontend scripts)
│
├── backend/
│   ├── store/        # package store - all SQLite logic
│   │   ├── db.go         DB init, table creation, schema migrations
│   │   ├── encrypt.go    AES-256-GCM encryption, key derivation, HMAC hashing
│   │   ├── clips.go      Clip type, CRUD operations, storage-limit enforcement
│   │   ├── settings.go   Persisted settings: Quick Paste / Ghost mode, always-on-top, mini-clip, auto-hide sensitive
│   │   └── ignore.go     Blocked-app process list
│   ├── tray/         # package tray - systray logic
│   │   ├── tray_windows.go          systray setup for Windows
│   │   ├── tray_linux.go            systray setup for Linux (ayatana-appindicator3)
│   │   ├── tray_darwin.go           CGo bridge to Objective-C tray
│   │   ├── tray_darwin.m            Native NSStatusItem menu bar icon
│   │   └── tray_other_activation.go No-op Activate() for Windows/Linux
│   ├── platform/     # package platform - OS-level utilities
│   │   ├── single_instance_windows.go  Named-mutex single-instance guard
│   │   ├── single_instance_linux.go    PID lock file guard
│   │   └── single_instance_darwin.go   PID lock file guard
│   └── lib/          # Shared low-level packages
│       ├── clipboard/
│       │   ├── shared.go                Shared state (debounce, pause, ignore list)
│       │   ├── listener_windows.go      WM_CLIPBOARDUPDATE + WM_HOTKEY message window
│       │   ├── listener_linux.go        golang.design/x/clipboard watcher + X11 hotkey
│       │   ├── x11_hotkey_linux.c       X11 XGrabKey implementation (compiled by CGo)
│       │   ├── listener_darwin.go       Carbon hotkey + clipboard watcher
│       │   ├── clipboard_darwin.c       Carbon hotkey + CGEvent paste implementation
│       │   ├── window_utils_windows.go  Win32 focus tracker, SimulatePaste (keybd_event)
│       │   ├── window_utils_linux.go    xdotool focus tracker and paste simulation
│       │   └── window_utils_darwin.go   osascript focus tracker + CGEvent paste
│       └── startup/
│           ├── startup_windows.go   WScript.Shell shortcut in Startup folder
│           ├── startup_linux.go     ~/.config/autostart/clipcat.desktop
│           └── startup_darwin.go    ~/Library/LaunchAgents plist + launchctl
│
└── frontend/
    ├── src/
    │   ├── App.tsx
    │   ├── components/   UI components (ClipCard, page, dialogs, etc.)
    │   ├── context/      ClipContext - global React state
    │   ├── helpers/      Utility functions (formatTime, playSound, insertLinks…)
    │   ├── hooks/        Custom hooks (use-card-row-span, use-relative-time)
    │   └── types/        TypeScript interfaces (Clip)
    ├── wailsjs/          Auto-generated Wails Go→TS bindings (do not edit)
    └── public/           Static assets (sounds, cursors, textures)
```

---

## Architecture

```
+--------------------------------------------------+
|               Frontend (React)                   |
|  +------------+  +----------+  +-----------+    |
|  |  UI Layer  |  | Context  |  | Components|    |
|  | (TSX/CSS)  |  | Provider |  |  (Cards)  |    |
|  +------------+  +----------+  +-----------+    |
+---------------------+----------------------------+
                      | Wails Bridge (IPC)
+---------------------+----------------------------+
|              Backend (Go)                        |
|  +----------+  +--------------------+           |
|  |  app.go  |  |   backend/store/   |           |
|  | (Bridge) |  | clips  db  encrypt |           |
|  +----------+  | settings  ignore   |           |
|  +----------+  +--------------------+           |
|  | tray_*.go|  +----------+  +--------------+   |
|  | (Shims)  |  |  backend/|  |   backend/   |   |
|  +----------+  |  tray/   |  |  platform/   |   |
|                +----------+  +--------------+   |
+---------------------+----------------------------+
                      |
          +-----------+-----------+
          |                       |
    +-----+------+       +--------+--------+
    |  SQLite    |       | Platform APIs   |
    | Database   |       | Win32 / Carbon  |
    +------------+       | CGEvents / X11  |
                         +-----------------+
```

### Data Flow

1. **Clipboard Monitoring** - Each platform registers its own listener. Windows uses a hidden `HWND_MESSAGE` window with `WM_CLIPBOARDUPDATE`. macOS and Linux use `golang.design/x/clipboard` watchers. A 150 ms debounce prevents duplicate saves. The ignore list filters blocked processes before anything is saved.

2. **Focus Tracking** - A background goroutine continuously tracks the last non-Clipcat window/app. On Windows this polls `GetForegroundWindow`; on Linux it polls `xdotool getactivewindow`; on macOS it polls the frontmost app bundle ID via osascript. This gives the paste button a valid target.

3. **Data Storage** - Clips are saved to SQLite with HMAC-based duplicate detection. Automatic cleanup keeps only the most recent N clips, always preserving pinned ones.

4. **Frontend Updates** - The backend emits `clipboard:changed` events; React context re-fetches and re-renders.

5. **User Actions** - Copy (browser clipboard API), paste to window (focus prev window + simulate platform-native paste keystroke), pin/delete (DB update + re-render), search (client-side filter).

---

## How It Works

### Clipboard Listener

Each platform has its own `listener_<os>.go` file compiled via Go build tags.

**Windows** (`backend/lib/clipboard/listener_windows.go`)

A hidden `HWND_MESSAGE` window is registered with `AddClipboardFormatListener`. Windows delivers `WM_CLIPBOARDUPDATE` when any app writes to the clipboard. The same window handles `WM_HOTKEY` for the global `Ctrl+Shift+V` shortcut via `RegisterHotKey`.

```go
case WM_CLIPBOARDUPDATE:
    // 150 ms debounce + pause check + ignore list check
    // then calls onChangeCallback()

case WM_HOTKEY:
    // Snapshot the current foreground window, then show Clipcat
    capturePreviousWindow()
    go onHotkeyCallback()
```

**macOS** (`backend/lib/clipboard/listener_darwin.go` + `clipboard_darwin.c`)

A Carbon `EventHotKeyRef` handles `Ctrl+Shift+V` globally. Clipboard change events come from `golang.design/x/clipboard` watchers for both text and image formats.

**Linux** (`backend/lib/clipboard/listener_linux.go` + `x11_hotkey_linux.c`)

The hotkey is registered with `XGrabKey` on the root X11 window (C implementation in `x11_hotkey_linux.c` - kept in a separate file to avoid CGo multiple-definition linker errors). Clipboard events come from the same `golang.design/x/clipboard` watchers.

### Focus Tracker (`backend/lib/clipboard/window_utils_<os>.go`)

Each platform implements the same interface: `StartFocusTracker`, `FocusPreviousWindow`, `SimulatePaste`, `HasPreviousWindow`, and `isForegroundProcessIgnored`. The platform-specific implementations live in `window_utils_windows.go`, `window_utils_linux.go`, and `window_utils_darwin.go`.

### Database Schema (`backend/store/db.go`)

```sql
CREATE TABLE clips (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    content      TEXT,           -- nullable; populated for text clips
    image        BLOB,           -- populated for image clips
    thumbnail    BLOB,           -- low-res preview sent to frontend
    type         TEXT NOT NULL,  -- 'text' or 'image'
    pinned       BOOLEAN DEFAULT 0,
    encrypted    INTEGER DEFAULT 0,
    content_hash TEXT,           -- HMAC-SHA256 for deduplication
    label        TEXT DEFAULT '', -- optional user-defined tag
    hidden       INTEGER DEFAULT 0, -- auto-hidden sensitive clips
    created_at   DATETIME
);

CREATE TABLE clip_storage_limit (id INTEGER PRIMARY KEY CHECK (id = 0), limit_count INTEGER DEFAULT 100);
CREATE TABLE ignore_list        (process_name TEXT PRIMARY KEY);
CREATE TABLE settings (
    id                   INTEGER PRIMARY KEY CHECK (id = 0),
    ghost_mode           INTEGER DEFAULT 0,  -- Quick Paste mode
    auto_hide_sensitive  INTEGER DEFAULT 1,  -- auto-hide passwords/keys
    always_on_top        INTEGER DEFAULT 0,  -- window always on top
    mini_clip            INTEGER DEFAULT 0,  -- compact mini-clip mode
    startup_default_set  INTEGER DEFAULT 0   -- first-run startup flag
);
CREATE TABLE encryption_meta    (id INTEGER PRIMARY KEY CHECK (id = 0), machine_key TEXT NOT NULL);
```

### Encryption (`backend/store/encrypt.go`)

All clip content is encrypted at rest with AES-256-GCM using a per-installation key stored in `encryption_meta`. Deduplication uses HMAC-SHA256 so duplicates can be detected without comparing plaintext.

### Store API (`backend/store/clips.go`)

| Function | Purpose |
|---|---|
| `GetClips()` | All clips, ordered pinned-first then newest |
| `AddClip()` / `AddImageClip()` | Insert + enforce storage limit |
| `AddManualClip()` | User-created clip with optional pin |
| `GetClipImage(id)` | Full-resolution base64 image for detail view |
| `UpdateClipContent()` | Edit existing clip content |
| `TogglePinClip()` | Toggle pinned flag |
| `DeleteClip()` | Remove by ID |
| `DeleteAllClips()` / `DeletePinnedClips()` / `DeleteUnpinnedClips()` | Bulk delete with confirmation dialog |
| `SeedTestClips(n)` | Insert n test text clips (perf testing only) |
| `SeedTestImageClips(n)` | Duplicate the latest image clip n times (perf testing only) |

### Frontend State (`ClipContext.tsx`)

- Splits clips into `pinned` and `recent` arrays
- Listens for `clipboard:changed` events from the backend
- Manages all settings: sound, privacy mode, mini clip, startup, pause, blocked apps, Quick Paste, always-on-top, auto-hide sensitive
- All toggle functions call the corresponding Go backend method and update local React state
- Settings that need to survive restarts (always-on-top, mini-clip, Quick Paste, auto-hide sensitive) are persisted to SQLite via the Go layer; others (sound, hide-content) use `localStorage`

### Startup / domReady flow (`app.go`)

The app uses `StartHidden: true` in Wails options so the window is invisible during initialization. The lifecycle is:

1. **`startup(ctx)`** - DB init, migrations, clipboard listener, tray setup. No window operations happen here.
2. **`domReady(ctx)`** - Called after React has fully rendered. Window state is restored here (always-on-top, mini-clip sizing), then `WindowShow` is called. This prevents the white-flash that would occur if window operations ran before the WebView2 finished rendering.

---

## Setting Up Locally

```bash
# 1. Clone
git clone https://github.com/d3uceY/Clipcat.git
cd Clipcat

# 2. Install Go dependencies
go mod download

# 3. Install frontend dependencies
cd frontend
npm install
cd ..
```

---

## Development Workflow

```bash
wails dev
```

This launches the app with:
- Hot-reload on frontend changes (Vite)
- Automatic Go recompilation on backend changes
- A browser devtools window accessible at the URL printed in the terminal

**Useful dev flags:**

| Flag | Effect |
|---|---|
| `wails dev -loglevel debug` | Verbose Wails runtime logging |
| `wails dev -browser` | Also open a browser tab (layout debugging) |

### Performance Testing

`backend/store/clips.go` has two seeding functions for inserting large batches of test clips. To use them, uncomment the relevant call in `app.go`:

```go
// app.go - inside startup(), after MigrateEncryptOldClips()
// store.SeedTestClips(500)      // PERF TEST: uncomment to insert 500 test text clips
// store.SeedTestImageClips(500) // PERF TEST: duplicate the last image clip 500 times
```

> **Always recomment these before committing.** They insert into the live database on every startup.

---

## Building a Release Binary

**Windows - Portable `.exe`**
```bash
wails build -clean -o Clipcat-windows-amd64
# Output: build/bin/Clipcat-windows-amd64.exe
```

**Windows - NSIS installer** (requires NSIS installed and `makensis` on PATH)
```bash
wails build -clean -nsis -o Clipcat-windows-amd64
# Output: build/bin/Clipcat-windows-amd64-installer.exe
```

**macOS - ARM64 (Apple Silicon)**
```bash
wails build -clean -platform darwin/arm64 -o Clipcat-macos-arm64
# Output: build/bin/Clipcat.app  (package into DMG with hdiutil)
```

**macOS - AMD64 (Intel)**
```bash
wails build -clean -platform darwin/amd64 -o Clipcat-macos-amd64
```

**Linux - amd64** (requires `libgtk-3-dev`, `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`)
```bash
wails build -clean -tags webkit2gtk_4_1 -o Clipcat-linux-amd64
# Output: build/bin/Clipcat-linux-amd64
```

The CI release pipeline (`.github/workflows/release.yml`) runs all four builds automatically on any tag matching `v*.*.*`.

---

## Code Style

### Go

- Standard `gofmt` formatting - run `gofmt -w .` before committing
- Exported functions in `backend/` packages use `PascalCase`
- Internal (package-private) helpers stay `camelCase`
- Keep `app.go` as a thin coordinator - it should call `store.*` and `clipboard.*`, not contain business logic itself
- Do not add direct database calls to `app.go`; put them in `backend/store/`

### TypeScript / React

- Components use `.tsx`, pure utilities use `.ts`
- `React.memo` with explicit comparators on any component that renders inside a large list
- Avoid `useEffect` for derived state - prefer `useMemo`
- New hooks go in `frontend/src/hooks/`
- New UI-only components go in `frontend/src/components/`

---

## Submitting a Pull Request

1. Fork the repo and create a branch: `git checkout -b feat/your-feature`
2. Make your changes and verify the build: `go build ./...`
3. Run the app with `wails dev` and manually test the affected flows
4. Commit with a clear message: `feat: add X` / `fix: Y when Z` / `refactor: move X to Y`
5. Push and open a PR against `main`
6. Describe what changed and why in the PR description

### What gets reviewed

- Does `go build ./...` pass cleanly?
- Are new backend functions placed in the right package (`store`, `platform`, `lib/clipboard`, etc.)?
- Are there no direct SQL calls in `app.go`?
- If the change is platform-specific, is it behind the correct build tag and in the right `_<os>.go` file?
- Does the UI still look and feel correct?

---

## Reporting Bugs

Open an issue at https://github.com/d3uceY/Clipcat/issues with:

- Clipcat version (visible in the About dialog)
- OS and version (e.g. Windows 11 23H2, macOS 15.2, Ubuntu 24.04)
- Steps to reproduce
- Expected vs actual behaviour
- Any error output from the console (open DevTools with `F12` in dev mode, or check the Wails log)
