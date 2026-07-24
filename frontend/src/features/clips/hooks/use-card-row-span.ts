import { useEffect, type RefObject } from "react"

const ROW_HEIGHT = 10 // Must match grid-auto-rows in CSS
const ROW_GAP = 16    // Must match gap in CSS

// ---------------------------------------------------------------------------
// Batched read/write cycle: accumulate all pending elements, then in one rAF
// read all heights first (single forced layout) and write all spans after.
// This eliminates the read-write-read-write layout thrash that happens when
// 500 cards all update in the same frame.
// ---------------------------------------------------------------------------
let batchRafId: number | null = null
const pendingElements = new Set<HTMLElement>()

function scheduleBatchUpdate(el: HTMLElement): void {
    pendingElements.add(el)
    if (batchRafId !== null) return
    batchRafId = requestAnimationFrame(() => {
        batchRafId = null
        // 1. Batch all reads (one forced layout)
        const measurements: [HTMLElement, number][] = []
        for (const el of pendingElements) {
            measurements.push([el, el.getBoundingClientRect().height])
        }
        pendingElements.clear()
        // 2. Batch all writes (no interleaved layouts)
        for (const [el, height] of measurements) {
            const rowSpan = Math.ceil((height + ROW_GAP) / (ROW_HEIGHT + ROW_GAP))
            el.style.setProperty('--row-span', String(rowSpan))
        }
    })
}

// ---------------------------------------------------------------------------
// Initial measurement: all cards that mount within the same 25ms window are
// batched into a single scheduleBatchUpdate call instead of 500 separate ones.
// ---------------------------------------------------------------------------
let initialTimerId: ReturnType<typeof setTimeout> | null = null
const initialQueue: HTMLElement[] = []

function queueInitialMeasure(el: HTMLElement): void {
    initialQueue.push(el)
    if (initialTimerId !== null) return
    initialTimerId = setTimeout(() => {
        initialTimerId = null
        const batch = initialQueue.splice(0)
        for (const el of batch) scheduleBatchUpdate(el)
    }, 25)
}

const sharedObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
        scheduleBatchUpdate(entry.target as HTMLElement)
    }
})

export function useCardRowSpan(ref: RefObject<HTMLElement | null>, isMiniClip: boolean, enabled = true): void {
    useEffect(() => {
        if (!enabled) return
        const el = ref.current
        if (!el) return

        sharedObserver.observe(el)
        queueInitialMeasure(el)

        return () => {
            sharedObserver.unobserve(el)
            pendingElements.delete(el)
            const idx = initialQueue.indexOf(el)
            if (idx !== -1) initialQueue.splice(idx, 1)
        }
    }, [isMiniClip, enabled]) // eslint-disable-line react-hooks/exhaustive-deps
}
