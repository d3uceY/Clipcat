//go:build windows

package main

import (
	_ "embed"

	"Clipcat/backend/tray"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed build/windows/icon.ico
var trayIcon []byte

func (a *App) startTray() {
	tray.Start(
		trayIcon,
		func() {
			if a.ctx != nil {
				runtime.WindowShow(a.ctx)
				runtime.WindowSetAlwaysOnTop(a.ctx, true)
				runtime.WindowSetAlwaysOnTop(a.ctx, false)
			}
		},
		func() {
			if a.ctx != nil {
				runtime.Quit(a.ctx)
			}
		},
	)
}
