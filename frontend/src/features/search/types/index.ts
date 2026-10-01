import type { Clip } from "@/features/clips/types"

export interface FilteredClips {
    pinned: Clip[]
    recent: Clip[]
    // Every hidden clip, regardless of the active mode - drives the count on
    // the Sensitive toggle (which must stay reachable while the mode is on).
    hiddenCount: number
}
