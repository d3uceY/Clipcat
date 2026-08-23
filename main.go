package main

import (
	"embed"
	goruntime "runtime"

	"Clipcat/backend/platform"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/events"
	"github.com/wailsapp/wails/v3/pkg/services/notifications"
)

//go:embed all:frontend/dist
var assets embed.FS

const AppVersion = "v0.11.7"

func main() {
	if !prepareDarwinBundleLaunch() {
		return
	}

	if !platform.EnsureSingleInstance() {
		return
	}

	// Frameless only on Windows where we have custom window controls.
	// macOS and Linux use native decorations.
	frameless := goruntime.GOOS == "windows"

	notifService := notifications.New()

	app := application.New(application.Options{
		Name: "Clipcat",
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ActivationPolicy: application.ActivationPolicyAccessory,
			ApplicationShouldTerminateAfterLastWindowClosed: false,
		},
	})

	window := app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "Clipcat",
		Width:            600,
		Height:           450,
		MinWidth:         300,
		MinHeight:        300,
		Frameless:        frameless,
		BackgroundColour: application.NewRGBA(245, 245, 240, 255),
	})

	// On close: hide the window instead of quitting.
	// The user can quit via the tray menu -> Quit.
	window.RegisterHook(events.Common.WindowClosing, func(e *application.WindowEvent) {
		e.Cancel()
		window.Hide()
	})

	appService := NewApp(app, window, notifService)
	app.RegisterService(application.NewService(appService))
	app.RegisterService(application.NewService(notifService))

	// The systray must be created before app.Run() - Wails v3 defers its
	// actual initialization until the event loop starts, but the New() call
	// must happen before Run() to be properly registered.
	appService.startTray()

	if err := app.Run(); err != nil {
		println("Error:", err.Error())
	}
}
