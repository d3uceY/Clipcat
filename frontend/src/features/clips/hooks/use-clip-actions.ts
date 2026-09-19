import { useCallback, useEffect, useRef, useState } from "react"
import type { Clip } from "@/features/clips/types"
import { Delete, FocusAndPaste, GetClipImage, PasteToWindow, TogglePin } from "../../../../bindings/Clipcat/app"
import { copyBase64ImageToClipboard } from "@/features/clips/utils/copy-base64-image"
import { clipId } from "@/features/clips/utils/clip-id"
import { getFullText } from "@/features/clips/utils/get-full-text"
import { useClips } from "@/contexts/ClipContext"
import { playSound } from "@/utils/play-sound"

/**
 * Copy / paste / pin / delete for one clip. Both the full-screen card and the
 * Mini Clip list row drive the same actions, so they live here once.
 *
 * `isDeleted` is true while a delete is in flight (the caller hides the card);
 * callers that want the copied-flash use `copied`.
 */
export function useClipActions(clip: Clip) {
    const { soundOn } = useClips()
    const [isDeleted, setIsDeleted] = useState(false)
    const [copied, setCopied] = useState(false)
    const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        return () => { if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current) }
    }, [])

    /** Copy the clip back to the system clipboard. */
    const copy = useCallback(async () => {
        playSound("/sounds/paper-copy.wav", soundOn, 1)
        try {
            if (clip.type === "image") {
                const imageData = await GetClipImage(clipId(clip.id))
                copyBase64ImageToClipboard(`data:image/png;base64,${imageData}`)
                return
            }
            if (clip.content == null) return
            const full = (await getFullText(clip.id)) ?? clip.content
            await navigator.clipboard.writeText(full)
            setCopied(true)
            if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
            copiedTimerRef.current = setTimeout(() => setCopied(false), 2000)
        } catch (err) { console.error("Failed to copy:", err) }
    }, [clip, soundOn])

    /**
     * Paste the clip into the window that was focused before Clipcat. Images go
     * through the Web Clipboard API (FocusAndPaste), text through the Go side.
     */
    const paste = useCallback(async () => {
        playSound("/sounds/paper-copy.wav", soundOn, 1)
        try {
            if (clip.type === "image") {
                const imageData = await GetClipImage(clipId(clip.id))
                await copyBase64ImageToClipboard(`data:image/png;base64,${imageData}`)
                await FocusAndPaste()
                return
            }
            if (!clip.content) return
            const full = (await getFullText(clip.id)) ?? clip.content
            await PasteToWindow(full)
        } catch (err) {
            console.error("Paste failed:", err)
        }
    }, [clip, soundOn])

    const togglePin = useCallback(async () => {
        playSound("/sounds/clipboard-slap.mp3", soundOn, 1)
        await TogglePin(clipId(clip.id)).catch(err => console.error("Failed to toggle pin:", err))
    }, [clip.id, soundOn])

    const remove = useCallback(async () => {
        playSound("/sounds/paper-rip.mp3", soundOn, 0.5)
        setIsDeleted(true)
        try {
            await Delete(clipId(clip.id))
        } catch (err) {
            console.error("Failed to delete clip:", err)
            setIsDeleted(false)
        }
    }, [clip.id, soundOn])

    return { isDeleted, copied, copy, paste, togglePin, remove }
}
