import type { Clip } from "@/features/clips/types"
import type { FilteredClips } from "@/features/search/types"

// Split a flat clip list into the section buckets the UI renders, applying
// the active label filter. Label filtering stays client-side (labels are in
// the payload); only text search needs the backend.
//
// showSensitive selects the mode, not an overlay: on it lists only hidden
// clips, off it lists only visible ones. hiddenCount always counts the hidden
// clips that pass the label filter, in either mode, so the toggle stays
// reachable while the mode is on.
export function splitClips(list: Clip[], activeLabels: string[], showSensitive: boolean): FilteredClips {
    const result: FilteredClips = { pinned: [], recent: [], hiddenCount: 0 }
    for (const c of list) {
        if (activeLabels.length > 0 && !activeLabels.includes(c.label || "")) continue
        if (c.isHidden) result.hiddenCount++
        if (c.isHidden !== showSensitive) continue
        if (c.isPinned) result.pinned.push(c)
        else result.recent.push(c)
    }
    return result
}
