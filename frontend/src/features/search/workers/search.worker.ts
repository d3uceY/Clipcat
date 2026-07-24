import type { Clip } from '@/features/clips/types'

interface SearchRequest {
    clips: { pinned: Clip[]; recent: Clip[] }
    searchQuery: string
    activeLabels: string[]
}

export interface FilteredClips {
    pinned: Clip[]
    recent: Clip[]
    hiddenPinned: Clip[]
    hiddenRecent: Clip[]
}

self.onmessage = (e: MessageEvent<SearchRequest>) => {
    const { clips, searchQuery, activeLabels } = e.data
    const query = searchQuery.toLowerCase()

    const matchesLabel = (clip: Clip) =>
        activeLabels.length === 0 || activeLabels.includes(clip.label || '')

    const matchesQuery = (clip: Clip) =>
        !query || (clip.content?.toLowerCase().includes(query) ?? false)

    const result: FilteredClips = {
        pinned: clips.pinned.filter(c => !c.isHidden && matchesLabel(c) && matchesQuery(c)),
        recent: clips.recent.filter(c => !c.isHidden && matchesLabel(c) && matchesQuery(c)),
        hiddenPinned: clips.pinned.filter(c => c.isHidden && matchesLabel(c) && matchesQuery(c)),
        hiddenRecent: clips.recent.filter(c => c.isHidden && matchesLabel(c) && matchesQuery(c)),
    }

    self.postMessage(result)
}
