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
	Content   *string `json:"content,omitempty"`
	Image     *string `json:"image,omitempty"` // base64 - thumbnail for list, full-res on demand
	Length    int     `json:"length"`
	Pinned    bool    `json:"isPinned"`
	CreatedAt string  `json:"createdAt"`
	Label     string  `json:"label"`
	Hidden    bool    `json:"isHidden"`
	Source    string  `json:"source,omitempty"` // "local" (default) or "network"
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
		SELECT id, content, image, thumbnail, type, pinned, created_at, encrypted, label, hidden, source
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
			encrypted bool
			label     string
			hidden    bool
			source    string
		)

		err := rows.Scan(&id, &content, &image, &thumbnail, &clipType, &pinned, &createdAt, &encrypted, &label, &hidden, &source)
		if err != nil {
			return nil, err
		}

		clip := Clip{
			ID:        fmt.Sprintf("clip_%03d", id),
			Type:      clipType,
			Pinned:    pinned,
			CreatedAt: createdAt,
			Label:     label,
			Hidden:    hidden,
			Source:    source,
		}

		if clipType == "text" && content.Valid {
			if encrypted {
				plaintext, err := decryptText(content.String)
				if err == nil {
					clip.Content = &plaintext
					clip.Length = len(plaintext)
				} else {
					clip.Content = &content.String
					clip.Length = len(content.String)
				}
			} else {
				clip.Content = &content.String
				clip.Length = len(content.String)
			}
		}

		if clipType == "image" {
			// Decrypt thumbnail if needed; fall back to full image for
			// clips inserted before the thumbnail column was added.
			thumbBytes := thumbnail
			if len(thumbBytes) == 0 {
				thumbBytes = image
			}
			if encrypted && len(thumbBytes) > 0 {
				if dec, err := decryptData(thumbBytes); err == nil {
					thumbBytes = dec
				}
			}
			if len(thumbBytes) > 0 {
				if normalized, err := normalizeImageToPNG(thumbBytes); err == nil {
					thumbBytes = normalized
				}
				encoded := base64.StdEncoding.EncodeToString(thumbBytes)
				clip.Image = &encoded
				clip.Length = len(thumbBytes)
			}
		}

		clips = append(clips, clip)
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
		encrypted bool
		label     string
		hidden    bool
		source    string
	)
	err := DB.QueryRow(
		`SELECT id, content, image, thumbnail, type, pinned, created_at, encrypted, label, hidden, source FROM clips WHERE id = ?`, id,
	).Scan(&rowID, &content, &img, &thumbnail, &clipType, &pinned, &createdAt, &encrypted, &label, &hidden, &source)
	if err != nil {
		return nil, err
	}

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
		if encrypted {
			plaintext, err := decryptText(content.String)
			if err == nil {
				clip.Content = &plaintext
				clip.Length = len(plaintext)
			} else {
				clip.Content = &content.String
				clip.Length = len(content.String)
			}
		} else {
			clip.Content = &content.String
			clip.Length = len(content.String)
		}
	}

	if clipType == "image" {
		thumbBytes := thumbnail
		if len(thumbBytes) == 0 {
			thumbBytes = img
		}
		if encrypted && len(thumbBytes) > 0 {
			if dec, err := decryptData(thumbBytes); err == nil {
				thumbBytes = dec
			}
		}
		if len(thumbBytes) > 0 {
			if normalized, err := normalizeImageToPNG(thumbBytes); err == nil {
				thumbBytes = normalized
			}
			encoded := base64.StdEncoding.EncodeToString(thumbBytes)
			clip.Image = &encoded
			clip.Length = len(thumbBytes)
		}
	}

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

	enc, err := encryptText(content)
	if err != nil {
		return nil, nil, 0, false, fmt.Errorf("failed to encrypt clip: %v", err)
	}
	hash := hashContent([]byte(content))

	// Scan for secrets: notify always, auto-hide only when the setting is on.
	hidden := oldHidden
	autolabel := oldLabel
	if scanResult := secretscan.Scan(content); scanResult.IsSecret {
		autolabel = scanResult.Label
		if autoHide, _ := GetAutoHideSensitive(); autoHide {
			hidden = 1 // auto-hide overrides any previous visible state
		}
		if autolabel == "" || scanResult.Label != "" {
			autolabel = scanResult.Label
		}
		if AppNotif != nil {
			body := "A sensitive item was copied to your clipboard."
			if autolabel != "" {
				body = autolabel + " was copied to your clipboard."
			}
			_ = AppNotif.SendNotification(notifications.NotificationOptions{
				ID:    fmt.Sprintf("clipcat-sensitive-%d", len(content)),
				Title: "Sensitive content detected",
				Body:  body,
			})
		}
		if AppInstance != nil {
			AppInstance.Event.Emit("sensitive:detected")
		}
	}

	query := `INSERT INTO clips (content, content_hash, type, pinned, encrypted, hidden, label, created_at) VALUES (?, ?, ?, ?, 1, ?, ?, datetime('now'))`
	result, err := DB.Exec(query, enc, hash, clipType, oldPinned, hidden, autolabel)
	if err != nil {
		return nil, nil, deletedID, false, fmt.Errorf("failed to insert clip: %v", err)
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

func AddManualClip(content string, pinned bool) (*Clip, []int, bool, error) {
	existingID, err := findExistingClipID(content)
	if err != nil {
		return nil, nil, false, fmt.Errorf("failed to check for duplicate: %v", err)
	}
	if existingID > 0 {
		return nil, nil, false, nil
	}

	enc, err := encryptText(content)
	if err != nil {
		return nil, nil, false, fmt.Errorf("failed to encrypt clip: %v", err)
	}
	hash := hashContent([]byte(content))

	// Manual clips are intentionally added by the user - do not auto-hide them.
	query := `INSERT INTO clips (content, content_hash, type, pinned, encrypted, created_at) VALUES (?, ?, ?, ?, 1, datetime('now'))`
	result, err := DB.Exec(query, enc, hash, "text", pinned)
	if err != nil {
		return nil, nil, false, fmt.Errorf("failed to insert clip: %v", err)
	}

	insertID, err := result.LastInsertId()
	if err != nil {
		return nil, nil, false, fmt.Errorf("failed to get insert ID: %v", err)
	}

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

	enc, err := encryptData(img)
	if err != nil {
		return nil, nil, 0, false, fmt.Errorf("failed to encrypt image clip: %v", err)
	}
	hash := hashContent(img)

	// Generate a small thumbnail so GetClips never transmits full images.
	thumb, err := generateThumbnail(img)
	if err != nil {
		thumb = nil
	}
	var encThumb []byte
	if len(thumb) > 0 {
		encThumb, _ = encryptData(thumb)
	}

	query := `INSERT INTO clips (image, thumbnail, content_hash, type, pinned, encrypted, hidden, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, datetime('now'))`
	result, err := DB.Exec(query, enc, encThumb, hash, "image", oldImagePinned, oldImageHidden)
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
	return prunedIDs, nil
}

// GetClipImage returns the full-resolution base64-encoded image for a
// single clip.  Use this for the detail dialog - never for the list view.
func GetClipImage(clipID int) (string, error) {
	var (
		image     []byte
		clipType  string
		encrypted bool
	)
	err := DB.QueryRow(
		`SELECT image, type, encrypted FROM clips WHERE id = ?`, clipID,
	).Scan(&image, &clipType, &encrypted)
	if err != nil {
		return "", fmt.Errorf("getClipImage: %w", err)
	}
	if clipType != "image" {
		return "", fmt.Errorf("getClipImage: clip %d is not an image", clipID)
	}

	if encrypted {
		dec, err := decryptData(image)
		if err != nil {
			return "", fmt.Errorf("getClipImage decrypt: %w", err)
		}
		image = dec
	}

	if normalized, err := normalizeImageToPNG(image); err == nil {
		image = normalized
	}

	return base64.StdEncoding.EncodeToString(image), nil
}

func UpdateClipContent(clipID int, newContent string) error {
	enc, err := encryptText(newContent)
	if err != nil {
		return fmt.Errorf("failed to encrypt updated content: %v", err)
	}
	hash := hashContent([]byte(newContent))
	query := `UPDATE clips SET content = ?, content_hash = ?, encrypted = 1 WHERE id = ?`
	result, err := DB.Exec(query, enc, hash, clipID)
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

	return nil
}

func DeleteAllClips() error {
	_, err := DB.Exec(`DELETE FROM clips`)
	if err != nil {
		return fmt.Errorf("failed to delete all clips: %v", err)
	}
	DB.Exec(`VACUUM`)
	return nil
}

func DeletePinnedClips() error {
	_, err := DB.Exec(`DELETE FROM clips WHERE pinned = 1`)
	if err != nil {
		return fmt.Errorf("failed to delete pinned clips: %v", err)
	}
	DB.Exec(`VACUUM`)
	return nil
}

func DeleteUnpinnedClips() error {
	_, err := DB.Exec(`DELETE FROM clips WHERE pinned = 0`)
	if err != nil {
		return fmt.Errorf("failed to delete unpinned clips: %v", err)
	}
	DB.Exec(`VACUUM`)
	return nil
}

// GetDistinctLabels returns all distinct non-empty labels across all clips, sorted.
func GetDistinctLabels() ([]string, error) {
	rows, err := DB.Query(`SELECT DISTINCT label FROM clips WHERE label != '' ORDER BY label`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var labels []string
	for rows.Next() {
		var l string
		if err := rows.Scan(&l); err != nil {
			return nil, err
		}
		labels = append(labels, l)
	}
	return labels, nil
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

// SeedTestImageClips finds the most recent image clip in the DB and inserts n
// duplicates of it directly, bypassing duplicate checks and storage-limit
// pruning. Intended for performance testing only.
func SeedTestImageClips(n int) error {
	var (
		imgData   []byte
		thumb     []byte
		encrypted bool
	)
	err := DB.QueryRow(
		`SELECT image, thumbnail, encrypted FROM clips WHERE type = 'image' ORDER BY created_at DESC LIMIT 1`,
	).Scan(&imgData, &thumb, &encrypted)
	if err != nil {
		return fmt.Errorf("seedTestImageClips: no image clip found: %w", err)
	}

	tx, err := DB.Begin()
	if err != nil {
		return fmt.Errorf("seedTestImageClips: begin tx: %w", err)
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`INSERT INTO clips (image, thumbnail, content_hash, type, encrypted, created_at)
		VALUES (?, ?, ?, 'image', ?, datetime('now', ?))`)
	if err != nil {
		return fmt.Errorf("seedTestImageClips: prepare: %w", err)
	}
	defer stmt.Close()

	for i := 0; i < n; i++ {
		// Re-encrypt a fresh copy so each row gets a unique hash.
		rawImg := imgData
		if encrypted {
			if dec, err := decryptData(imgData); err == nil {
				rawImg = dec
			}
		}
		// Append a dummy byte sequence to make the content distinct each iteration.
		unique := append(rawImg, byte(i), byte(i>>8), byte(i>>16))
		enc, err := encryptData(unique)
		if err != nil {
			return fmt.Errorf("seedTestImageClips: encrypt %d: %w", i+1, err)
		}
		hash := hashContent(unique)
		offset := fmt.Sprintf("-%d seconds", i)
		if _, err := stmt.Exec(enc, thumb, hash, encrypted, offset); err != nil {
			return fmt.Errorf("seedTestImageClips: insert %d: %w", i+1, err)
		}
	}

	return tx.Commit()
}

// SeedTestClips inserts n test clips directly into the DB, bypassing duplicate
// checks and storage-limit pruning. Intended for performance testing only.
func SeedTestClips(n int) error {
	samples := []string{
		"Short test clip #%d",
		"This is a medium-length test clip number %d with some extra text to make it a bit more realistic.",
		"Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Test clip #%d.",
		"package main\n\nimport \"fmt\"\n\nfunc main() {\n\tfmt.Println(\"Hello from clip #%d\")\n}",
		"https://example.com/test/%d?query=value&page=1",
		"Line one\nLine two\nLine three\nLine four\nLine five\nClip #%d",
	}

	tx, err := DB.Begin()
	if err != nil {
		return fmt.Errorf("seedTestClips: begin tx: %w", err)
	}
	defer tx.Rollback()

	stmt, err := tx.Prepare(`INSERT INTO clips (content, content_hash, type, pinned, encrypted, created_at)
		VALUES (?, ?, 'text', 0, 1, datetime('now', ?))`)
	if err != nil {
		return fmt.Errorf("seedTestClips: prepare: %w", err)
	}
	defer stmt.Close()

	for i := 0; i < n; i++ {
		content := fmt.Sprintf(samples[i%len(samples)], i+1)
		enc, err := encryptText(content)
		if err != nil {
			return fmt.Errorf("seedTestClips: encrypt clip %d: %w", i+1, err)
		}
		hash := hashContent([]byte(content))
		offset := fmt.Sprintf("-%d seconds", i)
		if _, err := stmt.Exec(enc, hash, offset); err != nil {
			return fmt.Errorf("seedTestClips: insert clip %d: %w", i+1, err)
		}
	}

	return tx.Commit()
}

// AddNetworkClip inserts a clip received from the LAN.  No secret scanning
// is performed (trusted peers).  The source is always 'network' so the
// manager can avoid re-broadcasting it.
func AddNetworkClip(content string, clipType string, img []byte) (*Clip, error) {
	switch clipType {
	case "text":
		enc, err := encryptText(content)
		if err != nil {
			return nil, fmt.Errorf("failed to encrypt network clip: %v", err)
		}
		hash := hashContent([]byte(content))

		query := `INSERT INTO clips (content, content_hash, type, pinned, encrypted, source, created_at) VALUES (?, ?, ?, 0, 1, 'network', datetime('now'))`
		result, err := DB.Exec(query, enc, hash, clipType)
		if err != nil {
			return nil, fmt.Errorf("failed to insert network clip: %v", err)
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

	case "image":
		enc, err := encryptData(img)
		if err != nil {
			return nil, fmt.Errorf("failed to encrypt network image: %v", err)
		}
		hash := hashContent(img)

		// Generate a thumbnail.
		thumb, err := generateThumbnail(img)
		if err != nil {
			thumb = nil
		}
		var encThumb []byte
		if len(thumb) > 0 {
			encThumb, _ = encryptData(thumb)
		}

		query := `INSERT INTO clips (image, thumbnail, content_hash, type, pinned, encrypted, source, created_at) VALUES (?, ?, ?, ?, 0, 1, 'network', datetime('now'))`
		result, err := DB.Exec(query, enc, encThumb, hash, clipType)
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
