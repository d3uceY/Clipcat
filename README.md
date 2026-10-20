<p align="center">
  <img src="./build/windows/icon.ico" alt="Clipcat" width="90">
</p>

<h1 align="center">Clipcat</h1>

<p align="center">Clipboard history for Windows, macOS, and Linux - text and images, saved automatically.</p>

![Clipcat](./docs/static/img/clipcat-demo.gif)

## Download

[![Windows](https://img.shields.io/github/v/release/d3uceY/Clipcat?style=for-the-badge&logo=windows&label=Windows&color=0078D4&logoColor=white)](https://github.com/d3uceY/Clipcat/releases/latest/download/Clipcat-windows-amd64-installer.exe)<br>
[![macOS Apple Silicon](https://img.shields.io/github/v/release/d3uceY/Clipcat?style=for-the-badge&logo=apple&label=macOS%20ARM64&color=000000)](https://github.com/d3uceY/Clipcat/releases/latest/download/Clipcat-macos-arm64.dmg)<br>
[![macOS Intel](https://img.shields.io/github/v/release/d3uceY/Clipcat?style=for-the-badge&logo=apple&label=macOS%20AMD64&color=000000)](https://github.com/d3uceY/Clipcat/releases/latest/download/Clipcat-macos-amd64.dmg)<br>
[![Linux x86-64](https://img.shields.io/github/v/release/d3uceY/Clipcat?style=for-the-badge&logo=linux&label=Linux%20x86__64&color=FCC624&logoColor=black)](https://github.com/d3uceY/Clipcat/releases/latest/download/Clipcat-linux-amd64)

Windows 10/11 · macOS 12+ · Linux x86-64 (X11). No build is code-signed.

## Install

| Platform | Steps |
| --- | --- |
| **Windows** | Run the installer. SmartScreen → **More info** → **Run anyway**. Portable `.exe` is on the release page. |
| **macOS** | Drag Clipcat into **Applications**, then launch it. Gatekeeper → **System Settings → Privacy & Security → Open Anyway**. Grant **Accessibility** so paste works. |
| **Linux** | `sudo dpkg -i Clipcat-linux-amd64.deb` - adds Clipcat to your app menu. Bare binary: install `libgtk-4-1 libwebkitgtk-6.0-4 xdotool` (Wayland: add `wl-clipboard`). |

## Docs

Features, shortcuts, settings, LAN sync and privacy: **[getclipcat.com](https://getclipcat.com/docs/intro)**

## Built with

Go · Wails v3 · SQLite · React 19 · TypeScript · Tailwind CSS

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Bug reports go to [issues](https://github.com/d3uceY/Clipcat/issues).

MIT © [Onyekwelu Jesse](https://github.com/d3uceY)
