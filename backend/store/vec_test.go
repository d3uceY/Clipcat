package store

import (
	"database/sql"
	"testing"
)

// setupVecDB points the package DB at a fresh in-memory database with the
// clips + clips_vec tables, restoring the previous DB on test cleanup. The
// vec0 module is available because the vec package's init() registered it
// via sqlite3_auto_extension when the test binary started.
func setupVecDB(t *testing.T) {
	t.Helper()
	old := DB
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open in-memory db: %v", err)
	}
	DB = db
	t.Cleanup(func() {
		_ = db.Close()
		DB = old
	})

	// Mirrors the production clips schema: getClipByRowID (used by
	// SemanticSearch) selects thumbnail, label, hidden and source, so the
	// test table must carry them or every clip is silently skipped.
	if _, err := DB.Exec(`CREATE TABLE clips (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		content TEXT,
		image BLOB,
		type TEXT NOT NULL,
		pinned BOOLEAN DEFAULT 0,
		created_at DATETIME,
		content_hash TEXT,
		encrypted INTEGER DEFAULT 0,
		thumbnail BLOB,
		label TEXT NOT NULL DEFAULT '',
		hidden INTEGER NOT NULL DEFAULT 0,
		source TEXT NOT NULL DEFAULT 'local'
	)`); err != nil {
		t.Fatalf("create clips: %v", err)
	}
	if _, err := DB.Exec(`CREATE VIRTUAL TABLE clips_vec USING vec0(
		embedding float[384] distance_metric=cosine,
		clip_id integer
	)`); err != nil {
		t.Fatalf("create clips_vec: %v", err)
	}
}

func TestSerializeFloat32(t *testing.T) {
	in := []float32{1.5, -2.25, 0}
	got := serializeFloat32(in)
	if len(got) != 12 {
		t.Fatalf("len = %d, want 12", len(got))
	}
	// 1.5   = 0x3FC00000 little-endian
	want := []byte{0x00, 0x00, 0xC0, 0x3F}
	if string(got[:4]) != string(want) {
		t.Fatalf("1.5 bytes = % x, want % x", got[:4], want)
	}
	// -2.25 = 0xC0100000 little-endian
	want = []byte{0x00, 0x00, 0x10, 0xC0}
	if string(got[4:8]) != string(want) {
		t.Fatalf("-2.25 bytes = % x, want % x", got[4:8], want)
	}
	// 0.0 = 0x00000000
	for _, b := range got[8:12] {
		if b != 0 {
			t.Fatalf("0.0 bytes = % x, want zeros", got[8:12])
		}
	}
}

// vecOf builds a 384-dim vector with a marker at index 0 and 1.0 at index 1,
// so different markers land in clearly separated directions under cosine.
// vec0 enforces the declared column dimension, so the full 384 dims are set.
func vecOf(marker float32) []float32 {
	v := make([]float32, 384)
	v[0] = marker
	v[1] = 1
	return v
}

func TestSemanticSearchRanksAndThresholds(t *testing.T) {
	setupVecDB(t)

	if _, err := DB.Exec(`INSERT INTO clips (content, type, created_at) VALUES ('css grid', 'text', datetime('now'))`); err != nil {
		t.Fatal(err)
	}
	if _, err := DB.Exec(`INSERT INTO clips (content, type, created_at) VALUES ('go backend', 'text', datetime('now'))`); err != nil {
		t.Fatal(err)
	}
	if err := StoreClipEmbeddings(1, [][]float32{vecOf(1.0)}); err != nil {
		t.Fatalf("store clip 1: %v", err)
	}
	if err := StoreClipEmbeddings(2, [][]float32{vecOf(-1.0)}); err != nil {
		t.Fatalf("store clip 2: %v", err)
	}

	// Query near clip 1. Clip 2 is too far (distance ~0.95 > 0.8) to match.
	res, err := SemanticSearch(vecOf(0.9), 10, 0.8)
	if err != nil {
		t.Fatalf("semantic search: %v", err)
	}
	if len(res) != 1 || res[0].ID != "clip_001" {
		t.Fatalf("expected only clip_001, got %+v", res)
	}

	// A threshold tighter than every match yields nothing.
	res, err = SemanticSearch(vecOf(0.9), 10, 0.0001)
	if err != nil {
		t.Fatalf("semantic search strict: %v", err)
	}
	if len(res) != 0 {
		t.Fatalf("expected no matches past threshold, got %+v", res)
	}

	// Deleting clip 1's embeddings makes it disappear.
	DeleteClipEmbeddings(1)
	res, err = SemanticSearch(vecOf(0.9), 10, 0.99)
	if err != nil {
		t.Fatalf("semantic search after delete: %v", err)
	}
	if len(res) != 1 || res[0].ID != "clip_002" {
		t.Fatalf("expected only clip_002 after delete, got %+v", res)
	}
}

func TestSemanticSearchDedupesChunks(t *testing.T) {
	setupVecDB(t)

	if _, err := DB.Exec(`INSERT INTO clips (content, type, created_at) VALUES ('multi chunk', 'text', datetime('now'))`); err != nil {
		t.Fatal(err)
	}
	if _, err := DB.Exec(`INSERT INTO clips (content, type, created_at) VALUES ('far away', 'text', datetime('now'))`); err != nil {
		t.Fatal(err)
	}
	// Clip 1 owns two chunks, both near the query.
	if err := StoreClipEmbeddings(1, [][]float32{vecOf(0.99), vecOf(1.0)}); err != nil {
		t.Fatal(err)
	}
	if err := StoreClipEmbeddings(2, [][]float32{vecOf(-1.0)}); err != nil {
		t.Fatal(err)
	}

	res, err := SemanticSearch(vecOf(0.9), 10, 0.99)
	if err != nil {
		t.Fatalf("semantic search: %v", err)
	}
	if len(res) != 2 {
		t.Fatalf("expected 2 deduped clips, got %d (%+v)", len(res), res)
	}
	if res[0].ID != "clip_001" || res[1].ID != "clip_002" {
		t.Fatalf("expected clip_001 then clip_002, got %+v", res)
	}
}

func TestPruneOrphanedEmbeddings(t *testing.T) {
	setupVecDB(t)

	if _, err := DB.Exec(`INSERT INTO clips (content, type, created_at) VALUES ('x', 'text', datetime('now'))`); err != nil {
		t.Fatal(err)
	}
	if err := StoreClipEmbeddings(1, [][]float32{vecOf(0.5)}); err != nil {
		t.Fatal(err)
	}
	// An orphan: a vector row whose clip id no longer exists.
	if _, err := DB.Exec(`INSERT INTO clips_vec (embedding, clip_id) VALUES (?, 999)`, serializeFloat32(vecOf(0.5))); err != nil {
		t.Fatalf("insert orphan: %v", err)
	}

	PruneOrphanedEmbeddings()

	var n int
	if err := DB.QueryRow(`SELECT COUNT(*) FROM clips_vec`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 1 {
		t.Fatalf("expected 1 row after prune (orphan removed), got %d", n)
	}
}
