<p align="center">
  <img src="./build/windows/icon.ico" alt="icon" width="90">
</p>
<div align="center">
<h1>Clipcat</h1>
</div>

A stylish clipboard manager that automatically saves everything you copy - text and images - so you can find it, reuse it, and manage it without thinking about it.

<img width="1917" height="1026" alt="image" src="https://github.com/user-attachments/assets/b836545a-0bdd-496f-b3da-f722199357e4" />

## Documentation

Full documentation, feature guides, and keyboard shortcuts are available at:
**[d3ucey.github.io/Clipcat](https://d3ucey.github.io/Clipcat/)**

## Download

![Clipcat Banner](https://img.shields.io/badge/Made%20with-Wails-00ADD8?style=for-the-badge&logo=go)
![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)

**Click your platform to download the latest version:**

[![Windows](https://img.shields.io/github/v/release/d3uceY/Clipcat?style=for-the-badge&logo=windows&label=Windows&color=0078D4&logoColor=white)](https://github.com/d3uceY/Clipcat/releases/latest/download/Clipcat-windows-amd64-installer.exe) - ⚠️ SmartScreen will block it · [how to fix](#first-run-notes)<br>
[![macOS Apple Silicon](https://img.shields.io/github/v/release/d3uceY/Clipcat?style=for-the-badge&logo=apple&label=macOS%20ARM64&color=000000)](https://github.com/d3uceY/Clipcat/releases/latest/download/Clipcat-macos-arm64.dmg) - ⚠️ Gatekeeper will block it · [how to fix](#first-run-notes)<br>
[![macOS Intel](https://img.shields.io/github/v/release/d3uceY/Clipcat?style=for-the-badge&logo=apple&label=macOS%20AMD64&color=000000)](https://github.com/d3uceY/Clipcat/releases/latest/download/Clipcat-macos-amd64.dmg) - ⚠️ Gatekeeper will block it · [how to fix](#first-run-notes)<br>
[![Linux x86-64](https://img.shields.io/github/v/release/d3uceY/Clipcat?style=for-the-badge&logo=linux&label=Linux%20x86__64&color=FCC624&logoColor=black)](https://github.com/d3uceY/Clipcat/releases/latest/download/Clipcat-linux-amd64)

> Windows 10/11 · macOS 12+ · Linux x86-64 (X11) - all badges link directly to the latest release · **app is not code-signed, [see first-run notes below](#first-run-notes)**

![clipcat (1)](https://github.com/user-attachments/assets/ca28ae42-2a9d-42c3-9a47-183808d59cf6)

### First-Run Notes

Clipcat is not code-signed, so each platform may warn you on first launch. The app is safe and fully open source - you can read every line of code here.

**Windows - SmartScreen**

1. Click **More info**
2. Click **Run anyway**

Or right-click the `.exe` → **Properties** → check **Unblock** → **Apply**.

**macOS - Gatekeeper**

Right-click the `.dmg` → **Open** → click **Open** again in the dialog. Alternatively, go to System Settings → Privacy & Security and click **Open Anyway** after the first blocked attempt.

Clipcat also requires **Accessibility** permission to simulate paste (Cmd+V). Grant it under System Settings → Privacy & Security → Accessibility.

**Linux**

Make the binary executable before running:

```bash
chmod +x Clipcat-linux-amd64
./Clipcat-linux-amd64
```

Requires `xdotool` at runtime for window focus and paste simulation:

```bash
sudo apt install xdotool
```

Clipcat bundles its own clipboard monitoring — XFixes extension on X11 (event-driven) and wl-clipboard on Wayland (polling).

If you're on **Wayland** (e.g. COSMIC, GNOME on Wayland), also install:
```bash
sudo apt install wl-clipboard
```

## Features

- **Automatic Capture** - Saves everything you copy (text and images) the moment it hits your clipboard, with no setup needed

- **Pin Important Clips** - Keep your most-used clips at the top, protected from being pushed out when the storage limit is reached
- **Fast Search** - Filter everything instantly with `Ctrl+F`
- <img width="1911" height="1016" alt="image" src="https://github.com/user-attachments/assets/41338104-c3a3-4c1d-9db6-42dd7901f35f" />

- **Paste Into Any Window** - Click the paste button on any clip and it fires directly into whatever window you were using before opening Clipcat. No manual Ctrl+V needed
- **Quick Paste Mode** - Hide Clipcat to the tray, press `Ctrl+Shift+V` from anywhere to summon it, pick a clip, and it pastes straight in - then vanishes. Enabling Quick Paste also automatically turns on Mini Clip mode
- **Edit Clips** - Fix typos or update content in any saved clip without re-copying
- **Manual Clip Creation** - Add clips directly from the app, optionally pinned from the start
- <img width="1917" height="1017" alt="image" src="https://github.com/user-attachments/assets/311f03f6-5e77-4a29-b3cd-73e6b85be890" />

- **Privacy Mode** - Instantly blur all clip content for screen sharing or shoulder-surfing situations; toggle with `Alt+H`
- <img width="1918" height="1017" alt="image" src="https://github.com/user-attachments/assets/7989e737-d9b9-4b1d-a008-9fd2ad3fd079" />

- **Blocked Apps** - Add any app's process name to a blocklist so its clipboard activity is never captured (useful for password managers)
- **Pause Capture** - Temporarily stop recording clipboard changes without closing the app
- **Bulk Delete** - Clear all clips, only pinned, or only unpinned in one click - always with a confirmation prompt
- **Mini Clip Mode** - Compact always-on-top window that stays out of your way; toggle with `Alt+M`. State persists between sessions
- **Always on Top** - Keep the Clipcat window above all other windows at all times. State persists between sessions
- **Smart Position** - When Quick Paste summons the window, it pops up right next to your cursor so you never have to hunt for it. Always stays fully on-screen, even on multi-monitor setups. Toggle in Settings → Window (on by default)
- **System Tray** - Lives quietly in your tray; summon or quit it any time
- **Startup Support** - Optionally launch Clipcat on system startup
- **Clickable Links** - URLs in clips are automatically detected and open in your browser with a click
- <img width="1912" height="1011" alt="image" src="https://github.com/user-attachments/assets/531f4334-b857-437c-99e5-5907c495fb48" />

- **Relative Timestamps** - Clips show live-updating times like "2 minutes ago" or "yesterday"
- **Sound Effects** - Satisfying audio feedback on every action; toggle with `Alt+S`
- **Configurable Storage Limit** - Choose how many clips to keep (100–500); pinned clips are always preserved
- **Labels** - Tag any clip with a custom label to categorize and organize your history
- **Label Filters** - Filter your clipboard history by label with one click using the filter bar above your clips
- <img width="1918" height="1012" alt="image" src="https://github.com/user-attachments/assets/5cacae71-6e17-4062-9a2a-725ee3307ab7" />

- **Auto-hide Sensitive Clips** - Automatically detects and hides clips that look like passwords, API keys, tokens, JWTs, private keys, and other credentials using pattern matching and entropy analysis. Hidden clips are collapsed into a separate section and can be revealed or marked safe individually. Toggle this on or off in Settings

- **Unique Paper Aesthetic** - Hand-drawn notebook-style UI with GSAP animations and a paper curtain reveal on launch

## Keyboard Shortcuts

| Shortcut           | Action                                            |
| ------------------ | ------------------------------------------------- |
| `Ctrl + Shift + V` | Summon Clipcat from any application (system-wide) |
| `Ctrl + F`         | Focus the search bar                              |
| `Alt + M`          | Toggle Mini Clip mode                             |
| `Alt + H`          | Toggle Privacy Mode                               |
| `Alt + S`          | Toggle sound effects                              |

## Your Clips Are Stored Here

| Platform | Path                                                 |
| -------- | ---------------------------------------------------- |
| Windows  | `%APPDATA%\clipussy\db\gyatt.db`                     |
| macOS    | `~/Library/Application Support/clipussy/db/gyatt.db` |
| Linux    | `~/.config/clipussy/db/gyatt.db`                     |

It's a local SQLite file - no cloud, no account, no tracking.

## Built With

**Backend:** Go · Wails v2 · SQLite · Win32 API (Windows) · Carbon/CGEvents (macOS) · X11 (Linux)

**Frontend:** React 18 · TypeScript · Tailwind CSS · shadcn/ui · GSAP

## Contributing

Have an idea or found a bug? Contributions are welcome.

See **[CONTRIBUTING.md](./CONTRIBUTING.md)** for how to set up the project locally, the code structure, and how to submit a PR.

## Author

**Onyekwelu Jesse** ([@d3uceY](https://github.com/d3uceY))

## License

MIT

## Acknowledgments

[Wails](https://wails.io/) and all the open-source libraries that made this possible.

---

Made with love by d3uceY
