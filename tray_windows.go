//go:build windows

package main

import (
	_ "embed"

	"Clipcat/backend/lib/clipboard"
	"Clipcat/backend/store"
	"Clipcat/backend/tray"
)

//go:embed build/windows/icon.ico
var trayIcon []byte

func (a *App) startTray() {
	tray.Start(tray.Options{
		IconBytes: trayIcon,
		OnShow: func() {
			a.window.Show()
			a.window.SetAlwaysOnTop(true)
			a.window.SetAlwaysOnTop(false)
		},
		OnQuit: func() {
			a.app.Quit()
		},
		GetQuickPaste: func() bool {
			v, _ := store.GetQuickPaste()
			return v
		},
		SetQuickPaste: func(enabled bool) {
			_ = store.SetQuickPaste(enabled)
		},
		GetPaused: func() bool {
			return clipboard.IsPaused()
		},
		SetPaused: func(paused bool) {
			if paused {
				clipboard.PauseCapture()
			} else {
				clipboard.ResumeCapture()
			}
		},
	})
}
