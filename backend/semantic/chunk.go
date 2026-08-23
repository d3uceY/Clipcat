package semantic

// Text chunking for embedding.
//
// MiniLM-L6 has a 256-token window (~1000 chars, roughly a quarter of that
// in meaningful tokens). Long pastes would silently truncate inside the
// model, so clips over chunkSize runes are split into overlapping chunks and
// each chunk is embedded + stored as its own vector row pointing back at the
// clip. A small overlap keeps a sentence that straddles a boundary from
// losing meaning on both sides.

const (
	chunkSize    = 500 // runes per chunk - safely inside the 256-token window
	chunkOverlap = 50  // runes carried into the next chunk
	maxChunks    = 20  // cap pathological pastes so a single clip can't flood the table
)

// chunkText splits s into overlapping chunks. Short text returns a single
// chunk unchanged.
func chunkText(s string) []string {
	r := []rune(s)
	if len(r) <= chunkSize {
		return []string{s}
	}

	chunks := make([]string, 0, 4)
	start := 0
	for start < len(r) && len(chunks) < maxChunks {
		end := start + chunkSize
		if end > len(r) {
			end = len(r)
		}
		chunks = append(chunks, string(r[start:end]))
		if end == len(r) {
			break
		}
		start = end - chunkOverlap
	}
	return chunks
}
