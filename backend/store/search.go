package store

import (
	"strings"
)

// Backend full-text search. Clips are stored as plaintext (at-rest encryption
// was removed), so clip text is indexed into the clips_fts FTS5 virtual table
// (rowid = clips.id) and every write path keeps it in sync.

// initSearchIndex creates the FTS5 table if needed and rebuilds it from the
// clips table. Rebuilding on startup keeps the index trivially consistent and
// costs nothing at clipboard-manager scale.
func initSearchIndex() error {
	_, err := DB.Exec(`
		CREATE VIRTUAL TABLE IF NOT EXISTS clips_fts USING fts5(
			content,
			tokenize = 'unicode61'
		)
	`)
	if err != nil {
		return err
	}
	if _, err := DB.Exec(`DELETE FROM clips_fts`); err != nil {
		return err
	}

	rows, err := DB.Query(`SELECT id, content FROM clips WHERE type = 'text' AND content IS NOT NULL AND content != ''`)
	if err != nil {
		return err
	}

	// Collect before writing: with a single DB connection, Exec inside the
	// rows loop would block on the cursor holding the connection.
	type indexed struct {
		id      int
		content string
	}
	var clips []indexed
	for rows.Next() {
		var c indexed
		if err := rows.Scan(&c.id, &c.content); err != nil {
			continue
		}
		clips = append(clips, c)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return err
	}

	for _, c := range clips {
		if _, err := DB.Exec(`INSERT INTO clips_fts (rowid, content) VALUES (?, ?)`, c.id, c.content); err != nil {
			continue
		}
	}
	return nil
}

// onClipIndexed fires after a text clip is inserted/updated in the FTS index
// so the semantic embed queue can pick it up. It is set by the app layer,
// which keeps the store package free of a dependency on the semantic package
// (store -> semantic would be a cycle).
var onClipIndexed func(id int, content string)

// SetOnClipIndexed registers the callback fired after a text clip is indexed.
func SetOnClipIndexed(cb func(id int, content string)) {
	onClipIndexed = cb
}

// indexTextClip keeps the FTS index in sync after a text clip insert/update.
func indexTextClip(id int, content string) {
	if content == "" {
		return
	}
	_, _ = DB.Exec(`INSERT OR REPLACE INTO clips_fts (rowid, content) VALUES (?, ?)`, id, content)
	// Vector index sync: hand the text to the embed queue (if wired up).
	if onClipIndexed != nil {
		onClipIndexed(id, content)
	}
}

// removeClipFromIndex drops a clip id from the FTS index (e.g. on delete)
// and removes its stored embeddings.
func removeClipFromIndex(id int) {
	_, _ = DB.Exec(`DELETE FROM clips_fts WHERE rowid = ?`, id)
	DeleteClipEmbeddings(id)
}

// pruneOrphanedIndexRows removes FTS rows whose clip id no longer exists in
// clips (after bulk deletes / pruning), and prunes orphaned embeddings.
func pruneOrphanedIndexRows() {
	_, _ = DB.Exec(`
		DELETE FROM clips_fts
		WHERE rowid NOT IN (SELECT id FROM clips)
	`)
	PruneOrphanedEmbeddings()
}

// buildMatchExpression turns a raw query into an FTS5 MATCH expression.
// Each whitespace-separated term is quoted and given a prefix wildcard with
// the '*' OUTSIDE the quotes ("term"*) - inside quotes ("term*") silently
// matches nothing in FTS5.
func buildMatchExpression(query string) string {
	terms := strings.Fields(query)
	quoted := make([]string, 0, len(terms))
	for _, t := range terms {
		t = strings.ReplaceAll(t, `"`, "")
		if t == "" {
			continue
		}
		quoted = append(quoted, `"`+t+`"*`)
	}
	return strings.Join(quoted, " ")
}

// SearchClips runs a full-text search over stored clip text and returns
// matching clips (with truncated previews), ordered like the main list:
// pinned first, then newest. Hidden clips are included - the frontend splits
// them into the hidden sections.
func SearchClips(query string) ([]Clip, error) {
	expr := buildMatchExpression(query)
	if expr == "" {
		return nil, nil
	}

	rows, err := DB.Query(`
		SELECT c.id
		FROM clips_fts f
		JOIN clips c ON c.id = f.rowid
		WHERE clips_fts MATCH ?
		ORDER BY c.pinned DESC, c.created_at DESC
	`, expr)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	clips := make([]Clip, 0, len(ids))
	for _, id := range ids {
		if clip, err := getClipByRowID(id); err == nil {
			clips = append(clips, *clip)
		}
	}
	return clips, nil
}
