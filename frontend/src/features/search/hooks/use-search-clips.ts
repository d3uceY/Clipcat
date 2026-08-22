import { useState, useEffect, useMemo } from "react"
import type { Clip } from "@/features/clips/types"
import type { FilteredClips } from "@/features/search/types"
import { SearchClips } from "../../../../bindings/Clipcat/app"

const EMPTY: FilteredClips = { pinned: [], recent: [], hiddenPinned: [], hiddenRecent: [] }

// Split a flat clip list into the section buckets the UI renders, applying
// the active label filter. Label filtering stays client-side (labels are in
// the payload); only text search needs the backend.
function splitClips(list: Clip[], activeLabels: string[]): FilteredClips {
    const result: FilteredClips = { pinned: [], recent: [], hiddenPinned: [], hiddenRecent: [] }
    for (const c of list) {
        if (activeLabels.length > 0 && !activeLabels.includes(c.label || "")) continue
        if (c.isPinned) (c.isHidden ? result.hiddenPinned : result.pinned).push(c)
        else (c.isHidden ? result.hiddenRecent : result.recent).push(c)
    }
    return result
}

interface UseSearchClipsOptions {
    clips: { pinned: Clip[]; recent: Clip[] }
    searchQuery: string
    activeLabels: string[]
}

// Backend-powered search. Empty query shows the locally-loaded clips; a
// non-empty (debounced upstream) query calls SearchClips. The result is
// memoized so its identity only changes when the underlying data does
// (keyboard-nav resets selection on filteredClips identity).
export function useSearchClips({ clips, searchQuery, activeLabels }: UseSearchClipsOptions): FilteredClips {
    const query = searchQuery.trim()
    const [remote, setRemote] = useState<Clip[] | null>(null)

    useEffect(() => {
        if (!query) {
            setRemote(null)
            return
        }
        // Drop results from the previous query so the list never shows stale
        // matches while the new search is in flight.
        setRemote(null)
        let cancelled = false
        SearchClips(query)
            .then((res) => { if (!cancelled) setRemote(res ?? []) })
            .catch(() => { if (!cancelled) setRemote([]) })
        return () => { cancelled = true }
    }, [query])

    const local = useMemo(
        () => splitClips([...clips.pinned, ...clips.recent], activeLabels),
        [clips.pinned, clips.recent, activeLabels]
    )
    const remoteResult = useMemo(
        () => (remote === null ? EMPTY : splitClips(remote, activeLabels)),
        [remote, activeLabels]
    )

    return query ? remoteResult : local
}
