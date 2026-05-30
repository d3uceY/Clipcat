<p align="center">
  <img src="./build/windows/icon.ico" alt="icon" width="90">
</p>
<div align="center">
<h1>Clipcat</h1>
</div>

A stylish clipboard manager that automatically saves everything you copy — text and images — so you can find it, reuse it, and manage it without thinking about it.

<img width="1912" height="1026" alt="image" src="https://github.com/user-attachments/assets/ec4870c1-8555-49e0-9cb4-52c83f7551b0" />


## Download

![Clipcat Banner](https://img.shields.io/badge/Made%20with-Wails-00ADD8?style=for-the-badge&logo=go)
![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)

**Click your platform to download the latest version:**

[![Windows](https://img.shields.io/github/v/release/d3uceY/Clipcat?style=for-the-badge&logo=windows&label=Windows&color=0078D4&logoColor=white)](https://github.com/d3uceY/Clipcat/releases/latest/download/Clipcat-windows-amd64-installer.exe)
[![macOS Apple Silicon](https://img.shields.io/github/v/release/d3uceY/Clipcat?style=for-the-badge&logo=apple&label=macOS%20ARM64&color=000000)](https://github.com/d3uceY/Clipcat/releases/latest/download/Clipcat-macos-arm64.dmg)
[![macOS Intel](https://img.shields.io/github/v/release/d3uceY/Clipcat?style=for-the-badge&logo=apple&label=macOS%20AMD64&color=000000)](https://github.com/d3uceY/Clipcat/releases/latest/download/Clipcat-macos-amd64.dmg)
[![Linux x86-64](https://img.shields.io/github/v/release/d3uceY/Clipcat?style=for-the-badge&logo=linux&label=Linux%20x86__64&color=FCC624&logoColor=black)](https://github.com/d3uceY/Clipcat/releases/latest/download/Clipcat-linux-amd64)

> Windows 10/11 · macOS 12+ · Linux x86-64 (X11) — all badges link directly to the latest release

![clipcat (1)](https://github.com/user-attachments/assets/ca28ae42-2a9d-42c3-9a47-183808d59cf6)

### First-Run Notes

Clipcat is not code-signed, so each platform may warn you on first launch. The app is safe and fully open source — you can read every line of code here.

**Windows — SmartScreen**
1. Click **More info**
2. Click **Run anyway**

Or right-click the `.exe` → **Properties** → check **Unblock** → **Apply**.

**macOS — Gatekeeper**

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


## Features

- **Automatic Capture** — Saves everything you copy (text and images) the moment it hits your clipboard, with no setup needed

- **Pin Important Clips** — Keep your most-used clips at the top, protected from being pushed out when the storage limit is reached
- <img width="577" height="471" alt="image" src="https://github.com/user-attachments/assets/aa6e7ff1-159e-4fc0-8565-fdc9208a07c4" />

- **Fast Search** — Filter everything instantly with `Ctrl+F`
- <img width="530" height="112" alt="showcase-search" src="https://github.com/user-attachments/assets/c2c76d50-5f94-481d-9191-ad37f2518967" />

- **Paste Into Any Window** — Click the paste button on any clip and it fires directly into whatever window you were using before opening Clipcat. No manual Ctrl+V needed

- **Quick Paste Mode** — Hide Clipcat to the tray, press `Ctrl+Shift+V` from anywhere to summon it, pick a clip, and it pastes straight in — then vanishes
- <img width="331" height="283" alt="image" src="https://github.com/user-attachments/assets/65dcb9dd-a402-4699-97fa-3042f1a4a9aa" />

- **Edit Clips** — Fix typos or update content in any saved clip without re-copying

- **Manual Clip Creation** — Add clips directly from the app, optionally pinned from the start
- <img width="705" height="324" alt="showcase-action-btns" src="https://github.com/user-attachments/assets/d03a6634-8b41-4d78-a976-662b4c2b8f89" />

- **Privacy Mode** — Instantly blur all clip content for screen sharing or shoulder-surfing situations; toggle with `Alt+H`
- <img width="1223" height="244" alt="image" src="https://github.com/user-attachments/assets/0d242347-2e1d-46bf-b57f-20255d7c4fd1" />

- **Blocked Apps** — Add any app's process name to a blocklist so its clipboard activity is never captured (useful for password managers)
- <img width="259" height="335" alt="image" src="https://github.com/user-attachments/assets/ca3ed1ef-8a44-4aa2-a759-37d025e0682b" />

- **Pause Capture** — Temporarily stop recording clipboard changes without closing the app
- <img width="252" height="233" alt="image" src="https://github.com/user-attachments/assets/2ce57fca-f3bc-49c1-bfde-0ef62338dcde" />

- **Bulk Delete** — Clear all clips, only pinned, or only unpinned in one click — always with a confirmation prompt
- <img width="467" height="193" alt="image" src="https://github.com/user-attachments/assets/a78a8a32-0d91-4920-ba4a-4100bb8d8cca" />

- **Mini Clip Mode** — Compact always-on-top window that stays out of your way; toggle with `Alt+M`
- <img width="270" height="330" alt="image" src="https://github.com/user-attachments/assets/ddedff44-5007-4f57-b98e-006e28e24e71" />

- **System Tray** — Lives quietly in your tray; summon or quit it any time
- <img width="211" height="108" alt="image" src="https://github.com/user-attachments/assets/078cf695-5af4-41f5-a357-2ac21d12fc95" />

- **Startup Support** — Optionally launch Clipcat on system startup
- <img width="293" height="335" alt="image" src="https://github.com/user-attachments/assets/2437742c-48c4-4e09-9726-19551d86eb54" />

- **Clickable Links** — URLs in clips are automatically detected and open in your browser with a click

- **Relative Timestamps** — Clips show live-updating times like "2 minutes ago" or "yesterday"

- **Sound Effects** — Satisfying audio feedback on every action; toggle with `Alt+S`

- **Configurable Storage Limit** — Choose how many clips to keep (100–500); pinned clips are always preserved

- **Labels** — Tag any clip with a custom label to categorize and organize your history

- **Label Filters** — Filter your clipboard history by label with one click using the filter bar above your clips

- **Auto-hide Sensitive Clips** — Automatically detects and hides clips that look like passwords, API keys, tokens, JWTs, private keys, and other credentials using pattern matching and entropy analysis. Hidden clips are collapsed into a separate section and can be revealed or marked safe individually. Toggle this on or off in Settings

- **Unique Paper Aesthetic** — Hand-drawn notebook-style UI with GSAP animations and a paper curtain reveal on launch


## Keyboard Shortcuts

| Shortcut | Action |
|---|---|
| `Ctrl + Shift + V` | Summon Clipcat from any application (system-wide) |
| `Ctrl + F` | Focus the search bar |
| `Alt + M` | Toggle Mini Clip mode |
| `Alt + H` | Toggle Privacy Mode |
| `Alt + S` | Toggle sound effects |


## Your Clips Are Stored Here

| Platform | Path |
|---|---|
| Windows | `%APPDATA%\clipussy\db\gyatt.db` |
| macOS | `~/Library/Application Support/clipussy/db/gyatt.db` |
| Linux | `~/.config/clipussy/db/gyatt.db` |

It's a local SQLite file — no cloud, no account, no tracking.


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
