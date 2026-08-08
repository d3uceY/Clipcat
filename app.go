package main

import (
	"Clipcat/backend/lib"
	"Clipcat/backend/lib/clipboard"
	"Clipcat/backend/lib/startup"
	"Clipcat/backend/lib/winpos"
	"Clipcat/backend/store"
	lansync "Clipcat/backend/sync"
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/services/notifications"
	gclip "golang.design/x/clipboard"
)

// App struct
type App struct {
	app    *application.App
	window *application.WebviewWindow
	notif  *notifications.NotificationService

	isMiniClip bool

	// In-memory last-clip cache - avoids a DB round-trip for back-to-back
	// identical copies.
	lastMu    sync.Mutex
	lastText  string
	lastImage []byte

	// LAN sync
	syncManager *lansync.Manager

	// Tray menu items for post-DB-init state sync.
	trayMenu           *application.Menu
	trayQuickPasteItem *application.MenuItem
	trayPauseItem      *application.MenuItem
}

// NewApp creates a new App application struct
func NewApp(app *application.App, window *application.WebviewWindow, notif *notifications.NotificationService) *App {
	return &App{app: app, window: window, notif: notif}
}

// exposes app version to frontend
func (a *App) GetVersion() string {
	return AppVersion
}

// GetPlatform returns the current OS: "darwin", "linux", or "windows".
func (a *App) GetPlatform() string {
	return lib.GetPlatform()
}

// ServiceStartup is called when the app starts. It replaces the v2 startup+domReady callbacks.
func (a *App) ServiceStartup(ctx context.Context, options application.ServiceOptions) error {
	store.SetAppInstance(a.app)
	store.SetNotifService(a.notif)

	// initialize clipboard
	if err := gclip.Init(); err != nil {
		panic(err)
	}

	appDir, err := getAppDataDir()
	if err != nil {
		panic(err)
	}

	if err := store.InitDB(filepath.Join(appDir, "gyatt.db")); err != nil {
		panic(err)
	}

	store.RunMigrations()

	// Enable launch-on-startup by default on first run.
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
	// The tray itself is created in main() before app.Run().
	// Sync the tray menu checkbox states now that the DB is ready.
	a.syncTrayMenu()

	clipboard.StartClipboardListener(a.onClipboardChange, a.onHotkeyFired)

	// Start LAN sync if enabled.
	if enabled, _ := store.GetSyncEnabled(); enabled {
		if passphrase, _ := store.GetSyncPassphrase(); passphrase != "" {
			a.startSyncManager(passphrase)
		}
	}

	// Restore window state before the event loop shows it.
	if alwaysOnTop, err := store.GetAlwaysOnTop(); err == nil && alwaysOnTop {
		a.window.SetAlwaysOnTop(true)
	}
	if miniClip, err := store.GetMiniClip(); err == nil && miniClip {
		a.makeMiniClip(true)
	}

	return nil
}

func getAppDataDir() (string, error) {
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "clipussy/db"), os.MkdirAll(filepath.Join(dir, "clipussy/db"), 0755)
}

// clipChangeMu ensures only one clipboard read is in flight at a time.
// gclip.Read on Windows calls runtime.LockOSThread internally; if many rapid
// clipboard events fire while a read is already running, concurrent calls would
// each hold a locked OS thread and could deplete the thread pool.
var clipChangeMu sync.Mutex

// onClipboardChange is called by the clipboard listener whenever the system
// clipboard contents change. It saves the new clip and notifies the frontend.
func (a *App) onClipboardChange() {
	// Skip if a previous read is still in progress. The debounce timer in the
	// clipboard listener already coalesces rapid copies, so dropping a
	// duplicate event here is safe.
	if !clipChangeMu.TryLock() {
		return
	}
	defer clipChangeMu.Unlock()

	// Use clipboard.Read* which are safe across all platforms:
	// - Linux: uses own X11 select()-based read with 5s timeout
	// - macOS/Windows: uses gclip.Read (safe on those platforms)
	if img := clipboard.ReadImage(); img != nil {
		a.handleImageClip(img)
		return
	}
	if text := clipboard.ReadText(); text != "" {
		a.handleTextClip(text)
	}
}

func (a *App) handleImageClip(img []byte) {
	a.lastMu.Lock()
	isDup := bytes.Equal(a.lastImage, img)
	a.lastImage = img
	a.lastText = ""
	a.lastMu.Unlock()

	if isDup {
		// Still add - AddImageClip handles re-insert at top.
		// Skip broadcast since peers already have it.
		clip, prunedIDs, deletedID, _, _ := store.AddImageClip(img)
		if deletedID > 0 {
			a.app.Event.Emit("clip:deleted", fmt.Sprintf("clip_%03d", deletedID))
		}
		if clip != nil {
			a.emitClipAdded(clip, prunedIDs)
		}
		return
	}

	clip, prunedIDs, deletedID, inserted, err := store.AddImageClip(img)
	if err != nil {
		fmt.Println("failed to save image:", err)
	}
	if deletedID > 0 {
		a.app.Event.Emit("clip:deleted", fmt.Sprintf("clip_%03d", deletedID))
	}
	if inserted {
		a.emitClipAdded(clip, prunedIDs)
	}

	if inserted && clip != nil {
		a.broadcastImageClip(img)
	}
}

func (a *App) handleTextClip(text string) {
	a.lastMu.Lock()
	isDup := a.lastText == text
	a.lastText = text
	a.lastImage = nil
	a.lastMu.Unlock()

	if isDup {
		clip, prunedIDs, deletedID, _, _ := store.AddClip(text, "text")
		if deletedID > 0 {
			a.app.Event.Emit("clip:deleted", fmt.Sprintf("clip_%03d", deletedID))
		}
		if clip != nil {
			a.emitClipAdded(clip, prunedIDs)
		}
		return
	}

	clip, prunedIDs, deletedID, inserted, err := store.AddClip(text, "text")
	if err != nil {
		fmt.Println("failed to save text:", err)
		return
	}
	if deletedID > 0 {
		a.app.Event.Emit("clip:deleted", fmt.Sprintf("clip_%03d", deletedID))
	}
	if inserted {
		a.emitClipAdded(clip, prunedIDs)
	}

	if inserted && clip != nil {
		a.broadcastTextClip(text)
	}
}

func (a *App) emitClipAdded(clip *store.Clip, prunedIDs []int) {
	if clip != nil {
		a.app.Event.Emit("clip:added", clip)
	}
	if len(prunedIDs) > 0 {
		prunedStrs := make([]string, len(prunedIDs))
		for i, pid := range prunedIDs {
			prunedStrs[i] = fmt.Sprintf("clip_%03d", pid)
		}
		a.app.Event.Emit("clip:pruned", prunedStrs)
	}
}

// ── LAN Sync Helpers ──────────────────────────────────────────────────────

// startSyncManager creates and starts the LAN sync manager with the given
// passphrase.  The onReceive callback inserts incoming clips from the
// network (with source='network') and emits a clip:added event so the
// frontend picks them up.
func (a *App) startSyncManager(passphrase string) {
	mgr := lansync.NewManager(passphrase)
	mgr.SetOnReceive(func(payload []byte) {
		a.onReceiveClip(payload)
	})
	if err := mgr.Start(); err != nil {
		fmt.Println("[sync] failed to start:", err)
		return
	}
	a.syncManager = mgr
}

// onReceiveClip handles a decrypted payload from the network.  The first
// byte is the clip type (0=text, 1=image), the rest is the content.
func (a *App) onReceiveClip(payload []byte) {
	if len(payload) == 0 {
		return
	}

	switch payload[0] {
	case 0: // text
		text := string(payload[1:])
		clip, err := store.AddNetworkClip(text, "text", nil)
		if err != nil {
			fmt.Println("[sync] failed to save network text:", err)
			return
		}
		a.app.Event.Emit("clip:added", clip)

	case 1: // image
		img := payload[1:]
		clip, err := store.AddNetworkClip("", "image", img)
		if err != nil {
			fmt.Println("[sync] failed to save network image:", err)
			return
		}
		a.app.Event.Emit("clip:added", clip)
	}
}

// broadcastTextClip sends a text clip to all LAN peers.
func (a *App) broadcastTextClip(text string) {
	if a.syncManager == nil {
		return
	}
	envelope := append([]byte{0}, []byte(text)...)
	a.syncManager.Broadcast(envelope)
}

// broadcastImageClip sends an image clip to all LAN peers.
func (a *App) broadcastImageClip(img []byte) {
	if a.syncManager == nil {
		return
	}
	envelope := append([]byte{1}, img...)
	a.syncManager.Broadcast(envelope)
}

// ── LAN Sync Bindings ─────────────────────────────────────────────────────

// SyncSettings holds the frontend-facing LAN sync configuration.
type SyncSettings struct {
	Enabled    bool   `json:"enabled"`
	Passphrase string `json:"passphrase"`
	PeerCount  int    `json:"peerCount"`
}

// GetSyncSettings returns the current sync configuration.
func (a *App) GetSyncSettings() (SyncSettings, error) {
	enabled, err := store.GetSyncEnabled()
	if err != nil {
		return SyncSettings{}, err
	}
	passphrase, err := store.GetSyncPassphrase()
	if err != nil {
		return SyncSettings{}, err
	}
	peerCount := 0
	if a.syncManager != nil {
		peerCount = a.syncManager.PeerCount()
	}
	return SyncSettings{
		Enabled:    enabled,
		Passphrase: passphrase,
		PeerCount:  peerCount,
	}, nil
}

// SaveSyncSettings persists the sync configuration and starts or stops the
// sync manager accordingly.
func (a *App) SaveSyncSettings(enabled bool, passphrase string) error {
	if err := store.SetSyncEnabled(enabled); err != nil {
		return err
	}
	if err := store.SetSyncPassphrase(passphrase); err != nil {
		return err
	}

	// Stop the current manager if running.
	if a.syncManager != nil {
		a.syncManager.Stop()
		a.syncManager = nil
	}

	// Start a new manager if enabled and a passphrase is set.
	if enabled && passphrase != "" {
		a.startSyncManager(passphrase)
	}

	return nil
}

// GetSyncPeerCount returns the number of currently connected LAN peers.
func (a *App) GetSyncPeerCount() int {
	if a.syncManager == nil {
		return 0
	}
	return a.syncManager.PeerCount()
}

// onHotkeyFired is called when the user presses Ctrl+Shift+V. It shows the
// Clipcat window, optionally repositioning it near the cursor first.
//
// Positioning is DPI/multi-monitor safe: GetCursorPos returns physical
// (native) pixels, so it is converted to DIP via Wails' own ScreenManager
// (application.PhysicalToDipPoint / ScreenNearestPhysicalPoint) using the
// SAME monitor's scale factor that Wails itself will use when the window is
// finally moved. This avoids mixing physical and DIP units - a.window.Width()
// / Height() and SetPosition are always in DIP - which previously caused the
// window to land on the wrong monitor or far from the cursor on any screen
// with a scale factor other than 100%.
func (a *App) onHotkeyFired() {
	quickPaste, _ := store.GetQuickPaste()
	if cursorSnap, _ := store.GetCursorSnap(); cursorSnap && quickPaste {
		cx, cy := clipboard.GetCursorPos()
		physicalCursor := application.Point{X: cx, Y: cy}

		screen := application.ScreenNearestPhysicalPoint(physicalCursor)
		if screen != nil {
			dipCursor := application.PhysicalToDipPoint(physicalCursor)

			ww, wh := a.window.Width(), a.window.Height()
			if ww <= 0 || wh <= 0 {
				ww, wh = 450, 650
			}

			pos := winpos.CalcWindowPos(
				winpos.Point{X: dipCursor.X, Y: dipCursor.Y},
				winpos.Size{W: ww, H: wh},
				winpos.Rect{X: screen.WorkArea.X, Y: screen.WorkArea.Y, W: screen.WorkArea.Width, H: screen.WorkArea.Height},
			)
			a.window.SetPosition(pos.X, pos.Y)
		}
	}

	a.window.Show()
	a.window.Focus()
	if alwaysOnTop, err := store.GetAlwaysOnTop(); err == nil {
		a.window.SetAlwaysOnTop(alwaysOnTop)
	}

	// Quick Paste re-summon: the window was hidden by the last paste, so tell
	// the frontend to jump to the Recent section where the freshest clips are.
	if quickPaste {
		a.app.Event.Emit("window:quickpaste-shown")
	}
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
	if err := store.UpdateClipContent(clipID, newContent); err != nil {
		return err
	}
	a.app.Event.Emit("clip:updated", map[string]interface{}{
		"id":      fmt.Sprintf("clip_%03d", clipID),
		"content": newContent,
		"length":  len(newContent),
	})
	return nil
}

func (a *App) TogglePin(clipID int) error {
	isPinned, err := store.TogglePinClip(clipID)
	if err != nil {
		return err
	}
	a.app.Event.Emit("clip:pinToggled", map[string]interface{}{
		"id":       fmt.Sprintf("clip_%03d", clipID),
		"isPinned": isPinned,
	})
	return nil
}

func (a *App) Delete(clipID int) error {
	if err := store.DeleteClip(clipID); err != nil {
		return err
	}
	a.app.Event.Emit("clip:deleted", fmt.Sprintf("clip_%03d", clipID))
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
	if labels, err := store.GetDistinctLabels(); err == nil {
		a.app.Event.Emit("labels:updated", labels)
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
	a.app.Event.Emit("clip:unhidden", fmt.Sprintf("clip_%03d", clipID))
	return nil
}

func (a *App) HideClip(clipID int) error {
	if err := store.HideClip(clipID); err != nil {
		return err
	}
	a.app.Event.Emit("clip:hidden", fmt.Sprintf("clip_%03d", clipID))
	return nil
}

// ConfirmDelete shows a native Yes/No dialog and returns true if the user
// confirmed the deletion. The message is shown as the dialog body.
func (a *App) ConfirmDelete(message string) bool {
	ch := make(chan bool, 1)

	dialog := a.app.Dialog.Question().
		SetTitle("Confirm Delete").
		SetMessage(message)

	deleteBtn := dialog.AddButton("Delete")
	deleteBtn.OnClick(func() { ch <- true })

	cancelBtn := dialog.AddButton("Cancel")
	cancelBtn.OnClick(func() { ch <- false })

	dialog.SetDefaultButton(deleteBtn)
	dialog.SetCancelButton(cancelBtn)
	dialog.Show()

	return <-ch
}

func (a *App) DeleteAllClips() error {
	return store.DeleteAllClips()
}

func (a *App) DeletePinnedClips() error {
	return store.DeletePinnedClips()
}

func (a *App) DeleteUnpinnedClips() error {
	return store.DeleteUnpinnedClips()
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
		a.window.Hide()
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
		a.window.Hide()
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
		a.window.Hide()
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
	if inserted {
		if clip != nil {
			a.app.Event.Emit("clip:added", clip)
		}
		if len(prunedIDs) > 0 {
			prunedStrs := make([]string, len(prunedIDs))
			for i, pid := range prunedIDs {
				prunedStrs[i] = fmt.Sprintf("clip_%03d", pid)
			}
			a.app.Event.Emit("clip:pruned", prunedStrs)
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

	a.window.UnMaximise()

	if value {
		a.window.SetMaxSize(450, 650)
	} else {
		a.window.SetMaxSize(0, 0)
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
	a.window.SetAlwaysOnTop(enabled)
	return nil
}

// --------------------------------------------------------------------------------
// Smart Position (cursor-aware window placement)
// --------------------------------------------------------------------------------

func (a *App) GetCursorSnap() (bool, error) {
	return store.GetCursorSnap()
}

func (a *App) SetCursorSnap(enabled bool) error {
	return store.SetCursorSnap(enabled)
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
