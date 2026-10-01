import { describe, expect, it } from "vitest"
import { splitClips } from "@/features/search/split-clips"
import type { Clip } from "@/features/clips/types"

function clip(id: string, over: Partial<Clip> = {}): Clip {
    return {
        id,
        type: "text",
        content: id,
        label: "",
        isPinned: false,
        isHidden: false,
        createdAt: "2026-10-01 00:00:00",
        ...over,
    }
}

const visiblePinned = clip("vp", { isPinned: true })
const visible = clip("v")
const hidden = clip("h", { isHidden: true })
const hiddenPinned = clip("hp", { isPinned: true, isHidden: true })
const all = [visiblePinned, visible, hidden, hiddenPinned]

describe("splitClips", () => {
    it("lists only visible clips when sensitive mode is off", () => {
        expect(splitClips(all, [], false)).toEqual({
            pinned: [visiblePinned],
            recent: [visible],
            hiddenCount: 2,
        })
    })

    it("lists only hidden clips when sensitive mode is on", () => {
        expect(splitClips(all, [], true)).toEqual({
            pinned: [hiddenPinned],
            recent: [hidden],
            hiddenCount: 2,
        })
    })

    it("counts hidden clips in both modes so the toggle stays reachable", () => {
        expect(splitClips(all, [], false).hiddenCount).toBe(2)
        expect(splitClips(all, [], true).hiddenCount).toBe(2)
    })

    it("preserves input order within each bucket", () => {
        const a = clip("a")
        const b = clip("b")
        const c = clip("c")
        expect(splitClips([c, a, b], [], false).recent.map((x) => x.id)).toEqual(["c", "a", "b"])
    })

    it("applies the label filter to the list and to the hidden count", () => {
        const tagged = clip("t", { label: "work", isHidden: true })
        expect(splitClips([...all, tagged], ["work"], true)).toEqual({
            pinned: [],
            recent: [tagged],
            hiddenCount: 1,
        })
    })
})
