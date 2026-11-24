package store

import (
	"bytes"
	"fmt"
	"image"
	"image/png"
	"strings"
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
	initTestStore(t)

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

	if indexHasRow(t, pruned[0]) {
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
	initTestStore(t)

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
	if indexHasRow(t, clipRowID(t, first.ID)) {
		t.Error("the replaced row is still in the search index")
	}
}

// TestAddNetworkClip covers the LAN insert path: source is marked 'network',
// text is indexed for search like local text, and images get a thumbnail.
func TestAddNetworkClip(t *testing.T) {
	initTestStore(t)

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

// TestClipTextIsEncryptedAtRest covers the write and read paths: the stored
// column holds ciphertext while previews, full text, edits and search all work
// on cleartext.
func TestClipTextIsEncryptedAtRest(t *testing.T) {
	initTestStore(t)

	const text = "at-rest-canary-4b71"
	clip, _, _, err := AddManualClip(text, false)
	if err != nil {
		t.Fatalf("AddManualClip: %v", err)
	}
	id := clipRowID(t, clip.ID)

	var (
		stored     string
		encVersion int
	)
	readRow := func() {
		t.Helper()
		if err := DB.QueryRow(`SELECT content, enc_version FROM clips WHERE id = ?`, id).
			Scan(&stored, &encVersion); err != nil {
			t.Fatalf("read row: %v", err)
		}
	}

	readRow()
	if encVersion != 1 {
		t.Fatalf("enc_version = %d, want 1", encVersion)
	}
	if strings.Contains(stored, text) {
		t.Fatalf("stored content is plaintext: %q", stored)
	}

	if got, err := GetClipContent(id); err != nil || got != text {
		t.Fatalf("GetClipContent = %q, %v", got, err)
	}
	all, err := GetClips()
	if err != nil || len(all) != 1 {
		t.Fatalf("GetClips = %d clips, %v", len(all), err)
	}
	if all[0].Content == nil || *all[0].Content != text {
		t.Fatalf("list preview = %v", all[0].Content)
	}

	// Editing re-seals the new text and re-indexes it.
	const edited = "at-rest-edited-8c2d"
	if err := UpdateClipContent(id, edited); err != nil {
		t.Fatalf("UpdateClipContent: %v", err)
	}
	readRow()
	if strings.Contains(stored, edited) {
		t.Fatalf("edited content is stored in plaintext: %q", stored)
	}
	if got, err := GetClipContent(id); err != nil || got != edited {
		t.Fatalf("GetClipContent after edit = %q, %v", got, err)
	}
	if hits, err := SearchClips("edited"); err != nil || len(hits) != 1 {
		t.Fatalf("search for edited text = %d hits, %v", len(hits), err)
	}
	if hits, err := SearchClips("canary"); err != nil || len(hits) != 0 {
		t.Fatalf("search still matches the old text: %d hits, %v", len(hits), err)
	}
}

// TestImageClipsStayUnencrypted pins the boundary: only text is sealed, images
// keep their plain digest for duplicate detection.
func TestImageClipsStayUnencrypted(t *testing.T) {
	initTestStore(t)

	var buf bytes.Buffer
	if err := png.Encode(&buf, image.NewRGBA(image.Rect(0, 0, 4, 4))); err != nil {
		t.Fatalf("encode png: %v", err)
	}

	clip, _, _, _, err := AddImageClip(buf.Bytes())
	if err != nil {
		t.Fatalf("AddImageClip: %v", err)
	}

	var (
		img        []byte
		encVersion int
	)
	if err := DB.QueryRow(`SELECT image, enc_version FROM clips WHERE id = ?`, clipRowID(t, clip.ID)).
		Scan(&img, &encVersion); err != nil {
		t.Fatalf("read image row: %v", err)
	}
	if encVersion != 0 {
		t.Errorf("image clip enc_version = %d, want 0", encVersion)
	}
	if !bytes.Equal(img, buf.Bytes()) {
		t.Error("stored image bytes differ from the clipboard image")
	}

	// The list query must still deliver the thumbnail without loading the full
	// image (the image column comes back NULL when a thumbnail exists).
	listed, err := GetClips()
	if err != nil || len(listed) != 1 {
		t.Fatalf("GetClips = %d clips, %v", len(listed), err)
	}
	if listed[0].Image == nil || *listed[0].Image == "" {
		t.Error("list clip carries no thumbnail payload")
	}

	// Re-copying the same image replaces the row instead of duplicating it.
	if _, _, _, inserted, err := AddImageClip(buf.Bytes()); err != nil || !inserted {
		t.Fatalf("re-add image: inserted=%v err=%v", inserted, err)
	}
	var n int
	if err := DB.QueryRow(`SELECT COUNT(*) FROM clips WHERE type = 'image'`).Scan(&n); err != nil {
		t.Fatalf("count images: %v", err)
	}
	if n != 1 {
		t.Errorf("want 1 image clip after re-copy, got %d", n)
	}
}
