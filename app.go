package main

import (
	"Clipcat/backend/lib"
	"Clipcat/backend/lib/clipboard"
	"Clipcat/backend/lib/startup"
	"Clipcat/backend/store"
	"Clipcat/backend/tray"
	"context"
	"encoding/base64"
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

// domReady is called after the frontend DOM is fully loaded.
// We show the window here (instead of in startup) so it only
// becomes visible once React has rendered — no white flash.
func (a *App) domReady(ctx context.Context) {
	// Restore window state before showing — applied while window is still hidden
	// so there is no visible repaint or resize flash.
	if alwaysOnTop, err := store.GetAlwaysOnTop(); err == nil && alwaysOnTop {
		runtime.WindowSetAlwaysOnTop(a.ctx, true)
	}
	if miniClip, err := store.GetMiniClip(); err == nil && miniClip {
		a.makeMiniClip(true)
	}
	
	runtime.WindowShow(a.ctx)
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

	// migrations and other startup tasks
	store.CreateTables()
	store.MigrateClipsTable()
	store.MigrateSettingsTable()
	store.MigrateStartupDefaultColumn()
	store.MigrateEncryptionColumns()
	store.MigrateIndexes()
	store.MigrateThumbnailColumn()
	if err := store.InitEncryption(); err != nil {
		panic(err)
	}
	store.MigrateEncryptOldClips()
	store.MigrateLabelColumn()
	store.MigrateHiddenColumn()
	store.MigrateAutoHideSetting()
	store.MigrateAlwaysOnTopSetting()
	store.MigrateMiniClipSetting()

	// Enable launch-on-startup by default on first run.
	// ClaimStartupDefault returns true only once — so if the user later
	// disables startup, this won't silently re-enable it on the next launch.
	if store.ClaimStartupDefault() {
		_ = startup.EnableStartupWindows()
	}

	// store.SeedTestClips(500)      // PERF TEST: uncomment to insert n test text clips on startup
	// store.SeedTestImageClips(1000) // PERF TEST: uncomment to duplicate the last image clip n times on startup

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
			clip, prunedIDs, inserted, err := store.AddImageClip(img)
			if err != nil {
				fmt.Println("failed to save image:", err)
			}
			if a.ctx != nil && inserted {
				if clip != nil {
					runtime.EventsEmit(a.ctx, "clip:added", clip)
				}
				if len(prunedIDs) > 0 {
					prunedStrs := make([]string, len(prunedIDs))
					for i, pid := range prunedIDs {
						prunedStrs[i] = fmt.Sprintf("clip_%03d", pid)
					}
					runtime.EventsEmit(a.ctx, "clip:pruned", prunedStrs)
				}
			}
			return
		}

		// Fallback to text
		text := string(gclip.Read(gclip.FmtText))
		if text == "" {
			return
		}

		clip, prunedIDs, inserted, err := store.AddClip(text, "text")
		if err != nil {
			fmt.Println("failed to save text:", err)
			return
		}

		if a.ctx != nil && inserted {
			if clip != nil {
				runtime.EventsEmit(a.ctx, "clip:added", clip)
			}
			if len(prunedIDs) > 0 {
				prunedStrs := make([]string, len(prunedIDs))
				for i, pid := range prunedIDs {
					prunedStrs[i] = fmt.Sprintf("clip_%03d", pid)
				}
				runtime.EventsEmit(a.ctx, "clip:pruned", prunedStrs)
			}
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
	err := store.UpdateClipContent(clipID, newContent)
	if err != nil {
		return err
	}
	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, "clip:updated", map[string]interface{}{
			"id":      fmt.Sprintf("clip_%03d", clipID),
			"content": newContent,
			"length":  len(newContent),
		})
	}
	return nil
}

func (a *App) TogglePin(clipID int) error {
	isPinned, err := store.TogglePinClip(clipID)
	if err != nil {
		return err
	}
	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, "clip:pinToggled", map[string]interface{}{
			"id":       fmt.Sprintf("clip_%03d", clipID),
			"isPinned": isPinned,
		})
	}
	return nil
}

func (a *App) Delete(clipID int) error {
	err := store.DeleteClip(clipID)
	if err != nil {
		return err
	}
	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, "clip:deleted", fmt.Sprintf("clip_%03d", clipID))
	}
	return nil
}

func (a *App) GetClipImage(clipID int) (string, error) {
	return store.GetClipImage(clipID)
}

func (a *App) GetDistinctLabels() ([]string, error) {
	return store.GetDistinctLabels()
}

func (a *App) RenameClip(clipID int, label string) error {
	if err := store.RenameClip(clipID, label); err != nil {
		return err
	}
	if a.ctx != nil {
		if labels, err := store.GetDistinctLabels(); err == nil {
			runtime.EventsEmit(a.ctx, "labels:updated", labels)
		}
	}
	return nil
}

func (a *App) GetAutoHideSensitive() (bool, error) {
	return store.GetAutoHideSensitive()
}

func (a *App) SetAutoHideSensitive(enabled bool) error {
	return store.SetAutoHideSensitive(enabled)
}

func (a *App) UnhideClip(clipID int) error {
	if err := store.UnhideClip(clipID); err != nil {
		return err
	}
	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, "clip:unhidden", fmt.Sprintf("clip_%03d", clipID))
	}
	return nil
}

func (a *App) HideClip(clipID int) error {
	if err := store.HideClip(clipID); err != nil {
		return err
	}
	if a.ctx != nil {
		runtime.EventsEmit(a.ctx, "clip:hidden", fmt.Sprintf("clip_%03d", clipID))
	}
	return nil
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

func (a *App) GetQuickPaste() (bool, error) {
	return store.GetQuickPaste()
}

func (a *App) SetQuickPaste(enabled bool) error {
	return store.SetQuickPaste(enabled)
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
	quickPaste, _ := store.GetQuickPaste()
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

// PasteImageToWindow writes the image for the given clip ID to the system
// clipboard as raw image data, then pastes it into the previously focused window.
func (a *App) PasteImageToWindow(clipID int) error {
	b64, err := store.GetClipImage(clipID)
	if err != nil {
		return err
	}
	imgBytes, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return err
	}
	gclip.Write(gclip.FmtImage, imgBytes)

	if !clipboard.HasPreviousWindow() {
		return nil
	}

	quickPaste, _ := store.GetQuickPaste()
	if quickPaste {
		runtime.WindowHide(a.ctx)
	}

	time.Sleep(80 * time.Millisecond)
	clipboard.FocusPreviousWindow()
	time.Sleep(100 * time.Millisecond)
	clipboard.SimulatePaste()
	return nil
}

// FocusAndPaste focuses the previously active window and simulates Ctrl+V.
// Call this after writing image data to the clipboard from the frontend via
// the Web Clipboard API, which produces a format apps can reliably paste.
func (a *App) FocusAndPaste() error {
	if !clipboard.HasPreviousWindow() {
		return nil
	}

	quickPaste, _ := store.GetQuickPaste()
	if quickPaste {
		runtime.WindowHide(a.ctx)
	}

	time.Sleep(80 * time.Millisecond)
	clipboard.FocusPreviousWindow()
	time.Sleep(100 * time.Millisecond)
	clipboard.SimulatePaste()
	return nil
}

func (a *App) AddClip(content string, pinned bool) error {
	clip, prunedIDs, inserted, err := store.AddManualClip(content, pinned)
	if err != nil {
		return err
	}
	if a.ctx != nil && inserted {
		if clip != nil {
			runtime.EventsEmit(a.ctx, "clip:added", clip)
		}
		if len(prunedIDs) > 0 {
			prunedStrs := make([]string, len(prunedIDs))
			for i, pid := range prunedIDs {
				prunedStrs[i] = fmt.Sprintf("clip_%03d", pid)
			}
			runtime.EventsEmit(a.ctx, "clip:pruned", prunedStrs)
		}
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

	if value {
		runtime.WindowSetPosition(a.ctx, 20, 20)
		runtime.WindowSetMaxSize(a.ctx, 450, 650)
	} else {
		runtime.WindowSetMaxSize(a.ctx, 0, 0)
	}

	a.isMiniClip = value
}

func (a *App) MakeMiniClip(value bool) {
	a.makeMiniClip(value)
	_ = store.SetMiniClip(value)
}

func (a *App) IsMiniClip() bool {
	return a.isMiniClip
}

// --------------------------------------------------------------------------------
// Always On Top
// --------------------------------------------------------------------------------

func (a *App) GetAlwaysOnTop() (bool, error) {
	return store.GetAlwaysOnTop()
}

func (a *App) SetAlwaysOnTop(enabled bool) error {
	if err := store.SetAlwaysOnTop(enabled); err != nil {
		return err
	}
	runtime.WindowSetAlwaysOnTop(a.ctx, enabled)
	return nil
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
