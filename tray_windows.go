//go:build windows

package main

import (
	_ "embed"

	"Clipcat/backend/lib/clipboard"
	"Clipcat/backend/store"

	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed build/windows/icon.ico
var trayIcon []byte

func (a *App) startTray() {
	systray := a.app.SystemTray.New()
	systray.SetIcon(trayIcon)
	systray.SetTooltip("Clipcat - press Ctrl+Shift+V to open")

	menu := a.app.NewMenu()
	menu.Add("Show Clipcat").OnClick(func(ctx *application.Context) {
		a.window.Show()
		a.window.SetAlwaysOnTop(true)
		a.window.SetAlwaysOnTop(false)
	})
	menu.AddSeparator()

	// Default unchecked — synced from DB later via syncTrayMenu().
	quickPasteItem := menu.AddCheckbox("Quick Paste", false)
	quickPasteItem.OnClick(func(ctx *application.Context) {
		enabled := ctx.ClickedMenuItem().Checked()
		_ = store.SetQuickPaste(enabled)
	})

	pauseItem := menu.AddCheckbox("Pause Capture", false)
	pauseItem.OnClick(func(ctx *application.Context) {
		if ctx.ClickedMenuItem().Checked() {
			clipboard.PauseCapture()
		} else {
			clipboard.ResumeCapture()
		}
	})

	menu.AddSeparator()
	menu.Add("Quit").OnClick(func(ctx *application.Context) {
		a.app.Quit()
	})

	systray.SetMenu(menu)
	systray.AttachWindow(a.window)

	// Store references so syncTrayMenu can update checkbox states after DB init.
	a.trayMenu = menu
	a.trayQuickPasteItem = quickPasteItem
	a.trayPauseItem = pauseItem
}

// syncTrayMenu syncs tray checkbox states with the current DB/pause state.
// Called from ServiceStartup after the DB is initialized.
func (a *App) syncTrayMenu() {
	if a.trayQuickPasteItem != nil {
		quickPaste, _ := store.GetQuickPaste()
		a.trayQuickPasteItem.SetChecked(quickPaste)
	}
	if a.trayPauseItem != nil {
		a.trayPauseItem.SetChecked(clipboard.IsPaused())
	}
	if a.trayMenu != nil {
		a.trayMenu.Update()
	}
}
