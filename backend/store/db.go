package store

import (
	"database/sql"
	"errors"
	"fmt"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/services/notifications"
	_ "modernc.org/sqlite"
)

var DB *sql.DB

// AppInstance holds the Wails v3 application so store functions can emit events.
var AppInstance *application.App

// AppNotif holds the notification service so store functions can send notifications.
var AppNotif *notifications.NotificationService

// querier is implemented by both *sql.DB and *sql.Tx, so a helper can run
// inside a transaction or on its own without duplicating the SQL.
type querier interface {
	Exec(query string, args ...any) (sql.Result, error)
	Query(query string, args ...any) (*sql.Rows, error)
	QueryRow(query string, args ...any) *sql.Row
}

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

	// Zero pages as they are freed, so plaintext overwritten by the encryption
	// migration does not survive in the file's free space.
	if _, err := DB.Exec(`PRAGMA secure_delete = ON`); err != nil {
		return fmt.Errorf("secure_delete: %w", err)
	}

	fmt.Println("DB initialized on Bro")

	return DB.Ping()
}

// CloseDB releases the database handle. The search index is separate; call
// CloseIndex too. The handle is left in place (closed, not nil) so a goroutine
// that races shutdown gets "database is closed" instead of a nil panic.
func CloseDB() {
	if DB != nil {
		_ = DB.Close()
	}
}

func CreateTables() error {
	query := `
	CREATE TABLE IF NOT EXISTS clips (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		content TEXT,
		image BLOB,
		type TEXT NOT NULL,
		pinned BOOLEAN DEFAULT 0,
		created_at DATETIME,
		enc_version INTEGER NOT NULL DEFAULT 0
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

	CREATE TABLE IF NOT EXISTS storage_meta (
		id             INTEGER PRIMARY KEY CHECK (id = 0),
		key_id         TEXT NOT NULL DEFAULT '',
		key_backend    TEXT NOT NULL DEFAULT '',
		enc_version    INTEGER NOT NULL DEFAULT 1,
		legacy_cleaned INTEGER NOT NULL DEFAULT 0
	);
	`

	_, err := DB.Exec(query)
	return err
}

// RunMigrations brings the schema and storage key up to date, then opens the
// in-memory search index. Safe to call on every startup - every step is
// idempotent. dir is where a key file may be written when no OS keychain is
// available.
func RunMigrations(dir string) error {
	if err := CreateTables(); err != nil {
		return fmt.Errorf("create tables: %w", err)
	}

	_, _ = DB.Exec(`INSERT OR IGNORE INTO settings (id, ghost_mode) VALUES (0, 0)`)
	_, _ = DB.Exec(`INSERT OR IGNORE INTO storage_meta (id) VALUES (0)`)

	// Additive column migrations. SQLite has no "ADD COLUMN IF NOT EXISTS", so a
	// column that already exists just errors and is skipped - which is what makes
	// running this whole list on every startup safe.
	_, _ = DB.Exec(`ALTER TABLE clips ADD COLUMN image BLOB`)
	_, _ = DB.Exec(`ALTER TABLE clips ADD COLUMN content_hash TEXT`)
	_, _ = DB.Exec(`ALTER TABLE clips ADD COLUMN thumbnail BLOB`)
	_, _ = DB.Exec(`ALTER TABLE clips ADD COLUMN label TEXT NOT NULL DEFAULT ''`)
	_, _ = DB.Exec(`ALTER TABLE clips ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0`)
	_, _ = DB.Exec(`ALTER TABLE clips ADD COLUMN source TEXT NOT NULL DEFAULT 'local'`)
	_, _ = DB.Exec(`ALTER TABLE clips ADD COLUMN enc_version INTEGER NOT NULL DEFAULT 0`)
	_, _ = DB.Exec(`ALTER TABLE settings ADD COLUMN startup_default_set INTEGER DEFAULT 0`)
	_, _ = DB.Exec(`ALTER TABLE settings ADD COLUMN auto_hide_sensitive INTEGER NOT NULL DEFAULT 1`)
	_, _ = DB.Exec(`ALTER TABLE settings ADD COLUMN always_on_top INTEGER NOT NULL DEFAULT 0`)
	_, _ = DB.Exec(`ALTER TABLE settings ADD COLUMN mini_clip INTEGER NOT NULL DEFAULT 0`)
	_, _ = DB.Exec(`ALTER TABLE settings ADD COLUMN cursor_snap INTEGER NOT NULL DEFAULT 1`)
	_, _ = DB.Exec(`ALTER TABLE settings ADD COLUMN sync_enabled INTEGER NOT NULL DEFAULT 0`)
	_, _ = DB.Exec(`ALTER TABLE settings ADD COLUMN sync_passphrase TEXT NOT NULL DEFAULT ''`)
	_, _ = DB.Exec(`ALTER TABLE settings ADD COLUMN ignore_defaults_seeded INTEGER NOT NULL DEFAULT 0`)

	MigrateIndexes()

	// The key must exist before any clip is sealed or unsealed.
	if err := InitStorageKey(dir); err != nil {
		return err
	}
	if err := MigrateEncryptClips(); err != nil {
		return fmt.Errorf("encrypt clips: %w", err)
	}
	if err := dropLegacyPlaintext(); err != nil {
		return err
	}

	SeedDefaultIgnoreList()

	if err := OpenIndex(); err != nil {
		return fmt.Errorf("open search index: %w", err)
	}
	return nil
}

// MigrateIndexes creates performance indexes on the clips table.
// Uses IF NOT EXISTS so it is safe to call on every startup.
func MigrateIndexes() {
	indexes := []string{
		// Main listing query: ORDER BY pinned DESC, created_at DESC. Also
		// serves the delete-by-pin queries off its pinned prefix.
		`CREATE INDEX IF NOT EXISTS idx_clips_pinned_created
		 ON clips(pinned DESC, created_at DESC)`,

		// Duplicate detection: WHERE content_hash = ?
		`CREATE INDEX IF NOT EXISTS idx_clips_content_hash
		 ON clips(content_hash)`,
	}

	for _, idx := range indexes {
		if _, err := DB.Exec(idx); err != nil {
			fmt.Printf("index warning: %v\n", err)
		}
	}
}

// pendingClip is one plaintext row waiting to be sealed.
type pendingClip struct {
	id      int64
	content string
}

// MigrateEncryptClips seals every plaintext text clip that predates at-rest
// encryption and keys its content_hash. Rows are marked enc_version = 1 one at
// a time, so a crash mid-run leaves a mixed table that still reads correctly
// and the next start resumes where it stopped.
func MigrateEncryptClips() error {
	rows, err := DB.Query(`SELECT id, content FROM clips
		WHERE type = 'text' AND enc_version = 0 AND content IS NOT NULL AND content != ''`)
	if err != nil {
		return err
	}
	var pending []pendingClip
	for rows.Next() {
		var r pendingClip
		if err := rows.Scan(&r.id, &r.content); err == nil {
			pending = append(pending, r)
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}
	if len(pending) == 0 {
		return nil
	}

	const batchSize = 200
	for start := 0; start < len(pending); start += batchSize {
		end := min(start+batchSize, len(pending))
		if err := sealBatch(pending[start:end]); err != nil {
			return err
		}
	}
	fmt.Printf("storage: encrypted %d text clips\n", len(pending))
	return nil
}

// sealBatch seals one batch of clips in a single transaction.
func sealBatch(batch []pendingClip) error {
	tx, err := DB.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()

	stmt, err := tx.Prepare(
		`UPDATE clips SET content = ?, content_hash = ?, enc_version = 1
		 WHERE id = ? AND enc_version = 0`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, r := range batch {
		sealed, err := sealValue(r.content, aadClipContent)
		if err != nil {
			return err
		}
		if _, err := stmt.Exec(sealed, hmacContent(r.content), r.id); err != nil {
			fmt.Printf("storage: clip %d left unencrypted: %v\n", r.id, err)
		}
	}
	return tx.Commit()
}

// dropLegacyPlaintext removes everything that used to hold clip text outside
// the encrypted column: the on-disk FTS5 mirror tables, the old in-database
// key, and the dead `encrypted` flag. The file is VACUUMed once so the freed
// pages leave it, then the work is recorded in storage_meta.
func dropLegacyPlaintext() error {
	var cleaned int
	if err := DB.QueryRow(`SELECT legacy_cleaned FROM storage_meta WHERE id = 0`).Scan(&cleaned); err != nil && !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("read legacy_cleaned: %w", err)
	}
	if cleaned == 1 {
		return nil
	}

	var legacyRows int
	_ = DB.QueryRow(`SELECT COUNT(*) FROM clips WHERE encrypted = 1`).Scan(&legacyRows)
	if legacyRows > 0 {
		fmt.Printf("storage: %d clips predate encryption removal and cannot be read; they are discarded\n", legacyRows)
	}

	// The virtual table must go before its shadow tables; DROP TABLE removes
	// those itself, so the rest of the list is just a sweep.
	rows, err := DB.Query(`SELECT name FROM sqlite_master
		WHERE type = 'table' AND (name = 'clips_fts' OR name LIKE 'clips_fts_%' OR name = 'encryption_meta')
		ORDER BY name`)
	if err != nil {
		return err
	}
	var legacyTables []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err == nil {
			legacyTables = append(legacyTables, name)
		}
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	for _, name := range legacyTables {
		if _, err := DB.Exec(`DROP TABLE IF EXISTS "` + name + `"`); err != nil {
			return fmt.Errorf("drop %s: %w", name, err)
		}
	}

	if columnExists("clips", "encrypted") {
		// Older builds kept an index on the flag; SQLite refuses to drop a
		// column an index still references.
		dropIndexesOn("clips", "encrypted")
		if _, err := DB.Exec(`ALTER TABLE clips DROP COLUMN encrypted`); err != nil {
			// The flag is vestigial: failing to remove it must not stop startup.
			fmt.Printf("storage: could not drop encrypted column: %v\n", err)
		}
	}

	// VACUUM rewrites the file, so it runs once rather than on every launch.
	if _, err := DB.Exec(`VACUUM`); err != nil {
		return fmt.Errorf("vacuum: %w", err)
	}

	if _, err := DB.Exec(`UPDATE storage_meta SET legacy_cleaned = 1 WHERE id = 0`); err != nil {
		return err
	}
	if len(legacyTables) > 0 {
		fmt.Printf("storage: dropped legacy plaintext tables %v\n", legacyTables)
	}
	return nil
}

// dropIndexesOn removes every explicit index on table whose SQL mentions
// column. Auto-indexes (sql IS NULL) cannot be dropped and never cover a plain
// flag column.
func dropIndexesOn(table, column string) {
	rows, err := DB.Query(
		`SELECT name FROM sqlite_master
		 WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL AND sql LIKE ?`,
		table, "%"+column+"%",
	)
	if err != nil {
		return
	}
	var names []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err == nil {
			names = append(names, name)
		}
	}
	rows.Close()
	for _, name := range names {
		if _, err := DB.Exec(`DROP INDEX IF EXISTS "` + name + `"`); err != nil {
			fmt.Printf("storage: drop index %s: %v\n", name, err)
		}
	}
}

// columnExists reports whether table has a column called column.
func columnExists(table, column string) bool {
	rows, err := DB.Query(`PRAGMA table_info("` + table + `")`)
	if err != nil {
		return false
	}
	defer rows.Close()
	for rows.Next() {
		var (
			cid      int
			name     string
			ctype    string
			notNull  int
			defaultV sql.NullString
			primaryK int
		)
		if err := rows.Scan(&cid, &name, &ctype, &notNull, &defaultV, &primaryK); err != nil {
			return false
		}
		if name == column {
			return true
		}
	}
	return false
}
