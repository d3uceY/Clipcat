package semantic

import (
	"context"
	"log"
	"strings"
	"sync"

	"Clipcat/backend/store"
)

// Queue embeds newly-copied text clips in the background. A copy is never
// blocked on the model: Enqueue just drops a job on a buffered channel and a
// single worker goroutine drains it, loading the model lazily on first use.
// Rapid copies coalesce naturally - the worker serializes them and the
// model stays resident after the first embed.

// job is one clip to embed: its clips-table row id and full text.
type job struct {
	clipID  int
	content string
}

// minEmbedLen skips near-empty text (whitespace, a stray char) that carries
// no meaning worth searching for.
const minEmbedLen = 10

// Queue owns the embed worker. Create with NewQueue, Start/Stop it from the
// app lifecycle.
type Queue struct {
	jobs     chan job
	embedder *Embedder

	mu      sync.Mutex
	started bool
	cancel  context.CancelFunc
	wg      sync.WaitGroup
}

// NewQueue returns a stopped Queue for the given model path. The model is
// only loaded on the first processed job.
func NewQueue(modelPath string) *Queue {
	return &Queue{
		jobs:     make(chan job, 256),
		embedder: NewEmbedder(modelPath),
	}
}

// Start launches the worker goroutine. Safe to call once; later calls are
// no-ops.
func (q *Queue) Start() {
	q.mu.Lock()
	defer q.mu.Unlock()
	if q.started {
		return
	}
	ctx, cancel := context.WithCancel(context.Background())
	q.cancel = cancel
	q.started = true
	q.wg.Add(1)
	go q.worker(ctx)
}

// Stop cancels the worker, waits for the in-flight job, and releases the
// model. Safe to call when not running.
func (q *Queue) Stop() {
	q.mu.Lock()
	cancel := q.cancel
	started := q.started
	if started {
		q.started = false
	}
	q.mu.Unlock()

	if !started {
		return
	}
	cancel()
	q.wg.Wait()
	q.embedder.Close()
}

// Enqueue schedules a text clip for embedding. Non-blocking: if the queue is
// full the job is dropped (that clip just isn't meaning-searchable until a
// later copy). Empty / near-empty text is skipped.
func (q *Queue) Enqueue(clipID int, content string) {
	if len(strings.TrimSpace(content)) < minEmbedLen {
		return
	}
	select {
	case q.jobs <- job{clipID: clipID, content: content}:
	default:
	}
}

// Embed embeds a single text through the same lazily-loaded model. Used by
// semantic search to embed the query on demand (the query isn't a stored
// clip, so it never goes through the queue).
func (q *Queue) Embed(text string) ([]float32, error) {
	vec, err := q.embedder.Embed(text)
	// DEBUG (temporary): log the query and its converted vector.
	log.Printf("[semantic] Queue.Embed query=%q -> %v err=%v", text, vecPreview(vec), err)
	return vec, err
}

func (q *Queue) worker(ctx context.Context) {
	defer q.wg.Done()
	for {
		select {
		case j := <-q.jobs:
			q.process(j)
		case <-ctx.Done():
			return
		}
	}
}

// process embeds every chunk of a clip and stores the vectors. Failures
// (missing model, DB error) are silently skipped - the queue must never take
// the app down.
func (q *Queue) process(j job) {
	chunks := chunkText(j.content)
	vecs, err := q.embedder.EmbedBatch(chunks)
	if err != nil {
		return
	}
	_ = store.StoreClipEmbeddings(j.clipID, vecs)
}
