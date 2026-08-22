package store

import (
	"bytes"
	"database/sql"
	"encoding/base64"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"

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
func buildClip(rowID int, content sql.NullString, image, thumbnail []byte, clipType string, pinned bool, createdAt, label string, hidden bool, source string) Clip {
	clip := Clip{
		ID:        fmt.Sprintf("clip_%03d", rowID),
		Type:      clipType,
		Pinned:    pinned,
		CreatedAt: createdAt,
		Label:     label,
		Hidden:    hidden,
		Source:    source,
	}

	if clipType == "text" && content.Valid {
		preview := TrimContent(content.String)
		clip.Content = &preview
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

func GetStorageLimit() (int, error) {
	query := `SELECT limit_count FROM clip_storage_limit WHERE id = 0`
	var limit int
	err := DB.QueryRow(query).Scan(&limit)
	if err != nil {
		insertQuery := `INSERT OR IGNORE INTO clip_storage_limit (id, limit_count) VALUES (0, 100)`
		_, insertErr := DB.Exec(insertQuery)
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
	query := `
		SELECT id, content, image, thumbnail, type, pinned, created_at, label, hidden, source
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
		var (
			id        int
			content   sql.NullString
			image     []byte
			thumbnail []byte
			clipType  string
			pinned    bool
			createdAt string
			label     string
			hidden    bool
			source    string
		)

		err := rows.Scan(&id, &content, &image, &thumbnail, &clipType, &pinned, &createdAt, &label, &hidden, &source)
		if err != nil {
			return nil, err
		}

		clips = append(clips, buildClip(id, content, image, thumbnail, clipType, pinned, createdAt, label, hidden, source))
	}

	return clips, nil
}

// getClipByRowID fetches and decrypts a single clip by its database row ID.
func getClipByRowID(id int64) (*Clip, error) {
	var (
		rowID     int
		content   sql.NullString
		img       []byte
		thumbnail []byte
		clipType  string
		pinned    bool
		createdAt string
		label     string
		hidden    bool
		source    string
	)
	err := DB.QueryRow(
		`SELECT id, content, image, thumbnail, type, pinned, created_at, label, hidden, source FROM clips WHERE id = ?`, id,
	).Scan(&rowID, &content, &img, &thumbnail, &clipType, &pinned, &createdAt, &label, &hidden, &source)
	if err != nil {
		return nil, err
	}

	clip := buildClip(rowID, content, img, thumbnail, clipType, pinned, createdAt, label, hidden, source)
	return &clip, nil
}

// findExistingClipID returns the row ID of a duplicate text clip, or 0 if none exists.
func findExistingClipID(content string) (int64, error) {
	hash := hashContent([]byte(content))
	query := `SELECT id FROM clips WHERE content_hash = ? OR (encrypted = 0 AND content = ?) LIMIT 1`
	var id int64
	err := DB.QueryRow(query, hash, content).Scan(&id)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("failed to check if clip exists: %v", err)
	}
	return id, nil
}

// findExistingImageClipID returns the row ID of a duplicate image clip, or 0 if none exists.
func findExistingImageClipID(image []byte) (int64, error) {
	hash := hashContent(image)
	query := `SELECT id FROM clips WHERE content_hash = ? OR (encrypted = 0 AND image = ?) LIMIT 1`
	var id int64
	err := DB.QueryRow(query, hash, image).Scan(&id)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("failed to check if image clip exists: %v", err)
	}
	return id, nil
}

func AddClip(content string, clipType string) (*Clip, []int, int, bool, error) {
	existingID, err := findExistingClipID(content)
	if err != nil {
		return nil, nil, 0, false, fmt.Errorf("failed to check for duplicate: %v", err)
	}
	var deletedID int
	var oldPinned bool
	var oldHidden int
	var oldLabel string
	if existingID > 0 {
		// Read the existing clip's states before deleting so we can restore them.
		_ = DB.QueryRow(`SELECT pinned, hidden, label FROM clips WHERE id = ?`, existingID).
			Scan(&oldPinned, &oldHidden, &oldLabel)
		_ = DeleteClip(int(existingID))
		deletedID = int(existingID)
	}

	hash := hashContent([]byte(content))

	// Scan for secrets: notify always, auto-hide only when the setting is on.
	hidden := oldHidden
	autolabel := oldLabel
	if scanResult := secretscan.Scan(content); scanResult.IsSecret {
		autolabel = scanResult.Label // Use the generic rule label (e.g. "Payment Key", "Cloud Access Key")
		if autoHide, _ := GetAutoHideSensitive(); autoHide {
			hidden = 1 // auto-hide overrides any previous visible state
		}
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

	query := `INSERT INTO clips (content, content_hash, type, pinned, encrypted, hidden, label, created_at) VALUES (?, ?, ?, ?, 0, ?, ?, datetime('now'))`
	result, err := DB.Exec(query, content, hash, clipType, oldPinned, hidden, autolabel)
	if err != nil {
		return nil, nil, deletedID, false, fmt.Errorf("failed to insert clip: %v", err)
	}

	insertID, err := result.LastInsertId()
	if err != nil {
		return nil, nil, deletedID, false, fmt.Errorf("failed to get insert ID: %v", err)
	}
	indexTextClip(int(insertID), content)

	prunedIDs, err := pruneExcessClips()
	if err != nil {
		return nil, nil, deletedID, false, fmt.Errorf("failed to delete old clips: %v", err)
	}

	clip, _ := getClipByRowID(insertID)
	return clip, prunedIDs, deletedID, true, nil
}

func AddManualClip(content string, pinned bool) (*Clip, []int, bool, error) {
	existingID, err := findExistingClipID(content)
	if err != nil {
		return nil, nil, false, fmt.Errorf("failed to check for duplicate: %v", err)
	}
	if existingID > 0 {
		return nil, nil, false, nil
	}

	hash := hashContent([]byte(content))

	// Manual clips are intentionally added by the user - do not auto-hide them.
	query := `INSERT INTO clips (content, content_hash, type, pinned, encrypted, created_at) VALUES (?, ?, ?, ?, 0, datetime('now'))`
	result, err := DB.Exec(query, content, hash, "text", pinned)
	if err != nil {
		return nil, nil, false, fmt.Errorf("failed to insert clip: %v", err)
	}

	insertID, err := result.LastInsertId()
	if err != nil {
		return nil, nil, false, fmt.Errorf("failed to get insert ID: %v", err)
	}
	indexTextClip(int(insertID), content)

	prunedIDs, err := pruneExcessClips()
	if err != nil {
		return nil, nil, false, fmt.Errorf("failed to delete old clips: %v", err)
	}

	clip, _ := getClipByRowID(insertID)
	return clip, prunedIDs, true, nil
}

func AddImageClip(img []byte) (*Clip, []int, int, bool, error) {
	existingID, err := findExistingImageClipID(img)
	if err != nil {
		return nil, nil, 0, false, fmt.Errorf("failed to check for duplicate image: %v", err)
	}
	var deletedID int
	var oldImagePinned bool
	var oldImageHidden int
	if existingID > 0 {
		// Read the existing clip's states before deleting so we can restore them.
		_ = DB.QueryRow(`SELECT pinned, hidden FROM clips WHERE id = ?`, existingID).
			Scan(&oldImagePinned, &oldImageHidden)
		_ = DeleteClip(int(existingID))
		deletedID = int(existingID)
	}

	hash := hashContent(img)

	// Generate a small thumbnail so GetClips never transmits full images.
	thumb, err := generateThumbnail(img)
	if err != nil {
		thumb = nil
	}

	query := `INSERT INTO clips (image, thumbnail, content_hash, type, pinned, encrypted, hidden, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, datetime('now'))`
	result, err := DB.Exec(query, img, thumb, hash, "image", oldImagePinned, oldImageHidden)
	if err != nil {
		return nil, nil, deletedID, false, fmt.Errorf("failed to insert image clip: %v", err)
	}

	insertID, err := result.LastInsertId()
	if err != nil {
		return nil, nil, deletedID, false, fmt.Errorf("failed to get insert ID: %v", err)
	}

	prunedIDs, err := pruneExcessClips()
	if err != nil {
		return nil, nil, deletedID, false, fmt.Errorf("failed to delete old clips: %v", err)
	}

	clip, _ := getClipByRowID(insertID)
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
func pruneExcessClips() ([]int, error) {
	limit, err := GetStorageLimit()
	if err != nil {
		return nil, err
	}

	var count int
	if err := DB.QueryRow(`SELECT COUNT(*) FROM clips`).Scan(&count); err != nil {
		return nil, fmt.Errorf("prune: count: %w", err)
	}
	if count <= limit {
		return nil, nil
	}

	excess := count - limit
	rows, err := DB.Query(`
		SELECT id FROM clips
		ORDER BY pinned ASC, created_at ASC
		LIMIT ?
	`, excess)
	if err != nil {
		return nil, fmt.Errorf("prune: select ids: %w", err)
	}
	var prunedIDs []int
	for rows.Next() {
		var id int
		if scanErr := rows.Scan(&id); scanErr == nil {
			prunedIDs = append(prunedIDs, id)
		}
	}
	rows.Close()

	if len(prunedIDs) == 0 {
		return nil, nil
	}

	_, err = DB.Exec(`
		DELETE FROM clips
		WHERE id IN (
			SELECT id FROM clips
			ORDER BY pinned ASC, created_at ASC
			LIMIT ?
		)
	`, excess)
	if err != nil {
		return nil, fmt.Errorf("prune: delete: %w", err)
	}
	for _, id := range prunedIDs {
		removeClipFromIndex(id)
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
		content  sql.NullString
		clipType string
	)
	err := DB.QueryRow(
		`SELECT content, type FROM clips WHERE id = ?`, clipID,
	).Scan(&content, &clipType)
	if err != nil {
		return "", err
	}
	if clipType != "text" || !content.Valid {
		return "", fmt.Errorf("clip %d has no text content", clipID)
	}
	return content.String, nil
}

func UpdateClipContent(clipID int, newContent string) error {
	hash := hashContent([]byte(newContent))
	query := `UPDATE clips SET content = ?, content_hash = ?, encrypted = 0 WHERE id = ?`
	result, err := DB.Exec(query, newContent, hash, clipID)
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

	indexTextClip(clipID, newContent)
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
	query := `DELETE FROM clips WHERE id = ?`
	result, err := DB.Exec(query, clipID)
	if err != nil {
		return fmt.Errorf("failed to delete clip: %v", err)
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get rows affected: %v", err)
	}

	if rowsAffected == 0 {
		return fmt.Errorf("clip with id %d not found", clipID)
	}

	removeClipFromIndex(clipID)
	return nil
}

func DeleteAllClips() error {
	_, err := DB.Exec(`DELETE FROM clips`)
	if err != nil {
		return fmt.Errorf("failed to delete all clips: %v", err)
	}
	pruneOrphanedIndexRows()
	DB.Exec(`VACUUM`)
	return nil
}

func DeletePinnedClips() error {
	_, err := DB.Exec(`DELETE FROM clips WHERE pinned = 1`)
	if err != nil {
		return fmt.Errorf("failed to delete pinned clips: %v", err)
	}
	pruneOrphanedIndexRows()
	DB.Exec(`VACUUM`)
	return nil
}

func DeleteUnpinnedClips() error {
	_, err := DB.Exec(`DELETE FROM clips WHERE pinned = 0`)
	if err != nil {
		return fmt.Errorf("failed to delete unpinned clips: %v", err)
	}
	pruneOrphanedIndexRows()
	DB.Exec(`VACUUM`)
	return nil
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
		hash := hashContent([]byte(content))

		query := `INSERT INTO clips (content, content_hash, type, pinned, encrypted, source, created_at) VALUES (?, ?, ?, 0, 0, 'network', datetime('now'))`
		result, err := DB.Exec(query, content, hash, clipType)
		if err != nil {
			return nil, fmt.Errorf("failed to insert network clip: %v", err)
		}

		insertID, err := result.LastInsertId()
		if err != nil {
			return nil, fmt.Errorf("failed to get insert ID: %v", err)
		}
		indexTextClip(int(insertID), content)

		clip, err := getClipByRowID(insertID)
		if err != nil {
			return nil, err
		}
		return clip, nil

	case "image":
		hash := hashContent(img)

		// Generate a thumbnail.
		thumb, err := generateThumbnail(img)
		if err != nil {
			thumb = nil
		}

		query := `INSERT INTO clips (image, thumbnail, content_hash, type, pinned, encrypted, source, created_at) VALUES (?, ?, ?, ?, 0, 0, 'network', datetime('now'))`
		result, err := DB.Exec(query, img, thumb, hash, clipType)
		if err != nil {
			return nil, fmt.Errorf("failed to insert network image clip: %v", err)
		}

		insertID, err := result.LastInsertId()
		if err != nil {
			return nil, fmt.Errorf("failed to get insert ID: %v", err)
		}

		clip, err := getClipByRowID(insertID)
		if err != nil {
			return nil, err
		}
		return clip, nil

	default:
		return nil, fmt.Errorf("unknown clip type: %s", clipType)
	}
}
