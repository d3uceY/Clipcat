package store

import (
	"strings"
	"testing"
)

func TestTrimContent(t *testing.T) {
	// Short text is returned unchanged.
	short := "hello"
	if got := TrimContent(short); got != short {
		t.Fatalf("TrimContent(%q) = %q, want %q", short, got, short)
	}

	// Exactly at the limit is unchanged.
	exact := strings.Repeat("a", MaxPreviewChars)
	if got := TrimContent(exact); got != exact {
		t.Fatalf("TrimContent at limit changed the string")
	}

	// Over the limit truncates to MaxPreviewChars runes plus "...".
	long := strings.Repeat("a", MaxPreviewChars+10)
	got := TrimContent(long)
	if len([]rune(got)) != MaxPreviewChars+len("...") {
		t.Fatalf("TrimContent length = %d runes, want %d", len([]rune(got)), MaxPreviewChars+3)
	}
	if !strings.HasSuffix(got, "...") {
		t.Fatalf("TrimContent(%q) does not end with ellipsis: %q", long, got)
	}

	// Multi-byte runes are never split mid-character.
	emoji := strings.Repeat("😀", MaxPreviewChars+5)
	if got := TrimContent(emoji); len([]rune(got)) != MaxPreviewChars+3 {
		t.Fatalf("TrimContent emoji length = %d runes, want %d", len([]rune(got)), MaxPreviewChars+3)
	}
}

func TestBuildMatchExpression(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"", ""},
		{"   ", ""},
		{"foo", `"foo"*`},
		{"foo bar", `"foo"* "bar"*`},
		{`say "hi"`, `"say"* "hi"*`}, // embedded quotes are stripped
	}
	for _, c := range cases {
		if got := buildMatchExpression(c.in); got != c.want {
			t.Errorf("buildMatchExpression(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

// TestSearchClipsIntegration exercises the real FTS5 table + MATCH query
// against the same pure-Go sqlite driver the app uses, so a broken index or
// match expression fails the build, not a user session.
func TestSearchClipsIntegration(t *testing.T) {
	if err := InitDB(":memory:"); err != nil {
		t.Fatalf("InitDB: %v", err)
	}
	defer DB.Close()

	CreateTables()
	MigrateClipsTable()
	MigrateSettingsTable()
	MigrateStartupDefaultColumn()
	MigrateEncryptionColumns()
	MigrateIndexes()
	MigrateThumbnailColumn()
	MigrateLabelColumn()
	MigrateHiddenColumn()
	MigrateSyncSourceColumn()

	if err := initSearchIndex(); err != nil {
		t.Fatalf("initSearchIndex: %v", err)
	}

	insert := func(content string) {
		t.Helper()
		res, err := DB.Exec(`INSERT INTO clips (content, content_hash, type, pinned, encrypted, created_at) VALUES (?, ?, 'text', 0, 0, datetime('now'))`, content, hashContent([]byte(content)))
		if err != nil {
			t.Fatalf("insert: %v", err)
		}
		id, _ := res.LastInsertId()
		indexTextClip(int(id), content)
	}

	insert("the quick brown fox")
	insert("a lazy dog sleeps")

	// Re-run the startup backfill with rows present - exercises the real
	// rebuild path (collect-then-insert) against the single connection.
	if err := initSearchIndex(); err != nil {
		t.Fatalf("initSearchIndex rebuild: %v", err)
	}

	got, err := SearchClips("fox")
	if err != nil {
		t.Fatalf("SearchClips: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("SearchClips(fox) = %d results, want 1", len(got))
	}
	if *got[0].Content != "the quick brown fox" {
		t.Fatalf("SearchClips(fox) content = %q, want %q", *got[0].Content, "the quick brown fox")
	}

	// Prefix matching: "brow" hits "brown".
	got, err = SearchClips("brow")
	if err != nil || len(got) != 1 {
		t.Fatalf("SearchClips(brow) = %d results (err %v), want 1", len(got), err)
	}

	// Removing the clip from the index keeps search consistent.
	var id int
	if err := DB.QueryRow(`SELECT id FROM clips WHERE content = 'the quick brown fox'`).Scan(&id); err != nil {
		t.Fatalf("lookup id: %v", err)
	}
	removeClipFromIndex(id)
	if got, err := SearchClips("fox"); err != nil || len(got) != 0 {
		t.Fatalf("SearchClips(fox) after removal = %d results (err %v), want 0", len(got), err)
	}
}
