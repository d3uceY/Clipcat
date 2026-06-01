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

func GetQuickPaste() (bool, error) {
	var v int
	err := DB.QueryRow(`SELECT ghost_mode FROM settings WHERE id = 0`).Scan(&v)
	if err != nil {
		return false, err
	}
	return v == 1, nil
}

func SetQuickPaste(enabled bool) error {
	val := 0
	if enabled {
		val = 1
	}
	_, err := DB.Exec(`UPDATE settings SET ghost_mode = ? WHERE id = 0`, val)
	return err
}

func GetAutoHideSensitive() (bool, error) {
	var v int
	err := DB.QueryRow(`SELECT auto_hide_sensitive FROM settings WHERE id = 0`).Scan(&v)
	if err != nil {
		return true, err // default on
	}
	return v == 1, nil
}

func SetAutoHideSensitive(enabled bool) error {
	val := 0
	if enabled {
		val = 1
	}
	_, err := DB.Exec(`UPDATE settings SET auto_hide_sensitive = ? WHERE id = 0`, val)
	return err
}

func GetAlwaysOnTop() (bool, error) {
	var v int
	err := DB.QueryRow(`SELECT always_on_top FROM settings WHERE id = 0`).Scan(&v)
	if err != nil {
		return false, err
	}
	return v == 1, nil
}

func SetAlwaysOnTop(enabled bool) error {
	val := 0
	if enabled {
		val = 1
	}
	_, err := DB.Exec(`UPDATE settings SET always_on_top = ? WHERE id = 0`, val)
	return err
}

func GetMiniClip() (bool, error) {
	var v int
	err := DB.QueryRow(`SELECT mini_clip FROM settings WHERE id = 0`).Scan(&v)
	if err != nil {
		return false, err
	}
	return v == 1, nil
}

func SetMiniClip(enabled bool) error {
	val := 0
	if enabled {
		val = 1
	}
	_, err := DB.Exec(`UPDATE settings SET mini_clip = ? WHERE id = 0`, val)
	return err
}
