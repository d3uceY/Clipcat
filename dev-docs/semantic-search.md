# Semantic Search (Search by Meaning)

Clipcat's meaning-based search fallback. When a normal text search finds
nothing, Clipcat offers to **search by meaning**: it embeds your query with a
local AI model and returns clips that say the same thing, even with different
words. Everything runs locally — no cloud, no accounts.

## How It Works

Every text clip is embedded in the **background** as you copy it. The vectors
are stored in SQLite. When you search and normal (word-based) search comes up
empty, Clipcat shows an in-app prompt asking if you want to search by
meaning. If you accept, it embeds your query and finds the closest clips.

- **Background embedding** — copies are never blocked on the model. A queue
  worker embeds each new clip off-thread; the model loads lazily on first use.
- **Chunked indexing** — long clips are split into overlapping chunks so each
  stays inside the model's token window, and a query can match one *part* of
  a long clip instead of the whole-clip average.
- **Vector store** — vectors live in a sqlite-vec `vec0` table inside the same
  SQLite database. No CGO needed for this layer (`modernc.org/sqlite/vec`).
- **Relevance threshold** — matches are cosine-distance-ranked; anything past
  ~65% similarity is treated as noise and hidden.

## Architecture

```
copy / edit / LAN-sync text clip
        │
        ▼
 store.indexTextClip(id, content)  ──►  store.SetOnClipIndexed hook
        │                                   │
        │                                   ▼
        │                          semantic.Queue (worker goroutine)
        │                                   │  chunkText()
        │                                   ▼
        │                          Embedder (llama.go → llama.cpp → GGUF)
        │                                   │  []float32 per chunk
        │                                   ▼
        │                          store.StoreClipEmbeddings(id, chunks)
        │                                   │
        └──────────────►  clips_vec (vec0: embedding float[384], clip_id)

  user searches a phrase with no word matches
        │
        ▼
 App.SearchClips returns []  ──►  emits "search:no-results"
        │
        ▼
 frontend useSemanticSearch hook  ──►  in-app "search by meaning?" prompt
        │                                   │  user accepts
        │                                   ▼
        │                          App.SemanticSearch(query)
        │                                   │  embed query (same lazy model)
        │                                   ▼
        │                          store.SemanticSearch (k-NN + dedupe + threshold)
        │                                   ▼
        └──────────────►  "Matched by meaning" results in the UI
```

### Component stack

| Layer            | Technology                                                                  | Purpose                                        |
| ---------------- | --------------------------------------------------------------------------- | ---------------------------------------------- |
| Embedding        | `github.com/tcpipuk/llama-go` → llama.cpp (CGO)                              | Local GGUF inference → `[]float32` vectors     |
| Model            | `all-MiniLM-L6-v2-Q4_K_M.gguf` (384-dim, ~25 MB)                             | Sentence embeddings                            |
| Vector store     | `modernc.org/sqlite/vec` (sqlite-vec v0.1.9, CGO-free)                       | `vec0` k-NN table in the same SQLite database  |
| Embed queue      | `backend/semantic/queue.go` — channel + single worker goroutine              | Off-thread embedding, lazy model load          |
| Retrieval        | `store.SemanticSearch` — cosine k-NN + per-clip dedupe + threshold           | Rank closest clips                             |
| Offer UI         | In-app prompt in `page.tsx` (`useSemanticSearch` sets an `offer` state)      | Ask before spending on the model               |

## Life of a clip (embedding)

1. You copy text. `handleTextClip` → `store.AddClip` inserts the row and calls
   `indexTextClip(id, content)` (the same chokepoint as full-text indexing,
   so manual adds, edits, and LAN-synced clips are all covered).
2. `indexTextClip` fires the `onClipIndexed` hook, which `app.go` filled with
   `queue.Enqueue(id, content)`.
3. The queue worker calls `chunkText` (500-char chunks, 50-char overlap, cap
   20), embeds the batch with `Embedder.EmbedBatch`, and stores the vectors
   with `store.StoreClipEmbeddings` (clears the clip's old rows first).
4. The model is loaded lazily on the first job and stays resident until the
   app quits or the feature is toggled off.

Deleting stays consistent: `DeleteClip` → `removeClipFromIndex` also calls
`DeleteClipEmbeddings`; bulk deletes/pruning call `PruneOrphanedEmbeddings`.
On startup, clips with no embedding yet are **backfilled** in the background.

## Life of a search (retrieval)

1. You type a query. The debounced `SearchClips` runs word-based FTS.
2. If it returns nothing for a real query (and meaning search is on),
   `App.SearchClips` emits `search:no-results` with the query.
3. The frontend `useSemanticSearch` hook (which only fires for the query
   currently on screen, and only one prompt at a time) shows an in-app offer:
   **"No exact matches found. Want me to search by meaning instead?"** with
   **Search by meaning** / **Dismiss** buttons.
4. Only on accept does the frontend call `App.SemanticSearch(query)`. The
   query is embedded through the same lazy model, then `store.SemanticSearch`
   runs a cosine k-NN: fetch the nearest 100 chunk rows, keep the best
   distance per clip, drop anything past `0.35` cosine distance, return the
   top 10 clips.
5. The UI renders them under a **"Matched by meaning"** heading.

> The accept/decline used to live in a backend OS-native dialog. Wails v3's
> Windows MessageBox renders Yes/No and never fires custom button callbacks,
> so the `SemanticSearch` promise hung and "Searching by meaning..." stayed
> stuck on screen. The prompt is now plain React UI so declining (or ignoring
> it) always falls back to the normal empty state.

## Files

| File                                            | Role                                              |
| ----------------------------------------------- | ------------------------------------------------- |
| `backend/store/vec.go`                          | vec0 DDL, float32→BLOB, store/delete/prune, k-NN  |
| `backend/store/search.go`                       | `SetOnClipIndexed` hook + vector delete/prune sync |
| `backend/store/db.go`                           | `_ "modernc.org/sqlite/vec"` + table/settings migrations |
| `backend/store/settings.go`                     | `Get/SetSemanticSearchEnabled`                    |
| `backend/semantic/embedder.go`                  | Lazy llama.go wrapper, serialized inference       |
| `backend/semantic/chunk.go`                     | Overlapping chunker                               |
| `backend/semantic/queue.go`                     | Background worker queue                          |
| `app.go`                                        | Queue lifecycle, `search:no-results`, `SemanticSearch`, toggle binding |
| `frontend/src/features/search/hooks/use-semantic-search.ts` | Event listener → binding call, result state |
| `frontend/src/features/app-shell/components/page.tsx` | Renders "Matched by meaning" section       |
| `frontend/src/features/settings/components/settings-panel.tsx` | "Search by Meaning" toggle        |
| `third_party/llama-go/`                         | Vendored llama-go + prebuilt Windows static libs  |

## Settings

- **Search by Meaning** toggle (Settings → Window tab). Off = no embedding,
  no model in memory, no offer prompt. Toggling it starts/stops the queue.
- The feature is **on by default**.

## Model path

The model path defaults to a hardcoded dev path and can be overridden with the
`CLIPCAT_EMBED_MODEL` environment variable (useful on other OSes / machines).
Shipping the model with the app is future work.

## Cross-platform build

The Go + sqlite-vec layers are pure Go. llama.cpp is CGO and the static
archives in `third_party/llama-go/` are **platform-specific** (Windows
MinGW-built archives are committed here):

- **Windows** — build with MinGW-w64 on `PATH` and
  `LIBRARY_PATH` / `C_INCLUDE_PATH` pointing at `third_party/llama-go`.
  Ship the 5 MinGW runtime DLLs beside the exe (`libdl.dll`, `libgcc_s_seh-1.dll`,
  `libgomp-1.dll`, `libstdc++-6.dll`, `libwinpthread-1.dll`).
- **Linux** — gcc + CMake rebuild of the archives (see
  `third_party/README.md`).
- **macOS** — clang/Xcode + CMake rebuild (darwin LDFLAGS in
  `linkage_static.go`).

## Verification

- `go test ./backend/store/... ./backend/semantic/...` — serializer, vec
  store/query/delete, dedupe, threshold, chunker.
- `go test ./backend/semantic -run TestEmbedRealModel -v` — loads the real
  GGUF, asserts 384-dim vectors and that similar sentences score higher than
  unrelated ones (`similar ≈ 0.75, unrelated ≈ 0.04`). Skips when the model
  file isn't present.
- Manual: copy text → a `clips_vec` row appears → search a synonym that
  doesn't textually match → in-app offer → "Search by meaning" → results.
