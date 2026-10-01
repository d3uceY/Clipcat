import { useState, useEffect, useMemo } from "react"
import type { Clip } from "@/features/clips/types"
import type { FilteredClips } from "@/features/search/types"
import { splitClips } from "@/features/search/split-clips"
import { SearchClips } from "../../../../bindings/Clipcat/app"

interface UseSearchClipsOptions {
    clips: { pinned: Clip[]; recent: Clip[] }
    searchQuery: string
    activeLabels: string[]
    showSensitive: boolean
}

// Backend-powered search. Empty query shows the locally-loaded clips; a
// non-empty (debounced upstream) query calls SearchClips. The result is
// memoized so its identity only changes when the underlying data does
// (keyboard-nav resets selection on filteredClips identity).
export function useSearchClips({ clips, searchQuery, activeLabels, showSensitive }: UseSearchClipsOptions): FilteredClips {
    const query = searchQuery.trim()
    // Last search results. We deliberately do NOT clear this while a new search
    // is in flight: blanking the list on every query change made the page flash
    // to the empty state between the request and the backend response. Keeping
    // the previous results on screen (swapped in place when the fresh ones
    // arrive) is what removes the flicker.
    const [remote, setRemote] = useState<Clip[] | null>(null)

    useEffect(() => {
        if (!query) {
            setRemote(null)
            return
        }
        let cancelled = false
        SearchClips(query)
            .then((res) => { if (!cancelled) setRemote(res ?? []) })
            .catch(() => { if (!cancelled) setRemote([]) })
        return () => { cancelled = true }
    }, [query])

    const allClips = useMemo(() => [...clips.pinned, ...clips.recent], [clips.pinned, clips.recent])
    const local = useMemo(() => splitClips(allClips, activeLabels, showSensitive), [allClips, activeLabels, showSensitive])
    // While a search is in flight, keep whatever results were last on screen
    // instead of flashing the list empty. On the very first query `remote` is
    // still null, so fall back to the full locally-loaded list. When the
    // backend response lands this re-runs and the rows swap in place (items
    // are memoized by stable id, so unchanged rows don't re-render).
    const remoteResult = useMemo(
        () => splitClips(remote ?? allClips, activeLabels, showSensitive),
        [remote, allClips, activeLabels, showSensitive]
    )

    return query ? remoteResult : local
}
