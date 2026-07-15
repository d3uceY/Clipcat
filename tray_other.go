//go:build !windows

package main

import (
	_ "embed"

	"Clipcat/backend/tray"
)

//go:embed build/appicon.png
var trayIcon []byte

func (a *App) startTray() {
	tray.Start(
		trayIcon,
		func() {
			a.window.Show()
			a.window.SetAlwaysOnTop(true)
			a.window.SetAlwaysOnTop(false)
		},
		func() {
			a.app.Quit()
		},
	)
}
