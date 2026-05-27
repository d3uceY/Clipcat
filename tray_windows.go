//go:build windows

package main

import (
	_ "embed"

	"Clipcat/backend/lib/clipboard"
	"Clipcat/backend/store"
	"Clipcat/backend/tray"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed build/windows/icon.ico
var trayIcon []byte

func (a *App) startTray() {
	tray.Start(tray.Options{
		IconBytes: trayIcon,
		OnShow: func() {
			if a.ctx != nil {
				runtime.WindowShow(a.ctx)
				runtime.WindowSetAlwaysOnTop(a.ctx, true)
				runtime.WindowSetAlwaysOnTop(a.ctx, false)
			}
		},
		OnQuit: func() {
			if a.ctx != nil {
				runtime.Quit(a.ctx)
			}
		},
		GetQuickPaste: func() bool {
			v, _ := store.GetGhostMode()
			return v
		},
		SetQuickPaste: func(enabled bool) {
			_ = store.SetGhostMode(enabled)
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
