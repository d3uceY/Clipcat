package store

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
)

// Full-text search runs against an in-memory SQLite database that is never
// written to disk: clips keep only ciphertext, and the index is rebuilt from
// the decrypted rows on every launch. That keeps search instant without
// leaving a plaintext copy of every clip in gyatt.db (which is what the old
// on-disk clips_fts mirror table did).
//
// One pinned connection owns the in-memory database for the lifetime of the
// process; a shared-cache memory database disappears when its last connection
// closes. All access is serialised on indexMu so a query's rows are always
// drained before the next statement runs on that connection.

var (
	indexMu   sync.Mutex
	indexDB   *sql.DB
	indexConn *sql.Conn
	indexRuns int
)

var errIndexClosed = fmt.Errorf("search index is not open")

// OpenIndex (re)creates the in-memory index and rebuilds it from the stored
// clips. Any previously open index is closed first.
func OpenIndex() error {
	indexMu.Lock()
	defer indexMu.Unlock()
	closeIndexLocked()

	indexRuns++
	dsn := fmt.Sprintf("file:clipcat_index_%d?mode=memory&cache=shared", indexRuns)
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return err
	}
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	conn, err := db.Conn(context.Background())
	if err != nil {
		db.Close()
		return err
	}
	indexDB, indexConn = db, conn

	// The database never touches disk, so there is nothing to recover.
	for _, pragma := range []string{
		"PRAGMA journal_mode = OFF",
		"PRAGMA synchronous = OFF",
	} {
		if _, err := indexConn.ExecContext(context.Background(), pragma); err != nil {
			closeIndexLocked()
			return fmt.Errorf("%s: %w", pragma, err)
		}
	}
	if _, err := indexConn.ExecContext(context.Background(),
		`CREATE VIRTUAL TABLE clips_fts USING fts5(content, tokenize = 'unicode61')`); err != nil {
		closeIndexLocked()
		return fmt.Errorf("create index: %w", err)
	}

	if err := rebuildIndexLocked(); err != nil {
		closeIndexLocked()
		return err
	}
	return nil
}

// CloseIndex releases the in-memory database.
func CloseIndex() {
	indexMu.Lock()
	defer indexMu.Unlock()
	closeIndexLocked()
}

func closeIndexLocked() {
	if indexConn != nil {
		_ = indexConn.Close()
		indexConn = nil
	}
	if indexDB != nil {
		_ = indexDB.Close()
		indexDB = nil
	}
}

// RebuildIndex re-indexes every stored text clip. Bulk deletes use it instead
// of tracking each removed id.
func RebuildIndex() error {
	indexMu.Lock()
	defer indexMu.Unlock()
	return rebuildIndexLocked()
}

// rebuildIndexLocked reads every text clip, decrypts it, and repopulates the
// index. Rows that cannot be decrypted are skipped and logged: one unreadable
// clip must not take search down.
func rebuildIndexLocked() error {
	if indexConn == nil {
		return errIndexClosed
	}

	type storedClip struct {
		id         int64
		content    string
		encVersion int
	}
	rows, err := DB.Query(`SELECT id, content, enc_version FROM clips
		WHERE type = 'text' AND content IS NOT NULL AND content != ''`)
	if err != nil {
		return err
	}
	var clips []storedClip
	for rows.Next() {
		var c storedClip
		if err := rows.Scan(&c.id, &c.content, &c.encVersion); err != nil {
			continue
		}
		clips = append(clips, c)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	if _, err := indexConn.ExecContext(context.Background(), `DELETE FROM clips_fts`); err != nil {
		return err
	}

	stmt, err := indexConn.PrepareContext(context.Background(),
		`INSERT INTO clips_fts (rowid, content) VALUES (?, ?)`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, c := range clips {
		text, err := decodeClipText(c.content, c.encVersion)
		if err != nil {
			fmt.Printf("index: skipping clip %d: %v\n", c.id, err)
			continue
		}
		if _, err := stmt.ExecContext(context.Background(), c.id, text); err != nil {
			return err
		}
	}
	return nil
}

// indexTextClip keeps the index in sync after a text clip insert or update.
func indexTextClip(id int, content string) {
	if content == "" {
		return
	}
	indexMu.Lock()
	defer indexMu.Unlock()
	if indexConn == nil {
		return
	}
	_, _ = indexConn.ExecContext(context.Background(),
		`INSERT OR REPLACE INTO clips_fts (rowid, content) VALUES (?, ?)`, id, content)
}

// removeClipFromIndex drops a clip id from the index (e.g. on delete).
func removeClipFromIndex(id int) {
	indexMu.Lock()
	defer indexMu.Unlock()
	if indexConn == nil {
		return
	}
	_, _ = indexConn.ExecContext(context.Background(),
		`DELETE FROM clips_fts WHERE rowid = ?`, id)
}

// searchIndexIDs returns the clip ids matching an FTS5 MATCH expression.
func searchIndexIDs(expr string) ([]int64, error) {
	indexMu.Lock()
	defer indexMu.Unlock()
	if indexConn == nil {
		return nil, errIndexClosed
	}
	rows, err := indexConn.QueryContext(context.Background(),
		`SELECT rowid FROM clips_fts WHERE clips_fts MATCH ?`, expr)
	if err != nil {
		return nil, err
	}
	// Drain inside the lock: the single index connection cannot serve another
	// statement while these rows are open.
	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return nil, err
		}
		ids = append(ids, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	return ids, nil
}
