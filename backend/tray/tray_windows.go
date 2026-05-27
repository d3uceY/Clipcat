//go:build windows

package tray

import (
	"github.com/getlantern/systray"
)

// Options holds all callbacks needed to drive the Windows system-tray menu.
type Options struct {
	IconBytes []byte
	OnShow    func()
	OnQuit    func()

	// Quick Paste (ghost mode) – paste into the last active window and hide.
	GetQuickPaste func() bool
	SetQuickPaste func(bool)

	// Pause Capture – temporarily stop saving new clipboard items.
	GetPaused func() bool
	SetPaused func(bool)
}

// Start launches the system-tray icon in a background goroutine.
func Start(opts Options) {
	go systray.Run(func() { onReady(opts) }, func() {})
}

func onReady(opts Options) {
	systray.SetIcon(opts.IconBytes)
	systray.SetTitle("Clipcat")
	systray.SetTooltip("Clipcat – press Ctrl+Shift+V to open")

	mShow := systray.AddMenuItem("Show Clipcat", "Bring the Clipcat window to the front")
	systray.AddSeparator()

	mQuickPaste := systray.AddMenuItem("Quick Paste", "Paste into the last active window and hide (Ctrl+Shift+V)")
	if opts.GetQuickPaste != nil && opts.GetQuickPaste() {
		mQuickPaste.Check()
	}

	mPause := systray.AddMenuItem("Pause Capture", "Temporarily stop saving new clipboard items")
	if opts.GetPaused != nil && opts.GetPaused() {
		mPause.Check()
	}

	systray.AddSeparator()
	mQuit := systray.AddMenuItem("Quit", "Exit Clipcat completely")

	go func() {
		for {
			select {
			case <-mShow.ClickedCh:
				if opts.OnShow != nil {
					opts.OnShow()
				}
			case <-mQuickPaste.ClickedCh:
				if opts.GetQuickPaste != nil && opts.SetQuickPaste != nil {
					next := !opts.GetQuickPaste()
					opts.SetQuickPaste(next)
					if next {
						mQuickPaste.Check()
					} else {
						mQuickPaste.Uncheck()
					}
				}
			case <-mPause.ClickedCh:
				if opts.GetPaused != nil && opts.SetPaused != nil {
					next := !opts.GetPaused()
					opts.SetPaused(next)
					if next {
						mPause.Check()
					} else {
						mPause.Uncheck()
					}
				}
			case <-mQuit.ClickedCh:
				systray.Quit()
				if opts.OnQuit != nil {
					opts.OnQuit()
				}
			}
		}
	}()
}
