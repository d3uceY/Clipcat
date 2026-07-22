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

	quickPaste, _ := store.GetQuickPaste()
	menu.AddCheckbox("Quick Paste", quickPaste).OnClick(func(ctx *application.Context) {
		enabled := ctx.ClickedMenuItem().Checked()
		_ = store.SetQuickPaste(enabled)
	})

	paused := clipboard.IsPaused()
	menu.AddCheckbox("Pause Capture", paused).OnClick(func(ctx *application.Context) {
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
}
