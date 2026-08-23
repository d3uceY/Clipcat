package semantic

import (
	"strings"
	"testing"
)

func TestChunkTextShort(t *testing.T) {
	s := "hello world"
	got := chunkText(s)
	if len(got) != 1 || got[0] != s {
		t.Fatalf("short text should be one chunk, got %#v", got)
	}
}

func TestChunkTextLong(t *testing.T) {
	s := strings.Repeat("a", 2000)
	got := chunkText(s)
	if len(got) < 3 {
		t.Fatalf("2000 chars should split into several chunks, got %d", len(got))
	}
	if len(got) > maxChunks {
		t.Fatalf("chunk count %d exceeds maxChunks %d", len(got), maxChunks)
	}
	// First chunk starts at the beginning.
	if !strings.HasPrefix(got[0], "a") {
		t.Fatalf("first chunk should start with a")
	}
	// Each chunk is at most chunkSize runes.
	for i, c := range got {
		if len([]rune(c)) > chunkSize {
			t.Fatalf("chunk %d has %d runes, over %d", i, len([]rune(c)), chunkSize)
		}
	}
	// Chunks overlap, so meaning isn't split at boundaries.
	prevEnd := len([]rune(got[0]))
	second := got[1]
	if len(second) < prevEnd-chunkSize {
		t.Fatalf("expected overlap between chunks")
	}
}

func TestChunkTextMultiByte(t *testing.T) {
	// Emoji are multi-byte; chunking must never split mid-rune.
	s := strings.Repeat("😀", 2000)
	for _, c := range chunkText(s) {
		if len([]rune(c)) != len(c)/4 { // each emoji is 4 bytes -> rune count = bytes/4
			t.Fatalf("chunk split mid-rune: %d bytes, %d runes", len(c), len([]rune(c)))
		}
	}
}
