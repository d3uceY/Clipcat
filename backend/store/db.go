package store

import (
	"database/sql"
	"fmt"

	_ "modernc.org/sqlite"
)

var DB *sql.DB

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

// MigrateEncryptOldClips re-encrypts every pre-existing unencrypted row so
// that all clip data at rest is protected after the first run of a new version.
func MigrateEncryptOldClips() {
	type legacyRow struct {
		id       int
		content  sql.NullString
		image    []byte
		clipType string
	}

	rows, err := DB.Query(`SELECT id, content, image, type FROM clips WHERE encrypted = 0`)
	if err != nil {
		return
	}

	var clips []legacyRow
	for rows.Next() {
		var r legacyRow
		if err := rows.Scan(&r.id, &r.content, &r.image, &r.clipType); err == nil {
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
			enc, err := encryptText(c.content.String)
			if err != nil {
				continue
			}
			hash := hashContent([]byte(c.content.String))
			_, _ = DB.Exec(
				`UPDATE clips SET content = ?, content_hash = ?, encrypted = 1 WHERE id = ?`,
				enc, hash, c.id,
			)
		case "image":
			if len(c.image) == 0 {
				continue
			}
			enc, err := encryptData(c.image)
			if err != nil {
				continue
			}
			hash := hashContent(c.image)
			_, _ = DB.Exec(
				`UPDATE clips SET image = ?, content_hash = ?, encrypted = 1 WHERE id = ?`,
				enc, hash, c.id,
			)
		}
	}
}
