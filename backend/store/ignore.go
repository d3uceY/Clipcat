package store

import (
	"fmt"
	"strings"
)

// defaultIgnoredProcesses is the built-in block list seeded on first run.
// All entries are lowercase substrings so they match the foreground process
// name on every platform:
//   - Windows : "1password" ⊆ "1password.exe"
//   - macOS   : "1password" ⊆ "1password" (bundle binary)
//   - Linux   : "1password" ⊆ "1password"
//
// Users can remove any of these from Settings -> Privacy -> Blocked Apps.
// They will not be re-added on subsequent launches.
var defaultIgnoredProcesses = []string{
	"1password",
	"bitwarden",
	"dashlane",
	"enpass",
	"keepass",
	"lastpass",
	"nordpass",
	"roboform",
}

// SeedDefaultIgnoreList inserts the built-in block list exactly once (the
// first time this version of the app runs). Subsequent calls are no-ops, so
// users who deliberately remove a default entry won't have it silently
// re-added on the next launch.
func SeedDefaultIgnoreList() {
	result, err := DB.Exec(
		`UPDATE settings SET ignore_defaults_seeded = 1 WHERE id = 0 AND ignore_defaults_seeded = 0`,
	)
	if err != nil {
		return
	}
	n, _ := result.RowsAffected()
	if n == 0 {
		return
	}
	for _, name := range defaultIgnoredProcesses {
		_, _ = DB.Exec("INSERT OR IGNORE INTO ignore_list (process_name) VALUES (?)", name)
	}
}

func GetIgnoreList() ([]string, error) {
	rows, err := DB.Query("SELECT process_name FROM ignore_list ORDER BY process_name")
	if err != nil {
		return nil, fmt.Errorf("getIgnoreList: %w", err)
	}
	defer rows.Close()

	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		names = append(names, name)
	}
	return names, nil
}

func AddIgnoreEntry(name string) error {
	name = strings.TrimSpace(strings.ToLower(name))
	if name == "" {
		return fmt.Errorf("addIgnoreEntry: process name cannot be empty")
	}
	_, err := DB.Exec("INSERT OR IGNORE INTO ignore_list (process_name) VALUES (?)", name)
	return err
}

func RemoveIgnoreEntry(name string) error {
	_, err := DB.Exec("DELETE FROM ignore_list WHERE process_name = ?", strings.ToLower(name))
	return err
}
