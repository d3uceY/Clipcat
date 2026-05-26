package main

import (
	"Clipcat/backend/lib"
	"Clipcat/backend/lib/clipboard"
	"Clipcat/backend/lib/startup"
	"Clipcat/backend/store"
	"Clipcat/backend/tray"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	gclip "golang.design/x/clipboard"
)

// App struct
type App struct {
	ctx        context.Context
	isMiniClip bool
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// exposes app version to frontend
func (a *App) GetVersion() string {
	return AppVersion
}

// GetPlatform returns the current OS: "darwin", "linux", or "windows".
func (a *App) GetPlatform() string {
	return lib.GetPlatform()
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx

	// initialize clipboard
	err := gclip.Init()
	if err != nil {
		panic(err)
	}

	appDir, err := getAppDataDir()
	if err != nil {
		panic(err)
	}

	dbPath := filepath.Join(appDir, "gyatt.db")

	err = store.InitDB(dbPath)
	if err != nil {
		panic(err)
	}

	store.CreateTables()
	store.MigrateClipsTable()
	store.MigrateSettingsTable()
	store.MigrateEncryptionColumns()
	store.MigrateIndexes()
	store.MigrateThumbnailColumn()
	if err := store.InitEncryption(); err != nil {
		panic(err)
	}
	store.MigrateEncryptOldClips()

	// store.SeedTestClips(500) // PERF TEST: uncomment to insert 500 test clips on startup

	// Sync the ignore list from the DB into the in-memory clipboard filter.
	if ignoreList, err := store.GetIgnoreList(); err == nil {
		clipboard.SetIgnoredProcesses(ignoreList)
	}

	// Register our PID so the focus tracker never treats Clipcat's own window
	// as the paste target, then start tracking.
	clipboard.SetOurProcessID(uint32(os.Getpid()))
	clipboard.StartFocusTracker()

	// Start the system-tray icon so the app is reachable while hidden.
	a.startTray()

	// If Ghost Mode was left on from the last session, hide into the tray
	// immediately so the user never sees the window on startup.
	if ghostMode, err := store.GetGhostMode(); err == nil && ghostMode {
		runtime.WindowHide(a.ctx)
	}

	// start clipboard listener
	var lastImage []byte
	clipboard.StartClipboardListener(func() {
		// Try image first

		if img := gclip.Read(gclip.FmtImage); img != nil {
			lastImagePtr := &lastImage

			if string(*lastImagePtr) == string(img) {
				// same image as before, skip
				return
			}

			// new image, save it
			*lastImagePtr = img
			inserted, err := store.AddImageClip(img)
			if err != nil {
				fmt.Println("failed to save image:", err)
			}
			if a.ctx != nil && inserted {
				runtime.EventsEmit(a.ctx, "clipboard:changed")
			}
			return
		}

		// Fallback to text
		text := string(gclip.Read(gclip.FmtText))
		if text == "" {
			return
		}

		inserted, err := store.AddClip(text, "text")
		if err != nil {
			fmt.Println("failed to save text:", err)
			return
		}

		if a.ctx != nil && inserted {
			runtime.EventsEmit(a.ctx, "clipboard:changed", text)
		}
	}, func() {
		// Hotkey (Ctrl+Shift+V) fired — show Clipcat and bring it to the front.
		if a.ctx == nil {
			return
		}
		tray.Activate()
		runtime.WindowShow(a.ctx)
		runtime.WindowSetAlwaysOnTop(a.ctx, true)
		time.Sleep(150 * time.Millisecond)
		runtime.WindowSetAlwaysOnTop(a.ctx, false)
	})
}

func getAppDataDir() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}

	appDir := filepath.Join(dir, "clipussy/db")
	err = os.MkdirAll(appDir, 0755)

	return appDir, err
}

// --------------------------------------------------------------------------------
// Storage Limit Functions
// --------------------------------------------------------------------------------
func (a *App) GetStorageLimit() (int, error) {
	return store.GetStorageLimit()
}

func (a *App) UpdateStorageLimit(newLimit int) error {
	return store.UpdateStorageLimit(newLimit)
}

// --------------------------------------------------------------------------------
// Clip Management Functions
// --------------------------------------------------------------------------------
func (a *App) GetClips() ([]store.Clip, error) {
	return store.GetClips()
}

func (a *App) UpdateClipContent(clipID int, newContent string) error {
	return store.UpdateClipContent(clipID, newContent)
}

func (a *App) TogglePin(clipID int) error {
	return store.TogglePinClip(clipID)
}

func (a *App) Delete(clipID int) error {
	return store.DeleteClip(clipID)
}

func (a *App) GetClipImage(clipID int) (string, error) {
	return store.GetClipImage(clipID)
}

func (a *App) DeleteAllClips() error {
	return store.DeleteAllClips(a.ctx)
}

func (a *App) DeletePinnedClips() error {
	return store.DeletePinnedClips(a.ctx)
}

func (a *App) DeleteUnpinnedClips() error {
	return store.DeleteUnpinnedClips(a.ctx)
}

// --------------------------------------------------------------------------------
// Capture Pause / Resume
// --------------------------------------------------------------------------------

func (a *App) PauseCapture() {
	clipboard.PauseCapture()
}

func (a *App) ResumeCapture() {
	clipboard.ResumeCapture()
}

func (a *App) IsPaused() bool {
	return clipboard.IsPaused()
}

// --------------------------------------------------------------------------------
// Ghost Mode
// --------------------------------------------------------------------------------

func (a *App) GetGhostMode() (bool, error) {
	return store.GetGhostMode()
}

func (a *App) SetGhostMode(enabled bool) error {
	return store.SetGhostMode(enabled)
}

// --------------------------------------------------------------------------------
// Ignore List
// --------------------------------------------------------------------------------

func (a *App) GetIgnoreList() ([]string, error) {
	return store.GetIgnoreList()
}

func (a *App) AddIgnoreEntry(name string) error {
	if err := store.AddIgnoreEntry(name); err != nil {
		return err
	}
	// Keep the in-memory filter in sync.
	if list, err := store.GetIgnoreList(); err == nil {
		clipboard.SetIgnoredProcesses(list)
	}
	return nil
}

func (a *App) RemoveIgnoreEntry(name string) error {
	if err := store.RemoveIgnoreEntry(name); err != nil {
		return err
	}
	if list, err := store.GetIgnoreList(); err == nil {
		clipboard.SetIgnoredProcesses(list)
	}
	return nil
}

// --------------------------------------------------------------------------------
// Paste to Previous Window
// --------------------------------------------------------------------------------
//
// Sets the clipboard to the given text, hides Clipcat, re-focuses the window
// that was active when the hotkey was pressed, then simulates paste
// (Ctrl+V on Windows/Linux, Cmd+V on macOS).

func (a *App) PasteToWindow(content string) error {
	// Write content to the system clipboard.
	gclip.Write(gclip.FmtText, []byte(content))

	// If there is no previous window to paste into, just leave the content in
	// the clipboard and keep the window visible so the user isn't left stranded.
	if !clipboard.HasPreviousWindow() {
		return nil
	}

	// Only hide the window when Quick Paste mode is active. In normal mode the
	// app stays visible after the paste so the user can keep picking clips.
	quickPaste, _ := store.GetGhostMode()
	if quickPaste {
		runtime.WindowHide(a.ctx)
	}

	// Give the window manager time to hide Clipcat before we refocus.
	time.Sleep(80 * time.Millisecond)

	// Restore focus to where the user was, then fire the paste keystroke.
	clipboard.FocusPreviousWindow()

	// Give the target app time to come to the foreground.
	time.Sleep(100 * time.Millisecond)

	clipboard.SimulatePaste()
	return nil
}

func (a *App) AddClip(content string, pinned bool) error {
	inserted, err := store.AddManualClip(content, pinned)
	if err != nil {
		return err
	}
	if a.ctx != nil && inserted {
		runtime.EventsEmit(a.ctx, "clipboard:changed")
	}
	return nil
}

// --------------------------------------------------------------------------------
// Mini Clip Mode Functions
// --------------------------------------------------------------------------------
func (a *App) makeMiniClip(value bool) {
	if a.isMiniClip == value {
		return
	}

	runtime.WindowUnmaximise(a.ctx)
	runtime.WindowSetAlwaysOnTop(a.ctx, value)

	if value {
		runtime.WindowSetPosition(a.ctx, 20, 20)
		runtime.WindowSetMaxSize(a.ctx, 500, 300)
	} else {
		runtime.WindowSetMaxSize(a.ctx, 0, 0)
	}

	a.isMiniClip = value
}

func (a *App) MakeMiniClip(value bool) {
	a.makeMiniClip(value)
}

func (a *App) IsMiniClip() bool {
	return a.isMiniClip
}

//
// --------------------------------------------------------------------------------
// Windows Startup Management Functions
// --------------------------------------------------------------------------------
//

func (a *App) EnableStartup() error {
	return startup.EnableStartupWindows()
}

func (a *App) DisableStartup() error {
	return startup.RemoveStartupWindows()
}

func (a *App) IsStartupEnabled() (bool, error) {
	return startup.IsStartupEnabledWindows()
}
