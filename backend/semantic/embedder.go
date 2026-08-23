package semantic

import (
	"fmt"
	"log"
	"os"
	"runtime"
	"sync"

	llama "github.com/tcpipuk/llama-go"
)

// Embedder lazily loads the llama.go model + context on first use, so the
// heavy GGUF is only read into memory when embedding actually happens. The
// queue drives it from a single worker goroutine, so the mutex only guards
// lazy load + Close, not inference.
type Embedder struct {
	mu         sync.Mutex
	modelPath  string
	model      *llama.Model
	ctx        *llama.Context
	loaded     bool
	loadFailed bool
	loadErr    error

	// inferMu serializes inference. The queue worker embeds clips in the
	// background while a semantic-search call may embed a query on demand;
	// llama.go's Context is not safe for concurrent inference.
	inferMu sync.Mutex
}

// NewEmbedder returns an Embedder that loads modelPath on first embed.
func NewEmbedder(modelPath string) *Embedder {
	return &Embedder{modelPath: modelPath}
}

// ensureLoaded loads the model once. Failures are cached so a missing or
// corrupt model isn't re-attempted on every job (which would stall the queue
// on a slow stat/load per clip).
func (e *Embedder) ensureLoaded() error {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.loaded {
		return nil
	}
	if e.loadFailed {
		return e.loadErr
	}

	if _, err := os.Stat(e.modelPath); err != nil {
		e.loadFailed = true
		e.loadErr = fmt.Errorf("embedding model not found at %q", e.modelPath)
		return e.loadErr
	}

	// CPU-only build (the vendored archives are CPU builds); WithMMap keeps
	// the weights mapped from disk instead of copying them into RAM.
	model, err := llama.LoadModel(e.modelPath, llama.WithGPULayers(0), llama.WithMMap(true))
	if err != nil {
		e.loadFailed = true
		e.loadErr = fmt.Errorf("load embedding model: %w", err)
		return e.loadErr
	}

	// MiniLM-L6 has a 256-token window; the embedder is called per text
	// chunk (see chunk.go), each well under that.
	ctx, err := model.NewContext(
		llama.WithContext(256),
		llama.WithThreads(runtime.NumCPU()),
		llama.WithEmbeddings(), // must be set to get vectors back
	)
	if err != nil {
		_ = model.Close()
		e.loadFailed = true
		e.loadErr = fmt.Errorf("new embedding context: %w", err)
		return e.loadErr
	}

	e.model, e.ctx = model, ctx
	e.loaded = true
	return nil
}

// Embed returns the embedding vector for a single text.
func (e *Embedder) Embed(text string) ([]float32, error) {
	if err := e.ensureLoaded(); err != nil {
		return nil, err
	}
	e.inferMu.Lock()
	defer e.inferMu.Unlock()
	vec, err := e.ctx.GetEmbeddings(text)
	// DEBUG (temporary): log the query and its converted vector.
	log.Printf("[semantic] Embedder.Embed query=%q -> %v err=%v", text, vecPreview(vec), err)
	return vec, err
}

// vecPreview formats a vector for debug logging (dims + first few values) so
// a 384-dim embedding doesn't blow up the log line.
func vecPreview(v []float32) string {
	const n = 8
	if v == nil {
		return "nil"
	}
	if len(v) > n {
		return fmt.Sprintf("%d dims: %v...", len(v), v[:n])
	}
	return fmt.Sprintf("%d dims: %v", len(v), v)
}

// EmbedBatch returns one vector per input text. Used to embed all chunks of
// a clip in one model call. The C++ batch path packs up to n_seq_max texts
// into each llama_decode, which is faster than per-text calls.
func (e *Embedder) EmbedBatch(texts []string) ([][]float32, error) {
	if err := e.ensureLoaded(); err != nil {
		return nil, err
	}
	e.inferMu.Lock()
	defer e.inferMu.Unlock()
	return e.ctx.GetEmbeddingsBatch(texts)
}

// Close releases the model and context. Safe to call after Stop.
func (e *Embedder) Close() {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.ctx != nil {
		_ = e.ctx.Close()
		e.ctx = nil
	}
	if e.model != nil {
		_ = e.model.Close()
		e.model = nil
	}
	e.loaded = false
}
