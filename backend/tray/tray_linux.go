//go:build linux

package tray

import (
	"github.com/getlantern/systray"
)

// Start launches the system-tray icon using getlantern/systray.
func Start(iconBytes []byte, onShow func(), onQuit func()) {
	go systray.Run(func() { onReady(iconBytes, onShow, onQuit) }, func() {})
}

func onReady(iconBytes []byte, onShow func(), onQuit func()) {
	systray.SetIcon(iconBytes)
	systray.SetTitle("Clipcat")
	systray.SetTooltip("Clipcat – press Ctrl+Shift+V to open")

	mShow := systray.AddMenuItem("Show Clipcat", "Bring the Clipcat window to the front")
	systray.AddSeparator()
	mQuit := systray.AddMenuItem("Quit", "Exit Clipcat completely")

	go func() {
		for {
			select {
			case <-mShow.ClickedCh:
				onShow()
			case <-mQuit.ClickedCh:
				systray.Quit()
				onQuit()
			}
		}
	}()
}
