import { Pin, Trash2, ShieldCheck } from "lucide-react"
import { useState, memo, useEffect, useRef, useCallback } from "react"
import type { Clip } from '@/features/clips/types'
import { TogglePin, Delete, PasteToWindow, FocusAndPaste, GetClipImage } from "../../../../bindings/Clipcat/app"
import { useClips } from "@/contexts/ClipContext"
import { playSound } from "@/utils/play-sound"

interface ClipListItemProps {
    clip: Clip
    revealed?: boolean
    isSelected?: boolean
    index?: number
    // Stable callbacks from the parent (identity never changes) - index/id are passed
    // as plain values instead of the parent baking a new closure per item per render.
    onSelect?: (index: number) => void
    onPasteReady?: (id: string, fn: () => Promise<void>) => void
}

function ClipListItem({ clip, revealed = false, isSelected = false, index, onSelect, onPasteReady }: ClipListItemProps) {
    const [isDeleted, setIsDeleted] = useState(false)
    const { soundOn, hideContent, unhideClip } = useClips()
    const itemRef = useRef<HTMLDivElement>(null)

    const handlePaste = useCallback(async () => {
        playSound("/sounds/paper-copy.wav", soundOn, 1)
        try {
            if (clip.type === "image") {
                const clipId = Number(clip.id.replace('clip_', ''))
                const b64 = await GetClipImage(clipId)
                const binary = atob(b64)
                const bytes = new Uint8Array(binary.length)
                for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
                const blob = new Blob([bytes], { type: 'image/png' })
                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
                await FocusAndPaste()
            } else {
                if (!clip.content) return
                await PasteToWindow(clip.content)
            }
        } catch (err) {
            console.error("Paste failed:", err)
        }
    }, [clip, soundOn])

    // Register paste callback with parent so Enter key can trigger it
    useEffect(() => {
        onPasteReady?.(clip.id, handlePaste)
    }, [clip.id, handlePaste, onPasteReady])

    // Keep the selected item in view while navigating with arrow keys
    useEffect(() => {
        if (isSelected) itemRef.current?.scrollIntoView({ block: 'nearest' })
    }, [isSelected])

    const handlePin = async (e: React.MouseEvent) => {
        e.stopPropagation()
        const clipId = Number(clip.id.replace('clip_', ''))
        playSound("/sounds/clipboard-slap.mp3", soundOn, 1)
        await TogglePin(clipId).catch((err) => {
            console.error("Failed to toggle pin:", err)
        })
    }

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation()
        const clipId = Number(clip.id.replace('clip_', ''))
        playSound("/sounds/paper-rip.mp3", soundOn, 0.5)
        setIsDeleted(true)
        try {
            await Delete(clipId)
        } catch (err) {
            console.error("Failed to delete clip:", err)
            setIsDeleted(false)
        }
    }

    if (isDeleted) return null

    // Sensitive clip - show a prominent icon-only block in mini/quickpaste mode.
    // Skip this guard when `revealed` is true (user explicitly expanded the sensitive section).
    if (clip.isHidden && !revealed) {
        return (
            <button
                onClick={() => unhideClip(clip.id)}
                className={`hand-drawn lined thin w-full flex items-center justify-center gap-2 p-3 bg-amber-100 border border-amber-400 text-amber-800 hover:bg-green-100 hover:text-green-800 hover:border-green-400 transition-colors cursor-pointer ${clip.isPinned ? "mt-4" : ""}`}
                title="Sensitive clip - click to reveal"
            >
                <ShieldCheck className="h-4 w-4 shrink-0" />
                <span className="text-xs font-medium">sensitive</span>
            </button>
        )
    }

    return (
        <div
            ref={itemRef}
            className={`hand-drawn lined thin p-3 cursor-pointer transition-colors group relative ${clip.isPinned ? "mt-4" : ""} ${
                isSelected
                    ? "bg-amber-200 border-2 border-dashed border-amber-500"
                    : "bg-[#F9F5E6] hover:bg-amber-50 active:bg-amber-100"
            }`}
            onClick={() => { if (index !== undefined) onSelect?.(index); handlePaste() }}
            onMouseEnter={() => { if (index !== undefined) onSelect?.(index) }}
        >
            {/* Pinned indicator */}
            {clip.isPinned && (
                <div className="h-8 -top-4 right-[40%] absolute pointer-events-none">
                    <img src="pin.png" alt="" className="h-full" />
                </div>
            )}

            {/* Content */}
            {clip.type === "image" && clip.image ? (
                <img
                    src={`data:image/png;base64,${clip.image}`}
                    alt="Clip image"
                    className={`w-full object-contain rounded ${hideContent ? "hard-to-read" : ""}`}
                    style={{ maxHeight: 100 }}
                />
            ) : (
                <p className={`text-xs line-clamp-2 wrap-break-word leading-relaxed pr-10 ${hideContent ? "hard-to-read" : ""}`}>
                    {clip.content}
                </p>
            )}

            {/* Actions - shown on hover, top-right */}
            <div
                className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={handlePin}
                    className={`p-1 rounded transition-colors ${
                        clip.isPinned
                            ? "text-yellow-600 hover:text-red-500"
                            : "text-foreground/30 hover:text-yellow-600"
                    }`}
                    title={clip.isPinned ? "Unpin" : "Pin"}
                >
                    <Pin className={`h-3.5 w-3.5 ${clip.isPinned ? "fill-current" : ""}`} />
                </button>
                <button
                    onClick={handleDelete}
                    className="p-1 rounded text-foreground/30 hover:text-red-500 transition-colors"
                    title="Delete"
                >
                    <Trash2 className="h-3.5 w-3.5" />
                </button>
            </div>
        </div>
    )
}

export default memo(ClipListItem, (prev, next) =>
    prev.clip.id === next.clip.id &&
    prev.clip.content === next.clip.content &&
    prev.clip.image === next.clip.image &&
    prev.clip.isPinned === next.clip.isPinned &&
    prev.clip.isHidden === next.clip.isHidden &&
    prev.revealed === next.revealed &&
    prev.isSelected === next.isSelected &&
    prev.index === next.index
)
