package store

import (
	"bytes"
	"fmt"
	"image"
	"image/png"
	"testing"
)

// clipRowID parses a frontend clip id ("clip_007") back into its row id.
func clipRowID(t *testing.T, id string) int {
	t.Helper()
	var n int
	if _, err := fmt.Sscanf(id, "clip_%d", &n); err != nil {
		t.Fatalf("unexpected clip id %q: %v", id, err)
	}
	return n
}

// TestPruneExcessClips covers the DELETE ... RETURNING prune path: the ids it
// reports must be the rows it really deleted, their index rows must go with
// them, and the oldest pinned clip must survive.
func TestPruneExcessClips(t *testing.T) {
	if err := InitDB(":memory:"); err != nil {
		t.Fatalf("InitDB: %v", err)
	}
	defer DB.Close()
	RunMigrations()

	if err := UpdateStorageLimit(2); err != nil {
		t.Fatalf("UpdateStorageLimit: %v", err)
	}

	// The pinned clip is added first, so it is the oldest row overall - the
	// unpinned ones must be pruned before it.
	if _, _, _, err := AddManualClip("keep me", true); err != nil {
		t.Fatalf("add pinned: %v", err)
	}
	if _, _, _, err := AddManualClip("first unpinned", false); err != nil {
		t.Fatalf("add first: %v", err)
	}
	_, pruned, _, err := AddManualClip("second unpinned", false)
	if err != nil {
		t.Fatalf("add second: %v", err)
	}

	if len(pruned) != 1 {
		t.Fatalf("want exactly 1 pruned id, got %v", pruned)
	}

	var n int
	if err := DB.QueryRow(`SELECT COUNT(*) FROM clips WHERE id = ?`, pruned[0]).Scan(&n); err != nil {
		t.Fatalf("count clipped row: %v", err)
	}
	if n != 0 {
		t.Errorf("reported pruned id %d is still in clips", pruned[0])
	}

	if err := DB.QueryRow(`SELECT COUNT(*) FROM clips_fts WHERE rowid = ?`, pruned[0]).Scan(&n); err != nil {
		t.Fatalf("count index row: %v", err)
	}
	if n != 0 {
		t.Errorf("pruned id %d still in the search index", pruned[0])
	}

	if err := DB.QueryRow(`SELECT COUNT(*) FROM clips`).Scan(&n); err != nil {
		t.Fatalf("count clips: %v", err)
	}
	if n != 2 {
		t.Errorf("want 2 clips after pruning, got %d", n)
	}

	if err := DB.QueryRow(`SELECT COUNT(*) FROM clips WHERE pinned = 1`).Scan(&n); err != nil {
		t.Fatalf("count pinned: %v", err)
	}
	if n != 1 {
		t.Errorf("pinned clip was pruned")
	}
}

// TestAddClipRestoresDuplicateState covers re-copying text that is already
// stored: the old row is replaced, its pinned/label state comes back on the new
// row, and exactly one row (and one index row) is left behind.
func TestAddClipRestoresDuplicateState(t *testing.T) {
	if err := InitDB(":memory:"); err != nil {
		t.Fatalf("InitDB: %v", err)
	}
	defer DB.Close()
	RunMigrations()

	first, _, _, err := AddManualClip("duplicate me", true)
	if err != nil {
		t.Fatalf("AddManualClip: %v", err)
	}
	if err := RenameClip(clipRowID(t, first.ID), "my label"); err != nil {
		t.Fatalf("RenameClip: %v", err)
	}

	second, prunedIDs, deletedID, inserted, err := AddClip("duplicate me", "text")
	if err != nil {
		t.Fatalf("AddClip: %v", err)
	}
	if !inserted {
		t.Fatal("re-copying existing text should still insert")
	}
	if len(prunedIDs) != 0 {
		t.Errorf("unexpected pruned ids: %v", prunedIDs)
	}
	if want := clipRowID(t, first.ID); deletedID != want {
		t.Errorf("deletedID = %d, want the original row %d", deletedID, want)
	}
	if second == nil {
		t.Fatal("AddClip returned no clip")
	}
	if !second.Pinned {
		t.Error("pinned state was not carried over to the replacement row")
	}
	if second.Label != "my label" {
		t.Errorf("label = %q, want %q", second.Label, "my label")
	}

	var n int
	if err := DB.QueryRow(`SELECT COUNT(*) FROM clips`).Scan(&n); err != nil {
		t.Fatalf("count clips: %v", err)
	}
	if n != 1 {
		t.Errorf("want 1 stored clip after re-copy, got %d", n)
	}
	if err := DB.QueryRow(`SELECT COUNT(*) FROM clips_fts WHERE rowid = ?`, clipRowID(t, first.ID)).Scan(&n); err != nil {
		t.Fatalf("count index rows: %v", err)
	}
	if n != 0 {
		t.Error("the replaced row is still in the search index")
	}
}

// TestAddNetworkClip covers the LAN insert path: source is marked 'network',
// text is indexed for search like local text, and images get a thumbnail.
func TestAddNetworkClip(t *testing.T) {
	if err := InitDB(":memory:"); err != nil {
		t.Fatalf("InitDB: %v", err)
	}
	defer DB.Close()
	RunMigrations()

	textClip, err := AddNetworkClip("synced text", "text", nil)
	if err != nil {
		t.Fatalf("AddNetworkClip text: %v", err)
	}
	if textClip.Source != "network" || textClip.Type != "text" {
		t.Errorf("text clip: source=%q type=%q", textClip.Source, textClip.Type)
	}
	if textClip.Content == nil || *textClip.Content != "synced text" {
		t.Errorf("text clip content = %v", textClip.Content)
	}

	got, err := SearchClips("synced")
	if err != nil {
		t.Fatalf("SearchClips: %v", err)
	}
	if len(got) != 1 {
		t.Errorf("want 1 search hit for a network text clip, got %d", len(got))
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, image.NewRGBA(image.Rect(0, 0, 4, 4))); err != nil {
		t.Fatalf("encode png: %v", err)
	}
	imgClip, err := AddNetworkClip("", "image", buf.Bytes())
	if err != nil {
		t.Fatalf("AddNetworkClip image: %v", err)
	}
	if imgClip.Source != "network" || imgClip.Type != "image" {
		t.Errorf("image clip: source=%q type=%q", imgClip.Source, imgClip.Type)
	}
	if imgClip.Image == nil || *imgClip.Image == "" {
		t.Error("image clip carries no thumbnail payload")
	}

	if _, err := AddNetworkClip("x", "banana", nil); err == nil {
		t.Error("an unknown clip type should error")
	}

	// The list path shares scanClip with getClipByRowID - both must see the rows.
	all, err := GetClips()
	if err != nil {
		t.Fatalf("GetClips: %v", err)
	}
	if len(all) != 2 {
		t.Errorf("GetClips returned %d clips, want 2", len(all))
	}
}
