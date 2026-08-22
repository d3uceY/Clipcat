package store

// ClaimStartupDefault atomically marks the startup default as applied and
// returns true only on the very first call (i.e. a fresh install / first run
// after this migration). Subsequent calls return false, so a user who later
// disables launch-on-startup won't have it silently re-enabled.
func ClaimStartupDefault() bool {
	result, err := DB.Exec(`UPDATE settings SET startup_default_set = 1 WHERE id = 0 AND startup_default_set = 0`)
	if err != nil {
		return false
	}
	n, _ := result.RowsAffected()
	return n > 0
}

// getBool reads a boolean settings column, returning def when the row/column
// is missing (defaults live at the call site, not here).
func getBool(col string, def bool) (bool, error) {
	var v int
	if err := DB.QueryRow(`SELECT ` + col + ` FROM settings WHERE id = 0`).Scan(&v); err != nil {
		return def, err
	}
	return v == 1, nil
}

// setBool writes a boolean settings column.
func setBool(col string, v bool) error {
	val := 0
	if v {
		val = 1
	}
	_, err := DB.Exec(`UPDATE settings SET `+col+` = ? WHERE id = 0`, val)
	return err
}

func GetQuickPaste() (bool, error) {
	return getBool("ghost_mode", false)
}

func SetQuickPaste(enabled bool) error {
	return setBool("ghost_mode", enabled)
}

func GetAutoHideSensitive() (bool, error) {
	return getBool("auto_hide_sensitive", true) // default on
}

func SetAutoHideSensitive(enabled bool) error {
	return setBool("auto_hide_sensitive", enabled)
}

func GetAlwaysOnTop() (bool, error) {
	return getBool("always_on_top", false)
}

func SetAlwaysOnTop(enabled bool) error {
	return setBool("always_on_top", enabled)
}

func GetMiniClip() (bool, error) {
	return getBool("mini_clip", false)
}

func SetMiniClip(enabled bool) error {
	return setBool("mini_clip", enabled)
}

// GetCursorSnap returns whether Smart Position (cursor-aware window
// placement) is enabled.  Defaults to true when the row is missing.
func GetCursorSnap() (bool, error) {
	return getBool("cursor_snap", true) // default on
}

// SetCursorSnap persists the Smart Position preference.
func SetCursorSnap(enabled bool) error {
	return setBool("cursor_snap", enabled)
}

// GetSyncEnabled returns whether LAN sync is enabled.
func GetSyncEnabled() (bool, error) {
	return getBool("sync_enabled", false)
}

// SetSyncEnabled persists the LAN sync enabled state.
func SetSyncEnabled(enabled bool) error {
	return setBool("sync_enabled", enabled)
}

// GetSyncPassphrase returns the stored sync passphrase (empty string if none).
func GetSyncPassphrase() (string, error) {
	var v string
	err := DB.QueryRow(`SELECT sync_passphrase FROM settings WHERE id = 0`).Scan(&v)
	if err != nil {
		return "", err
	}
	return v, nil
}

// SetSyncPassphrase persists the LAN sync passphrase.
func SetSyncPassphrase(passphrase string) error {
	_, err := DB.Exec(`UPDATE settings SET sync_passphrase = ? WHERE id = 0`, passphrase)
	return err
}
