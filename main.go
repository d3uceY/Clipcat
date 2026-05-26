package main

import (
	"embed"
	"runtime"

	"Clipcat/backend/platform"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

const AppVersion = "v0.8.4"

func main() {
	if !prepareDarwinBundleLaunch() {
		return
	}

	if !platform.EnsureSingleInstance() {
		return
	}

	// Create an instance of the app structure
	app := NewApp()

	// Frameless only on Windows where we have custom window controls.
	// macOS and Linux use native decorations.
	frameless := runtime.GOOS == "windows"

	// Create application with options
	err := wails.Run(&options.App{
		Title:     "Clipcat",
		Width:     600,
		Height:    450,
		MinWidth:  300,
		MinHeight: 300,
		Frameless: frameless,
		// On macOS/Linux: closing the window hides it instead of quitting.
		// The user can quit via the tray menu → Quit.
		HideWindowOnClose: true,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 245, G: 245, B: 240, A: 1},
		OnStartup:        app.startup,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
