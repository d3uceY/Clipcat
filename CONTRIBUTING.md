# Contributing

## Prerequisites

- Go 1.26+ (see `go.mod`)
- Node.js 20+ and npm
- Wails v3 CLI: `go install github.com/wailsapp/wails/v3/cmd/wails3@latest`
- CGO toolchain: `xcode-select --install` (macOS), `build-essential` + `pkg-config` (Linux)
- Linux only: `sudo apt install libgtk-4-dev libwebkitgtk-6.0-dev libayatana-appindicator3-dev xdotool wmctrl`

## Setup

```bash
git clone https://github.com/d3uceY/Clipcat.git
cd Clipcat
go mod download
cd frontend && npm install && cd ..
wails3 task dev
```

`wails3 task dev` hot-reloads the frontend and rebuilds the Go side on change. `wails3 task build` compiles a production binary without packaging.

## Layout

```
main.go / app.go      Wails entry point; app.go is the API the frontend calls
tray_*.go             Native tray per OS
launch_darwin.go      Relaunches into the .app bundle when started from a terminal
backend/store/        SQLite schema, encryption, settings, blocked apps
backend/lib/clipboard Clipboard listener, global hotkey, focus tracking, paste
backend/lib/startup   Launch-at-login per OS
backend/platform      Single-instance guard
frontend/src/         React 19 + Tailwind UI (features/, contexts/, components/)
frontend/bindings/    Generated Go→TS bindings - do not edit
```

## How it works

- **Capture** - Per-OS listener (Win32 message window; `golang.design/x/clipboard` on macOS and Linux) saves text and images after a 150 ms debounce. Blocked processes are filtered before saving.
- **Paste** - A tracker remembers the last non-Clipcat window, focuses it, then sends the platform's paste keystroke (`keybd_event`, CGEvents, `xdotool`).
- **Storage** - SQLite. Text clips are sealed with AES-256-GCM under a key kept in the OS keychain (`backend/store/crypt.go`); dedupe uses a keyed HMAC-SHA256 of the plaintext; the full-text index lives in memory only (`backend/store/index.go`). The storage limit prunes oldest first and never touches pinned clips.
- **UI** - The backend emits `clip:*` events; `ClipContext` updates React from them.

## Releases

The tag is the only version input:

```bash
git tag v0.12.0 && git push origin v0.12.0
```

CI runs `build/scripts/set-version.sh <x.y.z>` before every build, so `main.go`, `build/config.yml`, the nfpm config, both `Info.plist` files, the Windows resource and manifest, the NSIS defaults and `wails.json` all match the tag. The binary also gets `-X main.AppVersion=v<x.y.z>`.

Build one platform locally:

```bash
wails3 task windows:package VERSION=0.12.0
wails3 task darwin:package ARCH=arm64 VERSION=0.12.0
wails3 task linux:create:deb VERSION=0.12.0
```

## Style

- `gofmt`; exported names PascalCase.
- `app.go` coordinates only - SQL lives in `backend/store/`.
- Platform code in `_<os>.go` files behind build tags.
- React: `.tsx` components, `React.memo` on list rows, `useMemo` over `useEffect` for derived state.

## Pull requests

Branch off `main`, run `wails3 task build`, test the affected flows with `wails3 task dev`, then open a PR saying what changed and why. Commit prefixes: `feat:`, `fix:`, `refactor:`.

## Bugs

Open an [issue](https://github.com/d3uceY/Clipcat/issues) with the version from the About dialog, your OS, steps to reproduce, expected vs actual, and any console output.
