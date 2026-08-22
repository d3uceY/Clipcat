import type { Clip } from "@/features/clips/types"

export interface FilteredClips {
    pinned: Clip[]
    recent: Clip[]
    hiddenPinned: Clip[]
    hiddenRecent: Clip[]
}
