package store

import (
	"database/sql"
	"fmt"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/services/notifications"
	_ "modernc.org/sqlite"
	_ "modernc.org/sqlite/vec" // just registered the vec0 module on some calm shit
)

var DB *sql.DB

// AppInstance holds the Wails v3 application so store functions can emit events.
var AppInstance *application.App

// AppNotif holds the notification service so store functions can send notifications.
var AppNotif *notifications.NotificationService

// SetAppInstance stores the Wails v3 app reference for use by store functions.
func SetAppInstance(app *application.App) {
	AppInstance = app
}

// SetNotifService stores the notification service for use by store functions.
func SetNotifService(ns *notifications.NotificationService) {
	AppNotif = ns
}

func InitDB(path string) error {
	var err error
	DB, err = sql.Open("sqlite", path)
	if err != nil {
		return err
	}

	// SQLite is single-writer; a single connection avoids contention
	// and keeps the memory footprint minimal.
	DB.SetMaxOpenConns(1)
	DB.SetMaxIdleConns(1)

	fmt.Println("DB initialized on Bro")

	return DB.Ping()
}

func CreateTables() {
	query := `
	CREATE TABLE IF NOT EXISTS clips (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		content TEXT,
		image BLOB,
		type TEXT NOT NULL,
		pinned BOOLEAN DEFAULT 0,
		created_at DATETIME
	);

	CREATE TABLE IF NOT EXISTS clip_storage_limit (
		id INTEGER PRIMARY KEY CHECK (id = 0),
		limit_count INTEGER DEFAULT 100
	);

	CREATE TABLE IF NOT EXISTS ignore_list (
		process_name TEXT PRIMARY KEY
	);

	CREATE TABLE IF NOT EXISTS settings (
		id INTEGER PRIMARY KEY CHECK (id = 0),
		ghost_mode INTEGER DEFAULT 0
	);
	`

	_, err := DB.Exec(query)
	if err != nil {
		fmt.Printf("SQL Error: %v\nQuery: %s\n", err, query)
		panic(err)
	}
}

// RunMigrations runs all schema migrations and data migrations in order.
// Safe to call on every startup - each migration is idempotent.
func RunMigrations() {
	CreateTables()
	MigrateClipsTable()
	MigrateSettingsTable()
	MigrateStartupDefaultColumn()
	MigrateEncryptionColumns()
	MigrateIndexes()
	MigrateThumbnailColumn()
	// The legacy key is still needed to decrypt rows an older version stored
	// with encryption enabled.
	if err := InitEncryption(); err != nil {
		panic(err)
	}
	MigrateDecryptClips()
	MigrateLabelColumn()
	MigrateHiddenColumn()
	MigrateAutoHideSetting()
	MigrateAlwaysOnTopSetting()
	MigrateMiniClipSetting()
	MigrateCursorSnapSetting()
	MigrateVecTable()
	MigrateSemanticSearchSetting()
	MigrateSyncSourceColumn()
	MigrateSyncSettings()
	MigrateIgnoreDefaultsColumn()
	SeedDefaultIgnoreList()
	if err := initSearchIndex(); err != nil {
		fmt.Printf("search index init warning: %v\n", err)
	}
}

// MigrateIgnoreDefaultsColumn adds the flag that prevents the built-in
// block list from being re-seeded after the user removes an entry.
func MigrateIgnoreDefaultsColumn() {
	_, _ = DB.Exec(`ALTER TABLE settings ADD COLUMN ignore_defaults_seeded INTEGER NOT NULL DEFAULT 0`)
}

// MigrateIndexes creates performance indexes on the clips table.
// Uses IF NOT EXISTS so it is safe to call on every startup.
func MigrateIndexes() {
	indexes := []string{
		// Main listing query: ORDER BY pinned DESC, created_at DESC
		`CREATE INDEX IF NOT EXISTS idx_clips_pinned_created
		 ON clips(pinned DESC, created_at DESC)`,

		// Duplicate detection: WHERE content_hash = ?
		`CREATE INDEX IF NOT EXISTS idx_clips_content_hash
		 ON clips(content_hash)`,

		// Delete-by-type queries (DeletePinnedClips, DeleteUnpinnedClips)
		`CREATE INDEX IF NOT EXISTS idx_clips_pinned
		 ON clips(pinned)`,

		// Encrypted column is used in migration queries
		`CREATE INDEX IF NOT EXISTS idx_clips_encrypted
		 ON clips(encrypted)`,
	}

	for _, idx := range indexes {
		if _, err := DB.Exec(idx); err != nil {
			fmt.Printf("index warning: %v\n", err)
		}
	}
}

func MigrateClipsTable() {
	_, _ = DB.Exec(`ALTER TABLE clips ADD COLUMN image BLOB`)
}

func MigrateSettingsTable() {
	_, _ = DB.Exec(`INSERT OR IGNORE INTO settings (id, ghost_mode) VALUES (0, 0)`)
}

// MigrateStartupDefaultColumn adds the startup_default_set flag used to
// enable launch-on-startup exactly once on first run.
func MigrateStartupDefaultColumn() {
	_, _ = DB.Exec(`ALTER TABLE settings ADD COLUMN startup_default_set INTEGER DEFAULT 0`)
}

func MigrateEncryptionColumns() {
	_, _ = DB.Exec(`ALTER TABLE clips ADD COLUMN encrypted INTEGER DEFAULT 0`)
	_, _ = DB.Exec(`ALTER TABLE clips ADD COLUMN content_hash TEXT`)
	_, _ = DB.Exec(`
		CREATE TABLE IF NOT EXISTS encryption_meta (
			id          INTEGER PRIMARY KEY CHECK (id = 0),
			machine_key TEXT NOT NULL
		)
	`)
}

// MigrateThumbnailColumn adds a thumbnail BLOB column for image clips
// so GetClips never needs to transmit full-resolution images.
func MigrateThumbnailColumn() {
	_, _ = DB.Exec(`ALTER TABLE clips ADD COLUMN thumbnail BLOB`)
}

// MigrateDecryptClips converts every row an older version stored with
// encrypted = 1 back to plaintext, so at-rest encryption is fully removed
// after the first run of this version. Safe to call on every startup - it
// only touches rows still marked encrypted.
func MigrateDecryptClips() {
	type legacyRow struct {
		id        int
		content   sql.NullString
		image     []byte
		thumbnail []byte
		clipType  string
	}

	rows, err := DB.Query(`SELECT id, content, image, thumbnail, type FROM clips WHERE encrypted = 1`)
	if err != nil {
		return
	}

	var clips []legacyRow
	for rows.Next() {
		var r legacyRow
		if err := rows.Scan(&r.id, &r.content, &r.image, &r.thumbnail, &r.clipType); err == nil {
			clips = append(clips, r)
		}
	}
	rows.Close()

	for _, c := range clips {
		switch c.clipType {
		case "text":
			if !c.content.Valid || c.content.String == "" {
				continue
			}
			plaintext, err := decryptText(c.content.String)
			if err != nil {
				continue
			}
			hash := hashContent([]byte(plaintext))
			_, _ = DB.Exec(
				`UPDATE clips SET content = ?, content_hash = ?, encrypted = 0 WHERE id = ?`,
				plaintext, hash, c.id,
			)
		case "image":
			if len(c.image) == 0 {
				continue
			}
			plain, err := decryptData(c.image)
			if err != nil {
				continue
			}
			thumb := c.thumbnail
			if len(thumb) > 0 {
				if dec, derr := decryptData(thumb); derr == nil {
					thumb = dec
				}
			}
			hash := hashContent(plain)
			_, _ = DB.Exec(
				`UPDATE clips SET image = ?, thumbnail = ?, content_hash = ?, encrypted = 0 WHERE id = ?`,
				plain, thumb, hash, c.id,
			)
		}
	}
}

// MigrateLabelColumn adds a label column for optional clip nicknames.
func MigrateLabelColumn() {
	_, _ = DB.Exec(`ALTER TABLE clips ADD COLUMN label TEXT NOT NULL DEFAULT ''`)
}

// MigrateHiddenColumn adds the hidden flag used by the sensitive-content
// auto-hide feature.  Defaults to 0 (visible) for all existing clips.
func MigrateHiddenColumn() {
	_, _ = DB.Exec(`ALTER TABLE clips ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0`)
}

// MigrateAutoHideSetting adds the auto_hide_sensitive column to settings.
// The feature is enabled by default (value 1) on first migration.
func MigrateAutoHideSetting() {
	_, _ = DB.Exec(`ALTER TABLE settings ADD COLUMN auto_hide_sensitive INTEGER NOT NULL DEFAULT 1`)
}

// MigrateAlwaysOnTopSetting adds the always_on_top column to settings.
// Defaults to 0 (off).
func MigrateAlwaysOnTopSetting() {
	_, _ = DB.Exec(`ALTER TABLE settings ADD COLUMN always_on_top INTEGER NOT NULL DEFAULT 0`)
}

// MigrateMiniClipSetting adds the mini_clip column to settings.
// Defaults to 0 (off).
func MigrateMiniClipSetting() {
	_, _ = DB.Exec(`ALTER TABLE settings ADD COLUMN mini_clip INTEGER NOT NULL DEFAULT 0`)
}

// MigrateCursorSnapSetting adds the cursor_snap column to settings.
// Smart Position is enabled by default (value 1).
func MigrateCursorSnapSetting() {
	_, _ = DB.Exec(`ALTER TABLE settings ADD COLUMN cursor_snap INTEGER NOT NULL DEFAULT 1`)
}

// MigrateVecTable creates the sqlite-vec virtual table that stores clip
// embeddings for semantic (meaning-based) search. One clip can own many rows
// (one per text chunk); clip_id links back to the clips table. The vec0
// module is registered process-wide by importing modernc.org/sqlite/vec.
func MigrateVecTable() {
	_, err := DB.Exec(`
		CREATE VIRTUAL TABLE IF NOT EXISTS clips_vec USING vec0(
			embedding float[384] distance_metric=cosine,
			clip_id integer
		)
	`)
	if err != nil {
		fmt.Printf("vec table warning: %v\n", err)
	}
}

// MigrateSemanticSearchSetting adds the semantic_search_enabled column to
// settings. The feature is enabled by default (value 1) on first migration.
func MigrateSemanticSearchSetting() {
	_, _ = DB.Exec(`ALTER TABLE settings ADD COLUMN semantic_search_enabled INTEGER NOT NULL DEFAULT 1`)
}

// MigrateSyncSourceColumn adds the source column to the clips table so we can
// distinguish locally-captured clips from network-synced ones.
func MigrateSyncSourceColumn() {
	_, _ = DB.Exec(`ALTER TABLE clips ADD COLUMN source TEXT NOT NULL DEFAULT 'local'`)
}

// MigrateSyncSettings adds the sync_enabled and sync_passphrase columns to the
// settings table.  Both default to disabled/empty.
func MigrateSyncSettings() {
	_, _ = DB.Exec(`ALTER TABLE settings ADD COLUMN sync_enabled INTEGER NOT NULL DEFAULT 0`)
	_, _ = DB.Exec(`ALTER TABLE settings ADD COLUMN sync_passphrase TEXT NOT NULL DEFAULT ''`)
}
