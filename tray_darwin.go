//go:build darwin

package main

import (
	_ "embed"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed build/appicon-other.png
var trayIconOther []byte

func (a *App) startTray() {
	systray := a.app.SystemTray.New()
	systray.SetTemplateIcon(trayIconOther)

	menu := a.app.NewMenu()
	menu.Add("Show Clipcat").OnClick(func(ctx *application.Context) {
		a.window.Show()
		a.window.Focus()
	})
	menu.AddSeparator()
	menu.Add("Quit").OnClick(func(ctx *application.Context) {
		a.app.Quit()
	})

	systray.SetMenu(menu)
	systray.AttachWindow(a.window)
}

// syncTrayMenu is a no-op on non-Windows platforms - the basic Show/Quit menu
// has no dynamic items to sync.
func (a *App) syncTrayMenu() {}
