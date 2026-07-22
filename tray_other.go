//go:build !windows

package main

import (
	_ "embed"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed build/appicon.png
var trayIcon []byte

func (a *App) startTray() {
	systray := a.app.SystemTray.New()
	systray.SetTemplateIcon(trayIcon)
	systray.SetLabel("Clipcat")

	menu := a.app.NewMenu()
	menu.Add("Show Clipcat").OnClick(func(ctx *application.Context) {
		a.window.Show()
		// Brief always-on-top toggle helps bring the window forward on some
		// window managers without leaving it permanently on top.
		a.window.SetAlwaysOnTop(true)
		a.window.SetAlwaysOnTop(false)
	})
	menu.AddSeparator()
	menu.Add("Quit").OnClick(func(ctx *application.Context) {
		a.app.Quit()
	})

	systray.SetMenu(menu)
	systray.AttachWindow(a.window)
}

// syncTrayMenu is a no-op on non-Windows platforms — the basic Show/Quit menu
// has no dynamic items to sync.
func (a *App) syncTrayMenu() {}
