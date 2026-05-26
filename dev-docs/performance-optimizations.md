# Clipcat — Performance Optimizations

All changes were made to address three user-reported problems:

1. **Card overlap on initial render** — masonry grid items stacking on top of each other at startup
2. **High memory / CPU with many clips** — app became sluggish with 500–5 000 clips loaded
3. **Scroll jitter** — grid layout jumping as cards entered the viewport

A second batch of backend/runtime optimizations was added to keep clipboard operations cheap with encryption enabled and to keep image-heavy lists from pushing large payloads across the Go ↔ frontend bridge.

---

## Table of Contents

1. [Shared ResizeObserver](#1-shared-resizeobserver)
2. [Batched Read/Write Layout Cycle](#2-batched-readwrite-layout-cycle)
3. [Batched Initial Measurements](#3-batched-initial-measurements)
4. [Fix: `transition: all` Animating the Grid](#4-fix-transition-all-animating-the-grid)
5. [CSS Default Row-Span Fallback](#5-css-default-row-span-fallback)
6. [Global Pub-Sub Timer for Relative Time](#6-global-pub-sub-timer-for-relative-time)
7. [IntersectionObserver Virtualization](#7-intersectionobserver-virtualization)
8. [Lazy Dialog Mount](#8-lazy-dialog-mount)
9. [`useMemo` for Link Parsing](#9-usememo-for-link-parsing)
10. [`React.memo` with Content-Aware Comparator](#10-reactmemo-with-content-aware-comparator)
11. [Fix: Observer Disabled on Invisible Cards](#11-fix-observer-disabled-on-invisible-cards)
12. [Test Utility: `SeedTestClips`](#12-test-utility-seedtestclips)
13. [Prune Only When Over the Limit](#13-prune-only-when-over-the-limit)
14. [Thumbnailed Image Lists + Full Image On Demand](#14-thumbnailed-image-lists--full-image-on-demand)
15. [Cached AES Cipher Block](#15-cached-aes-cipher-block)
16. [Single SQLite Connection](#16-single-sqlite-connection)
17. [Lazy Sound Loading](#17-lazy-sound-loading)
18. [Reused GSAP Timeline](#18-reused-gsap-timeline)

---

## 1. Shared ResizeObserver

**File:** [frontend/src/hooks/use-card-row-span.ts](../frontend/src/hooks/use-card-row-span.ts)

### Problem

Every `ClipCard` created its own `ResizeObserver` instance. With 500 cards that is 500 live observer objects watching 500 elements simultaneously, each running its own callback independently.

### Fix

A single `ResizeObserver` instance is created once at module level and shared by every card in the app. Cards subscribe/unsubscribe by calling `sharedObserver.observe(el)` and `sharedObserver.unobserve(el)`.

```ts
// One observer for ALL cards — created once when the module loads
const sharedObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    scheduleBatchUpdate(entry.target as HTMLElement);
  }
});
```

### Impact

- Observer count drops from **N observers** (one per card) to **1 observer** total
- Significantly lowers memory baseline when many clips are loaded

---

## 2. Batched Read/Write Layout Cycle

**File:** [frontend/src/hooks/use-card-row-span.ts](../frontend/src/hooks/use-card-row-span.ts)

### Problem

When the ResizeObserver fired for multiple cards in the same frame (e.g. all 500 on initial load), each card would:

1. Read its height → `getBoundingClientRect()` (forces a layout)
2. Write `--row-span` → `setProperty()` (invalidates layout)
3. Next card reads height → forces layout again

This read-write-read-write interleaving is called **layout thrashing** and caused the browser to recalculate layout hundreds of times per frame.

### Fix

All elements that need updating are accumulated in a `Set`. A single `requestAnimationFrame` then processes them all — reading every height first, then writing every span after.

```ts
const pendingElements = new Set<HTMLElement>();
let batchRafId: number | null = null;

function scheduleBatchUpdate(el: HTMLElement): void {
  pendingElements.add(el);
  if (batchRafId !== null) return; // already scheduled
  batchRafId = requestAnimationFrame(() => {
    batchRafId = null;
    // PHASE 1 — all reads (one forced layout)
    const measurements: [HTMLElement, number][] = [];
    for (const el of pendingElements) {
      measurements.push([el, el.getBoundingClientRect().height]);
    }
    pendingElements.clear();
    // PHASE 2 — all writes (no interleaved layouts)
    for (const [el, height] of measurements) {
      const rowSpan = Math.ceil((height + ROW_GAP) / (ROW_HEIGHT + ROW_GAP));
      el.style.setProperty("--row-span", String(rowSpan));
    }
  });
}
```

### Impact

- Reduces browser layout recalculations from **N per frame** to **1 per frame**
- Eliminates the card overlap that appeared on initial render

---

## 3. Batched Initial Measurements

**File:** [frontend/src/hooks/use-card-row-span.ts](../frontend/src/hooks/use-card-row-span.ts)

### Problem

Each card called `scheduleBatchUpdate` independently on mount. With 500 cards mounting in the same React commit, this still caused multiple separate rAF callbacks instead of one.

### Fix

Cards that mount within the same 25ms window are queued together and flushed in a single batch.

```ts
let initialTimerId: ReturnType<typeof setTimeout> | null = null;
const initialQueue: HTMLElement[] = [];

function queueInitialMeasure(el: HTMLElement): void {
  initialQueue.push(el);
  if (initialTimerId !== null) return; // timer already running
  initialTimerId = setTimeout(() => {
    initialTimerId = null;
    const batch = initialQueue.splice(0);
    for (const el of batch) scheduleBatchUpdate(el);
  }, 25);
}
```

### Impact

- All startup measurements are handled in one batch instead of one timer per card
- Works together with fix #2 to eliminate the card overlap on first load

---

## 4. Fix: `transition: all` Animating the Grid

**File:** [frontend/src/index.css](../frontend/src/index.css)

### Problem

`.hand-drawn` had `transition: all 0.5s ease`. When the masonry hook updated `--row-span` (which drives `grid-row: span N`), the browser tried to animate the `grid-row` change across 500ms. This turned every span update into a long animation, causing a visible cascade of layout reflows as all cards animated simultaneously.

### Fix

Replace the blanket `transition: all` with only what actually needs to animate.

```css
/* Before */
.hand-drawn {
  transition: all 0.5s ease;
}

/* After */
.hand-drawn {
  transition: box-shadow 0.5s ease;
}
```

The same change was applied to `.hand-drawn-btn`.

### Impact

- Eliminates the 500ms layout storm on startup
- Cards snap to their correct positions immediately instead of animating there

---

## 5. CSS Default Row-Span Fallback

**File:** [frontend/src/index.css](../frontend/src/index.css)

### Problem

The CSS fallback for `--row-span` was `auto`, which makes `grid-row: span auto` — treated as `span 1` by the browser (a single 10px row). Before JavaScript measured a card, it rendered at 10px tall, causing visible card overlap.

### Fix

```css
/* Before */
.free-form-grid-container > * {
  grid-row: span var(--row-span, auto);
}

/* After */
.free-form-grid-container > * {
  grid-row: span var(--row-span, 10); /* 10 ≈ 244px, a reasonable card height */
}
```

### Impact

- Cards that haven't been measured yet occupy a sensible default height instead of collapsing to 10px
- Reduces the visual jump when measurements arrive

---

## 6. Global Pub-Sub Timer for Relative Time

**File:** [frontend/src/hooks/use-relative-time.ts](../frontend/src/hooks/use-relative-time.ts)

### Problem

`useRelativeTime` called `setInterval` inside every `ClipCard`. With 5 000 clips loaded, there were **5 000 live `setInterval` timers** firing every 60 seconds, each triggering its own state update and re-render cascade.

### Fix

A single global interval serves all cards via a pub-sub pattern. Cards subscribe on mount and unsubscribe on unmount. The interval is only created when the first subscriber registers and is cleared when the last one unsubscribes.

```ts
type TickSubscriber = () => void;
const subscribers = new Set<TickSubscriber>();
let globalTimer: ReturnType<typeof setInterval> | null = null;

function subscribeToMinuteTick(fn: TickSubscriber): () => void {
  subscribers.add(fn);
  if (globalTimer === null) {
    globalTimer = setInterval(() => {
      subscribers.forEach((sub) => sub());
    }, 60_000);
  }
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0 && globalTimer !== null) {
      clearInterval(globalTimer);
      globalTimer = null;
    }
  };
}
```

### Impact

- Timer count drops from **N timers** (one per card) to **1 timer** total
- Memory and CPU usage scales flat regardless of how many clips are loaded

---

## 7. IntersectionObserver Virtualization

**Files:**

- [frontend/src/components/clip-card.tsx](../frontend/src/components/clip-card.tsx)
- [frontend/src/components/page.tsx](../frontend/src/components/page.tsx)

### Problem

With 5 000 clips, React rendered **100 000+ DOM nodes** immediately on load — every card, button, icon, and dialog fully materialized even if 95% of cards were off-screen and invisible to the user.

### Fix — `page.tsx`

Cards beyond index 25 in each section start as invisible placeholders:

```tsx
{
  filteredClips.recent.map((clip, i) => (
    <ClipCard
      key={clip.id}
      clip={clip}
      type="recent"
      initialVisible={i < 25} // only first 25 render fully at startup
    />
  ));
}
```

### Fix — `clip-card.tsx`

Each card sets up an `IntersectionObserver` (with a 500px root margin so measurement happens well before the card enters view) and flips between full content and a lightweight placeholder div:

```tsx
const [isVisible, setIsVisible] = useState(initialVisible);

useEffect(() => {
  const el = cardRef.current;
  if (!el) return;
  let observer: IntersectionObserver | null = null;
  // 150ms delay so startup batch measurements complete first
  const timerId = setTimeout(() => {
    observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) {
          // Cache row span before going invisible
          const span = parseInt(el.style.getPropertyValue("--row-span"));
          if (span > 0) cachedRowSpanRef.current = span;
        }
        setIsVisible(entry.isIntersecting);
      },
      { rootMargin: "500px" },
    );
    observer.observe(el);
  }, 150);
  return () => {
    clearTimeout(timerId);
    observer?.disconnect();
  };
}, []);

// Off-screen card: bare div placeholder, no React subtree
if (!isVisible) {
  return <div id={tourId} ref={cardRef} />;
}

// On-screen card: full content
return (
  <div ref={cardRef} className="hand-drawn ...">
    {/* full card UI */}
  </div>
);
```

### Impact

- DOM node count reduced from **~100 000** (5 000 clips) to **~2 500** at startup
- Initial render time and memory usage drop significantly
- Off-screen cards occupy near-zero memory (a single `<div>`)

---

## 8. Lazy Dialog Mount

**File:** [frontend/src/components/clip-card.tsx](../frontend/src/components/clip-card.tsx)

### Problem

The `<Dialog>` component (for viewing full clip content) was always present in the React tree for every card, even when closed. With 5 000 clips that is 5 000 Dialog subtrees existing in memory at all times.

### Fix

Conditionally mount the Dialog only when it is actually open:

```tsx
// Before
<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
  ...
</Dialog>;

// After
{
  dialogOpen && (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      ...
    </Dialog>
  );
}
```

### Impact

- Dialog subtrees only exist while a dialog is open (at most 1 at a time)
- Removes thousands of React elements from memory when many clips are loaded

---

## 9. `useMemo` for Link Parsing

**File:** [frontend/src/components/clip-card.tsx](../frontend/src/components/clip-card.tsx)

### Problem

`insertLinks(clip.content)` — which parses text and wraps URLs in anchor tags — was called on every render of every card, including re-renders triggered by unrelated state changes (copy button hover, context updates, etc.).

### Fix

```tsx
// Before
<p dangerouslySetInnerHTML={{ __html: insertLinks(clip.content) }} />

// After
const linkedContent = useMemo(() => insertLinks(clip.content), [clip.content])

<p dangerouslySetInnerHTML={{ __html: linkedContent }} />
```

### Impact

- `insertLinks` only runs when `clip.content` actually changes, not on every render
- Reduces wasted CPU on string/regex processing during scroll and interaction events

---

## 10. `React.memo` with Content-Aware Comparator

**File:** [frontend/src/components/clip-card.tsx](../frontend/src/components/clip-card.tsx)

### Problem

`ClipCard` re-rendered whenever the parent (`page.tsx`) re-rendered, even if the clip data it received had not changed. Since `getClips()` creates a new array on every call, all cards would re-render even when only one clip changed.

### Fix

Wrap the component in `React.memo` with a custom comparator that only triggers a re-render when relevant clip fields actually change:

```tsx
export default memo(
  ClipCard,
  (prev, next) =>
    prev.clip.id === next.clip.id &&
    prev.clip.content === next.clip.content &&
    prev.clip.image === next.clip.image &&
    prev.clip.isPinned === next.clip.isPinned &&
    prev.type === next.type &&
    prev.tourId === next.tourId &&
    prev.initialVisible === next.initialVisible,
);
```

### Impact

- Cards skip re-rendering unless their own data changes
- Reduces unnecessary React reconciliation work during copy/pin/delete operations

---

## 11. Fix: Observer Disabled on Invisible Cards

**Files:**

- [frontend/src/hooks/use-card-row-span.ts](../frontend/src/hooks/use-card-row-span.ts)
- [frontend/src/components/clip-card.tsx](../frontend/src/components/clip-card.tsx)

### Problem

After virtualization (#7) was added, the `useCardRowSpan` hook was still observing invisible placeholder `<div>`s. A placeholder has zero height, so the observer would set `--row-span = 1` on it. When the card became visible, the CSS custom property was already `1`, so the card would briefly render at 10px tall before the observer could re-measure the full content. This caused a visible **layout jump (jitter)** each time a card entered the viewport.

### Fix — `use-card-row-span.ts`

Added an `enabled` parameter. When `false`, the effect exits early and the observer never attaches to the placeholder element.

```ts
export function useCardRowSpan(
  ref: RefObject<HTMLElement | null>,
  isMiniClip: boolean,
  enabled = true, // NEW
): void {
  useEffect(() => {
    if (!enabled) return; // skip when card is a placeholder
    const el = ref.current;
    if (!el) return;
    sharedObserver.observe(el);
    queueInitialMeasure(el);
    return () => {
      sharedObserver.unobserve(el);
      pendingElements.delete(el);
    };
  }, [isMiniClip, enabled]);
}
```

### Fix — `clip-card.tsx`

Pass `isVisible` as the `enabled` argument:

```tsx
useCardRowSpan(cardRef, isMiniClip, isVisible);
```

The placeholder `<div>` also has no inline style — it relies entirely on the CSS custom property:

```tsx
// Placeholder: CSS --row-span holds the last measured value (or defaults to 10)
if (!isVisible) {
  return <div id={tourId} ref={cardRef} />;
}
```

### How It Works Together

| State                       | `--row-span` value used                                | Result                                          |
| --------------------------- | ------------------------------------------------------ | ----------------------------------------------- |
| Card never seen before      | CSS fallback `10` (≈ 244px)                            | Reasonable placeholder height                   |
| Card was seen, scrolled out | Last measured value (preserved on DOM node)            | Correct height maintained                       |
| Card becomes visible        | Observer fires from 500px away before card enters view | Card is already correctly sized when it appears |

### Impact

- Eliminates the grid jitter / layout jump when scrolling through many clips
- Placeholder cells hold their correct size without any JavaScript running on them

---

## 12. Test Utility: `SeedTestClips`

**Files:**

- [backend/store/clips.go](../backend/store/clips.go) — function definition
- [app.go](../app.go) — commented-out call site

### Purpose

A Go function for inserting large batches of test clips to reproduce and measure performance problems. Uses a SQL transaction for bulk insert performance.

```go
// clips.go
func SeedTestClips(n int) error {
    // 6 content patterns: short text, medium text, long text, code, URL, multiline
    tx, _ := DB.Begin()
    stmt, _ := tx.Prepare(`INSERT INTO clips (content, content_hash, type, pinned, encrypted, created_at)
        VALUES (?, ?, 'text', 0, 1, datetime('now', ?))`)
    for i := 0; i < n; i++ {
        content := fmt.Sprintf(samples[i%len(samples)], i+1)
        enc, _ := encryptText(content)
        hash := hashContent([]byte(content))
        offset := fmt.Sprintf("-%d seconds", i)
        stmt.Exec(enc, hash, offset)
    }
    return tx.Commit()
}
```

```go
// app.go — startup, keep COMMENTED OUT for production builds
// SeedTestClips(500) // PERF TEST: uncomment to insert 500 test clips on startup
```

> **Warning:** Do not uncomment `SeedTestClips` in production builds. It inserts directly into the live database on every app startup.

---

## 13. Prune Only When Over the Limit

**File:** [backend/store/clips.go](../backend/store/clips.go)

### Problem

Every clip insert used to run a `DELETE ... NOT IN (SELECT ... ORDER BY ... LIMIT ?)` query immediately after the insert. That meant every clipboard copy paid for a sort over the whole table, even when the user was still far under the configured storage limit.

### Fix

Clip pruning was moved into a shared helper that first checks the current row count. If the table is not over the limit, it returns immediately. Only when the table is actually too large does it delete exactly the `count - limit` oldest rows.

```go
func pruneExcessClips() error {
    limit, err := GetStorageLimit()
    if err != nil {
        return err
    }

    var count int
    if err := DB.QueryRow(`SELECT COUNT(*) FROM clips`).Scan(&count); err != nil {
        return err
    }
    if count <= limit {
        return nil
    }

    excess := count - limit
    _, err = DB.Exec(`
        DELETE FROM clips
        WHERE id IN (
            SELECT id FROM clips
            ORDER BY pinned ASC, created_at ASC
            LIMIT ?
        )
    `, excess)
    return err
}
```

### Impact

- The common case is now a cheap `COUNT(*)` instead of a full prune query
- Clipboard writes stay cheap while the table is under the configured cap

---

## 14. Thumbnailed Image Lists + Full Image On Demand

**Files:**

- [backend/store/clips.go](../backend/store/clips.go)
- [frontend/src/components/clip-card.tsx](../frontend/src/components/clip-card.tsx)

### Problem

`GetClips()` used to return full image payloads for every image clip. With 100 copied images, the app had to decrypt and base64-encode every full-size image, push that data over the Wails bridge, and keep it alive in React/browser memory.

### Fix

When a new image clip is inserted, the backend creates and stores a small thumbnail in the database. `GetClips()` serves that thumbnail for the list view, while the full image is only fetched through `GetClipImage()` when the detail dialog opens or when the user copies the image back to the clipboard.

The serving path also normalizes images to PNG so the frontend can keep using a single `data:image/png;base64,...` path consistently.

```go
// Insert path
thumb, err := generateThumbnail(img)
if len(thumb) > 0 {
    encThumb, _ = encryptData(thumb)
}

// List path
if normalized, err := normalizeImageToPNG(thumbBytes); err == nil {
    thumbBytes = normalized
}

// Full image path
if normalized, err := normalizeImageToPNG(image); err == nil {
    image = normalized
}
```

### Impact

- Large image sets no longer force full-resolution payloads through `GetClips()`
- Browser memory and Go ↔ frontend bridge traffic drop significantly for image-heavy clip histories
- Full-quality copy/view behavior is preserved by fetching the full image only when needed

---

## 15. Cached AES Cipher Block

**File:** [backend/store/encrypt.go](../backend/store/encrypt.go)

### Problem

`aes.NewCipher(encKey)` was being called on every encrypt/decrypt operation. That repeatedly rebuilds the AES key schedule even though the key never changes during the process lifetime.

### Fix

The AES block is created once during `InitEncryption()` and cached in a package-level `encBlock` variable. `encryptData()` and `decryptData()` now build a `cipher.GCM` from that cached block instead of recreating the AES block every time.

```go
var encBlock cipher.Block

func InitEncryption() error {
    key, err := getOrCreateEncryptionKey()
    if err != nil {
        return err
    }
    encKey = key
    encBlock, err = aes.NewCipher(encKey)
    return err
}
```

### Impact

- Lowers per-clip CPU overhead for encrypt/decrypt operations
- Helps bulk operations like image inserts and migration passes scale more cleanly

---

## 16. Single SQLite Connection

**File:** [backend/store/db.go](../backend/store/db.go)

### Problem

The default `database/sql` pool can open multiple connections. For SQLite, that usually does not help throughput because it is still a single-writer database, and it can increase memory footprint or lock contention.

### Fix

The DB initialization now pins the pool to a single open/idle connection:

```go
DB.SetMaxOpenConns(1)
DB.SetMaxIdleConns(1)
```

### Impact

- Keeps SQLite usage aligned with its real concurrency model
- Slightly lowers memory use and reduces the chance of avoidable connection churn

---

## 17. Lazy Sound Loading

**File:** [frontend/src/helpers/playSound.ts](../frontend/src/helpers/playSound.ts)

### Problem

The app originally preloaded all sound effects during startup. That front-loaded decode work and kept sounds in memory even if the user never triggered most of them.

### Fix

The sound cache was kept, but eager preloading was removed. Sounds are now created lazily on first use and then reused from the cache afterward.

```ts
const soundCache = new Map<string, Howl>();

export function preloadSounds() {
  // Intentionally empty — keep the API, skip eager load
}

export function playSound(soundSrc: string, soundOn = true, volume = 0.1) {
  let sound = soundCache.get(soundSrc);
  if (!sound) {
    sound = new Howl({ src: [soundSrc], volume });
    soundCache.set(soundSrc, sound);
  }
  sound.play();
}
```

### Impact

- Startup does less work
- Sound memory use grows only for sounds the user actually triggers

---

## 18. Reused GSAP Timeline

**File:** [frontend/src/components/window-controls.tsx](../frontend/src/components/window-controls.tsx)

### Problem

The settings UI created a new `gsap.timeline()` object on every render. That is not catastrophic, but it is wasted allocation and can leave tween state hanging around longer than necessary.

### Fix

The timeline now lives in a ref and is cleared/reused whenever the settings panel is opened or closed.

```tsx
const tlRef = useRef(gsap.timeline())

const handleSettingsClick = () => {
    const tl = tlRef.current
    tl.clear()
    ...
}
```

### Impact

- Fewer timeline allocations during normal UI interaction
- Keeps the settings animation path cheaper and more predictable

---

## Summary Table

| #   | Optimization                                   | File(s)                                       | Problem Solved                              |
| --- | ---------------------------------------------- | --------------------------------------------- | ------------------------------------------- |
| 1   | Shared ResizeObserver                          | `use-card-row-span.ts`                        | N observer instances → 1                    |
| 2   | Batched read/write rAF                         | `use-card-row-span.ts`                        | Layout thrashing on startup                 |
| 3   | Batched initial measurements                   | `use-card-row-span.ts`                        | Card overlap on first render                |
| 4   | `transition: all` → `transition: box-shadow`   | `index.css`                                   | Grid animation storm on startup             |
| 5   | CSS row-span fallback `auto` → `10`            | `index.css`                                   | Cards collapsing to 10px before measurement |
| 6   | Global pub-sub interval                        | `use-relative-time.ts`                        | N setInterval timers → 1                    |
| 7   | IntersectionObserver virtualization            | `clip-card.tsx`, `page.tsx`                   | 100k+ DOM nodes with many clips             |
| 8   | Lazy Dialog mount                              | `clip-card.tsx`                               | N Dialog trees in memory when closed        |
| 9   | `useMemo` for `insertLinks`                    | `clip-card.tsx`                               | Regex re-runs on every render               |
| 10  | `React.memo` with comparator                   | `clip-card.tsx`                               | All cards re-render on any state change     |
| 11  | Observer disabled on invisible cards           | `use-card-row-span.ts`, `clip-card.tsx`       | Scroll jitter / layout jump                 |
| 12  | `SeedTestClips` test utility                   | `clips.go`, `app.go`                          | Testing tool only                           |
| 13  | Prune only when over the limit                 | `backend/store/clips.go`                      | Avoid sort/delete work on every insert      |
| 14  | Thumbnailed image lists + full image on demand | `backend/store/clips.go`, `clip-card.tsx`     | Large image payloads in list view           |
| 15  | Cached AES cipher block                        | `backend/store/encrypt.go`                    | Rebuilding AES state on every crypto op     |
| 16  | Single SQLite connection                       | `backend/store/db.go`                         | Extra connection overhead / SQLite churn    |
| 17  | Lazy sound loading                             | `frontend/src/helpers/playSound.ts`           | Eager sound decode + startup memory         |
| 18  | Reused GSAP timeline                           | `frontend/src/components/window-controls.tsx` | Repeated timeline allocation                |
