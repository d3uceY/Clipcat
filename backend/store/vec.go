package store

import (
	"encoding/binary"
	"fmt"
	"log"
	"math"
	"sort"
	"strconv"
)

// Vector storage + semantic (meaning-based) search.
//
// Embeddings live in the clips_vec vec0 virtual table (created by
// MigrateVecTable in db.go). Each row is one text chunk; a clip with a long
// body owns several rows pointing back at it via clip_id. Queries are cosine
// k-NN: vec0 returns rows ordered by distance (0 = identical, 1 = orthogonal,
// 2 = opposite), we dedupe by clip_id and drop anything past the threshold.

// semanticCandidatePool is how many nearest rows we ask vec0 for before
// deduping. A clip with many chunks can occupy several top slots, so fetch a
// generous pool and collapse to unique clips afterwards. At clipboard scale
// this is a handful of vectors either way.
const semanticCandidatePool = 100

// serializeFloat32 encodes a []float32 into the little-endian raw BLOB format
// sqlite-vec expects for float vectors.
func serializeFloat32(v []float32) []byte {
	buf := make([]byte, len(v)*4)
	for i, f := range v {
		binary.LittleEndian.PutUint32(buf[i*4:], math.Float32bits(f))
	}
	return buf
}

// StoreClipEmbeddings replaces any existing embeddings for clipID with the
// given chunk vectors (one row per chunk). Re-embedding a clip therefore
// starts by clearing its old rows.
func StoreClipEmbeddings(clipID int, chunks [][]float32) error {
	if _, err := DB.Exec(`DELETE FROM clips_vec WHERE clip_id = ?`, clipID); err != nil {
		return fmt.Errorf("clear embeddings: %w", err)
	}
	for _, chunk := range chunks {
		if _, err := DB.Exec(
			`INSERT INTO clips_vec (embedding, clip_id) VALUES (?, ?)`,
			serializeFloat32(chunk), clipID,
		); err != nil {
			return fmt.Errorf("insert embedding: %w", err)
		}
	}
	return nil
}

// DeleteClipEmbeddings removes all embedding rows for a clip. Mirrors
// removeClipFromIndex so every delete path (single, bulk, prune) stays in
// sync with the vector index.
func DeleteClipEmbeddings(clipID int) {
	_, _ = DB.Exec(`DELETE FROM clips_vec WHERE clip_id = ?`, clipID)
}

// PruneOrphanedEmbeddings removes embedding rows whose clip no longer exists
// in the clips table (after DeleteAllClips / DeletePinnedClips /
// DeleteUnpinnedClips).
func PruneOrphanedEmbeddings() {
	_, _ = DB.Exec(`DELETE FROM clips_vec WHERE clip_id NOT IN (SELECT id FROM clips)`)
}

// TextClipRow is a minimal text clip used for the embedding backfill.
type TextClipRow struct {
	ID      int
	Content string
}

// TextClipsMissingEmbeddings returns text clips that have no embedding rows
// yet, so existing history becomes meaning-searchable on first enable. Rows
// are collected fully before returning so the single DB connection isn't held
// open across the caller's enqueue loop.
func TextClipsMissingEmbeddings() ([]TextClipRow, error) {
	rows, err := DB.Query(`
		SELECT c.id, c.content
		FROM clips c
		WHERE c.type = 'text' AND c.content IS NOT NULL AND c.content != ''
		  AND NOT EXISTS (SELECT 1 FROM clips_vec v WHERE v.clip_id = c.id)
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []TextClipRow
	for rows.Next() {
		var r TextClipRow
		if err := rows.Scan(&r.ID, &r.Content); err == nil {
			out = append(out, r)
		}
	}
	return out, rows.Err()
}

// SemanticSearch returns the clips whose stored embeddings are closest to
// queryVec. vec0 runs a cosine k-NN over the table; we then collapse
// per-clip (a clip with many chunks can dominate the top slots), keep only
// matches within maxDistance, and return up to limit clips in distance order.
func SemanticSearch(queryVec []float32, limit int, maxDistance float64) ([]Clip, error) {
	if len(queryVec) == 0 || limit <= 0 {
		return nil, nil
	}

	// LIMIT is inlined (strconv, not user input) because vec0's k-NN is keyed
	// off the LIMIT constraint; a bound parameter can be missed by the query
	// planner on some SQLite versions.
	rows, err := DB.Query(`
		SELECT clip_id, distance
		FROM clips_vec
		WHERE embedding MATCH ?
		ORDER BY distance
		LIMIT `+strconv.Itoa(semanticCandidatePool), serializeFloat32(queryVec))
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	best := map[int64]float64{}
	for rows.Next() {
		var clipID int64
		var d float64
		if err := rows.Scan(&clipID, &d); err != nil {
			continue
		}
		if d > maxDistance {
			continue
		}
		if cur, ok := best[clipID]; !ok || d < cur {
			best[clipID] = d
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	ids := make([]int64, 0, len(best))
	for id := range best {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return best[ids[i]] < best[ids[j]] })
	if len(ids) > limit {
		ids = ids[:limit]
	}

	clips := make([]Clip, 0, len(ids))
	for _, id := range ids {
		if clip, err := getClipByRowID(id); err == nil {
			clips = append(clips, *clip)
		}
	}

	// DEBUG (temporary): log the query vector and the raw nearest-neighbour
	// matches (clip_id=distance) before they're collapsed into clips.
	preview := queryVec
	if len(preview) > 8 {
		preview = preview[:8]
	}
	matches := make([]string, 0, len(ids))
	for _, id := range ids {
		matches = append(matches, fmt.Sprintf("clip_%03d=%.4f", id, best[id]))
	}
	log.Printf("[semantic] SemanticSearch queryVec(dim=%d)=%v... matches=%v", len(queryVec), preview, matches)
	return clips, nil
}
