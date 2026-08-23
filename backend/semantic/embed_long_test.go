package semantic

import (
	"os"
	"strings"
	"testing"
)

// TestEmbedBatchLongText is a regression test for two crashes that a single
// text longer than the model's per-sequence window (n_batch = n_ctx_seq =
// 256 here) used to trigger in the llama-go binding (wrapper.cpp):
//
//  1. "llama_batch size exceeded" - GetEmbeddingsBatch packed every text into
//     a single llama_batch with capacity n_batch, so a text longer than that
//     overflowed the batch and aborted in common.cpp:common_batch_add.
//  2. "GGML_ASSERT(i01 >= 0 && i01 < ne01)" - the chunked decode kept
//     absolute positions (i+j) across chunks, running past the model's
//     position tables in ggml get_rows.
//
// Both paths (single GetEmbeddings and GetEmbeddingsBatch) now sub-chunk
// oversized texts with positions restarting at 0 and KV cleared per chunk, so
// a >n_batch text must embed without crashing. Skipped when the model isn't
// present.
func TestEmbedBatchLongText(t *testing.T) {
	path := testModelPath()
	if _, err := os.Stat(path); err != nil {
		t.Skipf("model not present: %v", err)
	}

	e := NewEmbedder(path)
	t.Cleanup(e.Close)

	// ~3000 words >> n_batch (256 tokens), the case that used to abort.
	long := strings.Repeat(
		"the quick brown fox jumps over the lazy dog and keeps running through the green meadow. ",
		150,
	)

	// Clipcat path: EmbedBatch loops GetEmbeddings.
	vecs, err := e.EmbedBatch([]string{long, "hello world", long})
	if err != nil {
		t.Fatalf("EmbedBatch with long text: %v", err)
	}
	if len(vecs) != 3 {
		t.Fatalf("got %d vectors, want 3", len(vecs))
	}
	for i, v := range vecs {
		if len(v) != 384 {
			t.Fatalf("vec %d dim = %d, want 384", i, len(v))
		}
	}

	// Binding path: GetEmbeddingsBatch with a single > n_batch text (the
	// exact call that used to abort in common_batch_add).
	batch, err := e.ctx.GetEmbeddingsBatch([]string{long})
	if err != nil {
		t.Fatalf("GetEmbeddingsBatch with long text: %v", err)
	}
	if len(batch) != 1 || len(batch[0]) != 384 {
		t.Fatalf("batch long vec = %d dims (n=%d), want 1 x 384", len(batch[0]), len(batch))
	}
}
