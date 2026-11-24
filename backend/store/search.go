package store

import (
	"sort"
	"strings"
)

// Builds FTS5 MATCH expressions against the in-memory index. The index is
// rebuilt from decrypted clips at startup (see index.go); nothing plaintext is
// written to the database file.

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

// SearchClips runs a full-text search over decrypted clip text and returns
// matching clips (with truncated previews), ordered like the main list:
// pinned first, then newest. Hidden clips are included - the frontend splits
// them into the hidden sections.
func SearchClips(query string) ([]Clip, error) {
	expr := buildMatchExpression(query)
	if expr == "" {
		return nil, nil
	}

	ids, err := searchIndexIDs(expr)
	if err != nil {
		return nil, err
	}

	clips := make([]Clip, 0, len(ids))
	for _, id := range ids {
		if clip, err := getClipByRowID(DB, id); err == nil {
			clips = append(clips, *clip)
		}
	}

	// The index only answers "which rows match"; ordering comes from the row
	// data, matching GetClips.
	sort.SliceStable(clips, func(i, j int) bool {
		if clips[i].Pinned != clips[j].Pinned {
			return clips[i].Pinned
		}
		return clips[i].CreatedAt > clips[j].CreatedAt
	})
	return clips, nil
}
