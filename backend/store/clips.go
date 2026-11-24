package store

import (
	"bytes"
	"database/sql"
	"encoding/base64"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"sync/atomic"

	"Clipcat/backend/lib/secretscan"

	"github.com/wailsapp/wails/v3/pkg/services/notifications"
	"golang.org/x/image/draw"

	_ "golang.org/x/image/webp"
)

type Clip struct {
	ID        string  `json:"id"`
	Type      string  `json:"type"`
	Content   *string `json:"content,omitempty"` // truncated preview for text; full text via GetClipContent
	Image     *string `json:"image,omitempty"`   // base64 - thumbnail for list, full-res on demand
	Pinned    bool    `json:"isPinned"`
	CreatedAt string  `json:"createdAt"`
	Label     string  `json:"label"`
	Hidden    bool    `json:"isHidden"`
	Source    string  `json:"source,omitempty"` // "local" (default) or "network"
}

// MaxPreviewChars caps how much of a text clip's content is sent to the
// frontend in list/search payloads. The full text is fetched on demand
// through GetClipContent (copy, edit, view).
const MaxPreviewChars = 200

// TrimContent truncates text to MaxPreviewChars runes (multi-byte safe) and
// appends "..." when it had to cut.
func TrimContent(s string) string {
	r := []rune(s)
	if len(r) <= MaxPreviewChars {
		return s
	}
	return string(r[:MaxPreviewChars]) + "..."
}

// buildClip assembles a Clip from a clips row's scanned columns: trims text
// previews and normalizes/encodes image thumbnails. Shared by GetClips and
// getClipByRowID so both paths build clips identically.
func buildClip(rowID int, content sql.NullString, image, thumbnail []byte, clipType string, pinned bool, createdAt, label string, hidden bool, source string, encVersion int) Clip {
	clip := Clip{
		ID:        fmt.Sprintf("clip_%03d", rowID),
		Type:      clipType,
		Pinned:    pinned,
		CreatedAt: createdAt,
		Label:     label,
		Hidden:    hidden,
		Source:    source,
	}

	if clipType == "text" && content.Valid && content.String != "" {
		text, err := decodeClipText(content.String, encVersion)
		if err != nil {
			// One unreadable clip must not break the whole list, and a wrong
			// key must not print one line per clip per refresh.
			logDecodeFailure(rowID, err)
		} else {
			preview := TrimContent(text)
			clip.Content = &preview
		}
	}

	if clipType == "image" {
		// Fall back to the full image for clips inserted before the
		// thumbnail column was added.
		thumbBytes := thumbnail
		if len(thumbBytes) == 0 {
			thumbBytes = image
		}
		if len(thumbBytes) > 0 {
			if normalized, err := normalizeImageToPNG(thumbBytes); err == nil {
				thumbBytes = normalized
			}
			encoded := base64.StdEncoding.EncodeToString(thumbBytes)
			clip.Image = &encoded
		}
	}

	return clip
}

// decodeFailureLogs caps how many decrypt errors reach stdout.
var decodeFailureLogs atomic.Int64

func logDecodeFailure(rowID int, err error) {
	if decodeFailureLogs.Add(1) <= 3 {
		fmt.Printf("clip %d: cannot decrypt content: %v\n", rowID, err)
	}
}

// clipColumns is the column list every Clip scan expects, in scanClip order.
//
// The image column is only materialized when a row has no thumbnail. Without
// that CASE, every list load pulls each full-size screenshot into Go memory
// (tens of MB on a normal history) only to throw it away and send the
// thumbnail to the frontend.
const clipColumns = `id, content,
	CASE WHEN thumbnail IS NOT NULL AND length(thumbnail) > 0 THEN NULL ELSE image END AS image,
	thumbnail, type, pinned, created_at, label, hidden, source, enc_version`

// scanClip builds a Clip from one clips row (either a *sql.Rows or a *sql.Row).
// Shared by GetClips and getClipByRowID so both paths assemble clips identically.
func scanClip(row interface{ Scan(...any) error }) (Clip, error) {
	var (
		id         int
		content    sql.NullString
		image      []byte
		thumbnail  []byte
		clipType   string
		pinned     bool
		createdAt  string
		label      string
		hidden     bool
		source     string
		encVersion int
	)
	if err := row.Scan(&id, &content, &image, &thumbnail, &clipType, &pinned, &createdAt, &label, &hidden, &source, &encVersion); err != nil {
		return Clip{}, err
	}
	return buildClip(id, content, image, thumbnail, clipType, pinned, createdAt, label, hidden, source, encVersion), nil
}

// insertTextClip seals and inserts a text clip and returns it with its row id.
// source is "local" or "network"; hidden and label are the already-decided
// values - secret scanning and duplicate state restoration happen in the
// caller. The search index is updated by the caller after it commits.
func insertTextClip(q querier, content, clipType, source string, pinned bool, hidden int, label string) (*Clip, int64, error) {
	sealed, err := sealValue(content, aadClipContent)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to encrypt clip: %v", err)
	}

	query := `INSERT INTO clips (content, content_hash, type, pinned, enc_version, hidden, label, source, created_at)
		VALUES (?, ?, ?, ?, 1, ?, ?, ?, datetime('now'))`
	result, err := q.Exec(query, sealed, hmacContent(content), clipType, pinned, hidden, label, source)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to insert clip: %v", err)
	}

	insertID, err := result.LastInsertId()
	if err != nil {
		return nil, 0, fmt.Errorf("failed to get insert ID: %v", err)
	}

	clip, err := getClipByRowID(q, insertID)
	if err != nil {
		return nil, insertID, err
	}
	return clip, insertID, nil
}

func GetStorageLimit() (int, error) {
	return getStorageLimit(DB)
}

// getStorageLimit is GetStorageLimit bound to a querier so pruning can run
// inside the caller's transaction.
func getStorageLimit(q querier) (int, error) {
	query := `SELECT limit_count FROM clip_storage_limit WHERE id = 0`
	var limit int
	err := q.QueryRow(query).Scan(&limit)
	if err != nil {
		insertQuery := `INSERT OR IGNORE INTO clip_storage_limit (id, limit_count) VALUES (0, 100)`
		_, insertErr := q.Exec(insertQuery)
		if insertErr != nil {
			return 100, fmt.Errorf("failed to initialize storage limit: %v", insertErr)
		}
		return 100, nil
	}
	return limit, nil
}

func UpdateStorageLimit(newLimit int) error {
	if newLimit < 1 {
		return fmt.Errorf("storage limit must be at least 1")
	}
	query := `INSERT OR REPLACE INTO clip_storage_limit (id, limit_count) VALUES (0, ?)`
	_, err := DB.Exec(query, newLimit)
	if err != nil {
		return fmt.Errorf("failed to update storage limit: %v", err)
	}
	return nil
}

func GetClips() ([]Clip, error) {
	query := `SELECT ` + clipColumns + `
		FROM clips
		ORDER BY pinned DESC, created_at DESC
	`

	rows, err := DB.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var clips []Clip

	for rows.Next() {
		clip, err := scanClip(rows)
		if err != nil {
			return nil, err
		}
		clips = append(clips, clip)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return clips, nil
}

// getClipByRowID fetches a single clip by its database row ID.
func getClipByRowID(q querier, id int64) (*Clip, error) {
	clip, err := scanClip(q.QueryRow(
		`SELECT `+clipColumns+` FROM clips WHERE id = ?`, id,
	))
	if err != nil {
		return nil, err
	}
	return &clip, nil
}

// findExistingClipID returns the row ID of a duplicate text clip, or 0 if none
// exists. The keyed hash is the only comparison: the stored text is ciphertext.
func findExistingClipID(q querier, content string) (int64, error) {
	query := `SELECT id FROM clips WHERE content_hash = ? AND type = 'text' LIMIT 1`
	var id int64
	err := q.QueryRow(query, hmacContent(content)).Scan(&id)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("failed to check if clip exists: %v", err)
	}
	return id, nil
}

// findExistingImageClipID returns the row ID of a duplicate image clip, or 0 if none exists.
func findExistingImageClipID(q querier, image []byte) (int64, error) {
	query := `SELECT id FROM clips WHERE content_hash = ? AND type = 'image' LIMIT 1`
	var id int64
	err := q.QueryRow(query, sha256Hex(image)).Scan(&id)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("failed to check if image clip exists: %v", err)
	}
	return id, nil
}

func AddClip(content string, clipType string) (*Clip, []int, int, bool, error) {
	// Read the setting before starting the transaction: a single-connection
	// SQLite database cannot answer queries while a transaction holds it.
	autoHide, _ := GetAutoHideSensitive()

	tx, err := DB.Begin()
	if err != nil {
		return nil, nil, 0, false, fmt.Errorf("failed to start clip transaction: %v", err)
	}
	defer func() { _ = tx.Rollback() }()

	existingID, err := findExistingClipID(tx, content)
	if err != nil {
		return nil, nil, 0, false, fmt.Errorf("failed to check for duplicate: %v", err)
	}
	var deletedID int
	var oldPinned bool
	var oldHidden int
	var oldLabel string
	if existingID > 0 {
		// Read the existing clip's states before deleting so we can restore them.
		_ = tx.QueryRow(`SELECT pinned, hidden, label FROM clips WHERE id = ?`, existingID).
			Scan(&oldPinned, &oldHidden, &oldLabel)
		_, _ = deleteClipRow(tx, int(existingID))
		deletedID = int(existingID)
	}

	// Scan for secrets: hide when the setting is on. The notification is sent
	// after the commit so a slow OS call cannot hold the only DB connection.
	hidden := oldHidden
	autolabel := oldLabel
	sensitive := false
	if scanResult := secretscan.Scan(content); scanResult.IsSecret {
		sensitive = true
		autolabel = scanResult.Label // Use the generic rule label (e.g. "Payment Key", "Cloud Access Key")
		if autoHide {
			hidden = 1 // auto-hide overrides any previous visible state
		}
	}

	clip, insertID, err := insertTextClip(tx, content, clipType, "local", oldPinned, hidden, autolabel)
	if err != nil {
		return nil, nil, deletedID, false, err
	}

	prunedIDs, err := pruneExcessClips(tx)
	if err != nil {
		return nil, nil, deletedID, false, fmt.Errorf("failed to delete old clips: %v", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, nil, 0, false, fmt.Errorf("failed to commit clip: %v", err)
	}

	if sensitive {
		if AppNotif != nil {
			_ = AppNotif.SendNotification(notifications.NotificationOptions{
				ID:    fmt.Sprintf("clipcat-sensitive-%d", len(content)),
				Title: "Sensitive content detected",
				Body:  "A sensitive item was copied to your clipboard.",
			})
		}
		if AppInstance != nil {
			AppInstance.Event.Emit("sensitive:detected")
		}
	}

	// Index writes follow the commit: the index is rebuilt from the database on
	// every launch, so a crash here only costs a stale hit until restart.
	if deletedID > 0 {
		removeClipFromIndex(deletedID)
	}
	indexTextClip(int(insertID), content)
	for _, id := range prunedIDs {
		removeClipFromIndex(id)
	}

	return clip, prunedIDs, deletedID, true, nil
}

func AddManualClip(content string, pinned bool) (*Clip, []int, bool, error) {
	tx, err := DB.Begin()
	if err != nil {
		return nil, nil, false, fmt.Errorf("failed to start clip transaction: %v", err)
	}
	defer func() { _ = tx.Rollback() }()

	existingID, err := findExistingClipID(tx, content)
	if err != nil {
		return nil, nil, false, fmt.Errorf("failed to check for duplicate: %v", err)
	}
	if existingID > 0 {
		return nil, nil, false, nil
	}

	// Manual clips are intentionally added by the user - do not auto-hide them.
	clip, insertID, err := insertTextClip(tx, content, "text", "local", pinned, 0, "")
	if err != nil {
		return nil, nil, false, err
	}

	prunedIDs, err := pruneExcessClips(tx)
	if err != nil {
		return nil, nil, false, fmt.Errorf("failed to delete old clips: %v", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, nil, false, fmt.Errorf("failed to commit clip: %v", err)
	}

	indexTextClip(int(insertID), content)
	for _, id := range prunedIDs {
		removeClipFromIndex(id)
	}

	return clip, prunedIDs, true, nil
}

func AddImageClip(img []byte) (*Clip, []int, int, bool, error) {
	tx, err := DB.Begin()
	if err != nil {
		return nil, nil, 0, false, fmt.Errorf("failed to start clip transaction: %v", err)
	}
	defer func() { _ = tx.Rollback() }()

	existingID, err := findExistingImageClipID(tx, img)
	if err != nil {
		return nil, nil, 0, false, fmt.Errorf("failed to check for duplicate image: %v", err)
	}
	var deletedID int
	var oldImagePinned bool
	var oldImageHidden int
	if existingID > 0 {
		// Read the existing clip's states before deleting so we can restore them.
		_ = tx.QueryRow(`SELECT pinned, hidden FROM clips WHERE id = ?`, existingID).
			Scan(&oldImagePinned, &oldImageHidden)
		_, _ = deleteClipRow(tx, int(existingID))
		deletedID = int(existingID)
	}

	// Generate a small thumbnail so GetClips never transmits full images.
	thumb, err := generateThumbnail(img)
	if err != nil {
		thumb = nil
	}

	query := `INSERT INTO clips (image, thumbnail, content_hash, type, pinned, enc_version, hidden, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, datetime('now'))`
	result, err := tx.Exec(query, img, thumb, sha256Hex(img), "image", oldImagePinned, oldImageHidden)
	if err != nil {
		return nil, nil, deletedID, false, fmt.Errorf("failed to insert image clip: %v", err)
	}

	insertID, err := result.LastInsertId()
	if err != nil {
		return nil, nil, deletedID, false, fmt.Errorf("failed to get insert ID: %v", err)
	}

	prunedIDs, err := pruneExcessClips(tx)
	if err != nil {
		return nil, nil, deletedID, false, fmt.Errorf("failed to delete old clips: %v", err)
	}

	clip, err := getClipByRowID(tx, insertID)
	if err != nil {
		return nil, nil, deletedID, false, err
	}

	if err := tx.Commit(); err != nil {
		return nil, nil, 0, false, fmt.Errorf("failed to commit clip: %v", err)
	}

	for _, id := range prunedIDs {
		removeClipFromIndex(id)
	}

	return clip, prunedIDs, deletedID, true, nil
}

// generateThumbnail resizes img to at most 200px wide (keeping aspect ratio)
// and returns a JPEG thumbnail.  Input can be PNG, JPEG, or WebP.
func generateThumbnail(img []byte) ([]byte, error) {
	src, _, err := image.Decode(bytes.NewReader(img))
	if err != nil {
		return nil, fmt.Errorf("thumbnail decode: %w", err)
	}

	const maxWidth = 200
	bounds := src.Bounds()
	w, h := bounds.Dx(), bounds.Dy()
	if w <= maxWidth {
		// Already small enough - just re-encode as JPEG (usually smaller).
		var buf bytes.Buffer
		if err := jpeg.Encode(&buf, src, &jpeg.Options{Quality: 75}); err != nil {
			return nil, fmt.Errorf("thumbnail encode: %w", err)
		}
		return buf.Bytes(), nil
	}

	newH := h * maxWidth / w
	dst := image.NewRGBA(image.Rect(0, 0, maxWidth, newH))
	draw.ApproxBiLinear.Scale(dst, dst.Bounds(), src, bounds, draw.Src, nil)

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: 75}); err != nil {
		return nil, fmt.Errorf("thumbnail encode: %w", err)
	}
	return buf.Bytes(), nil
}

func normalizeImageToPNG(img []byte) ([]byte, error) {
	decoded, _, err := image.Decode(bytes.NewReader(img))
	if err != nil {
		return nil, fmt.Errorf("normalize image: %w", err)
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, decoded); err != nil {
		return nil, fmt.Errorf("encode png: %w", err)
	}
	return buf.Bytes(), nil
}

// pruneExcessClips removes the oldest clips when the table exceeds the
// storage limit. Returns the IDs of any deleted clips.
func pruneExcessClips(q querier) ([]int, error) {
	limit, err := getStorageLimit(q)
	if err != nil {
		return nil, err
	}

	var count int
	if err := q.QueryRow(`SELECT COUNT(*) FROM clips`).Scan(&count); err != nil {
		return nil, fmt.Errorf("prune: count: %w", err)
	}
	if count <= limit {
		return nil, nil
	}

	// RETURNING reports exactly which rows went, so the ids never come from a
	// second SELECT that could disagree with the DELETE. The caller drops them
	// from the search index after the transaction commits.
	rows, err := q.Query(`
		DELETE FROM clips
		WHERE id IN (
			SELECT id FROM clips
			ORDER BY pinned ASC, created_at ASC
			LIMIT ?
		)
		RETURNING id
	`, count-limit)
	if err != nil {
		return nil, fmt.Errorf("prune: delete: %w", err)
	}

	var prunedIDs []int
	for rows.Next() {
		var id int
		if scanErr := rows.Scan(&id); scanErr == nil {
			prunedIDs = append(prunedIDs, id)
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, fmt.Errorf("prune: delete: %w", err)
	}

	return prunedIDs, nil
}

// GetClipImage returns the full-resolution base64-encoded image for a
// single clip.  Use this for the detail dialog - never for the list view.
func GetClipImage(clipID int) (string, error) {
	var (
		image    []byte
		clipType string
	)
	err := DB.QueryRow(
		`SELECT image, type FROM clips WHERE id = ?`, clipID,
	).Scan(&image, &clipType)
	if err != nil {
		return "", fmt.Errorf("getClipImage: %w", err)
	}
	if clipType != "image" {
		return "", fmt.Errorf("getClipImage: clip %d is not an image", clipID)
	}

	if normalized, err := normalizeImageToPNG(image); err == nil {
		image = normalized
	}

	return base64.StdEncoding.EncodeToString(image), nil
}

// GetClipContent returns the full, untruncated text of a clip. The frontend
// uses it to copy, edit, or view a clip whose list preview was truncated.
func GetClipContent(clipID int) (string, error) {
	var (
		content    sql.NullString
		clipType   string
		encVersion int
	)
	err := DB.QueryRow(
		`SELECT content, type, enc_version FROM clips WHERE id = ?`, clipID,
	).Scan(&content, &clipType, &encVersion)
	if err != nil {
		return "", err
	}
	if clipType != "text" || !content.Valid {
		return "", fmt.Errorf("clip %d has no text content", clipID)
	}
	return decodeClipText(content.String, encVersion)
}

func UpdateClipContent(clipID int, newContent string) error {
	sealed, err := sealValue(newContent, aadClipContent)
	if err != nil {
		return fmt.Errorf("failed to encrypt clip content: %v", err)
	}
	query := `UPDATE clips SET content = ?, content_hash = ?, enc_version = 1 WHERE id = ?`
	result, err := DB.Exec(query, sealed, hmacContent(newContent), clipID)
	if err != nil {
		return fmt.Errorf("failed to update clip content: %v", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %v", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("clip with id %d not found", clipID)
	}

	if newContent == "" {
		removeClipFromIndex(clipID)
	} else {
		indexTextClip(clipID, newContent)
	}
	return nil
}

func TogglePinClip(clipID int) (bool, error) {
	query := `UPDATE clips SET pinned = NOT pinned WHERE id = ?`
	result, err := DB.Exec(query, clipID)
	if err != nil {
		return false, fmt.Errorf("failed to toggle pin status: %v", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return false, fmt.Errorf("failed to get rows affected: %v", err)
	}

	if rowsAffected == 0 {
		return false, fmt.Errorf("clip with id %d not found", clipID)
	}

	var pinned bool
	err = DB.QueryRow(`SELECT pinned FROM clips WHERE id = ?`, clipID).Scan(&pinned)
	if err != nil {
		return false, fmt.Errorf("failed to get new pinned state: %v", err)
	}
	return pinned, nil
}

func DeleteClip(clipID int) error {
	rowsAffected, err := deleteClipRow(DB, clipID)
	if err != nil {
		return err
	}

	if rowsAffected == 0 {
		return fmt.Errorf("clip with id %d not found", clipID)
	}

	removeClipFromIndex(clipID)
	return nil
}

// deleteClipRow deletes one clips row on any querier and reports how many rows
// it removed. Callers own the search index update.
func deleteClipRow(q querier, clipID int) (int64, error) {
	result, err := q.Exec(`DELETE FROM clips WHERE id = ?`, clipID)
	if err != nil {
		return 0, fmt.Errorf("failed to delete clip: %v", err)
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return 0, fmt.Errorf("failed to get rows affected: %v", err)
	}
	return rowsAffected, nil
}

func DeleteAllClips() error {
	_, err := DB.Exec(`DELETE FROM clips`)
	if err != nil {
		return fmt.Errorf("failed to delete all clips: %v", err)
	}
	rebuildIndexAfterBulkDelete()
	DB.Exec(`VACUUM`)
	return nil
}

func DeletePinnedClips() error {
	_, err := DB.Exec(`DELETE FROM clips WHERE pinned = 1`)
	if err != nil {
		return fmt.Errorf("failed to delete pinned clips: %v", err)
	}
	rebuildIndexAfterBulkDelete()
	DB.Exec(`VACUUM`)
	return nil
}

func DeleteUnpinnedClips() error {
	_, err := DB.Exec(`DELETE FROM clips WHERE pinned = 0`)
	if err != nil {
		return fmt.Errorf("failed to delete unpinned clips: %v", err)
	}
	rebuildIndexAfterBulkDelete()
	DB.Exec(`VACUUM`)
	return nil
}

// rebuildIndexAfterBulkDelete re-syncs the index with the clips table after a
// delete whose row ids were never collected.
func rebuildIndexAfterBulkDelete() {
	if err := RebuildIndex(); err != nil {
		fmt.Printf("search index rebuild: %v\n", err)
	}
}

// RenameClip updates the label/nickname for a clip identified by its row ID.
func RenameClip(clipID int, label string) error {
	query := `UPDATE clips SET label = ? WHERE id = ?`
	result, err := DB.Exec(query, label, clipID)
	if err != nil {
		return fmt.Errorf("failed to rename clip: %v", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %v", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("clip with id %d not found", clipID)
	}

	return nil
}

// UnhideClip marks a clip as visible (hidden=0), meaning the user has
// confirmed it is not sensitive.
func UnhideClip(clipID int) error {
	_, err := DB.Exec(`UPDATE clips SET hidden = 0 WHERE id = ?`, clipID)
	return err
}

// HideClip marks a clip as hidden (hidden=1) so the frontend suppresses it.
func HideClip(clipID int) error {
	_, err := DB.Exec(`UPDATE clips SET hidden = 1 WHERE id = ?`, clipID)
	return err
}

// AddNetworkClip inserts a clip received from the LAN.  No secret scanning
// is performed (trusted peers).  The source is always 'network' so the
// manager can avoid re-broadcasting it.
func AddNetworkClip(content string, clipType string, img []byte) (*Clip, error) {
	switch clipType {
	case "text":
		clip, insertID, err := insertTextClip(DB, content, clipType, "network", false, 0, "")
		if err != nil {
			return nil, err
		}
		indexTextClip(int(insertID), content)
		return clip, nil

	case "image":
		// Generate a thumbnail.
		thumb, err := generateThumbnail(img)
		if err != nil {
			thumb = nil
		}

		query := `INSERT INTO clips (image, thumbnail, content_hash, type, pinned, enc_version, source, created_at) VALUES (?, ?, ?, ?, 0, 0, 'network', datetime('now'))`
		result, err := DB.Exec(query, img, thumb, sha256Hex(img), clipType)
		if err != nil {
			return nil, fmt.Errorf("failed to insert network image clip: %v", err)
		}

		insertID, err := result.LastInsertId()
		if err != nil {
			return nil, fmt.Errorf("failed to get insert ID: %v", err)
		}

		clip, err := getClipByRowID(DB, insertID)
		if err != nil {
			return nil, err
		}
		return clip, nil

	default:
		return nil, fmt.Errorf("unknown clip type: %s", clipType)
	}
}
