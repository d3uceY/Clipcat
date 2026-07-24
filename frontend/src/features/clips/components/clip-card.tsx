import { useState, useRef, useMemo, memo, useEffect, lazy, Suspense } from "react"
import { Tag, Copy, Pin, Trash2, Pencil, ClipboardPaste, ShieldAlert, ShieldCheck, X, Network } from "lucide-react"
import type { Clip } from '@/features/clips/types'
import { useClips } from "@/contexts/ClipContext"
import { useRelativeTime } from "@/features/clips/hooks/use-relative-time"
import { useCardRowSpan } from "@/features/clips/hooks/use-card-row-span"
import { insertLinks } from "@/features/clips/utils/insert-links"
import { TogglePin, Delete, PasteToWindow, GetClipImage } from "../../../../bindings/Clipcat/app"
import { playSound } from "@/utils/play-sound"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area-white"
import { ScrollArea as ScrollAreaPencil } from "@/components/ui/scroll-area-pencil"
import { ScrollArea as ScrollAreaDark } from "@/components/ui/scroll-area"
import { copyBase64ImageToClipboard } from "@/features/clips/utils/copy-base64-image"
import { Browser } from "@wailsio/runtime"
const EditClipDialog = lazy(() => import("@/components/edit-clip-dialog"))
const ImageLightbox = lazy(() => import("./image-lightbox"))

interface ClipCardProps {
    clip: Clip
    type: "pinned" | "recent"
    tourId?: string
    initialVisible?: boolean
}

function ClipCard({ clip, type, tourId, initialVisible = true }: ClipCardProps) {
    const [isDeleted, setIsDeleted] = useState(false)
    const [isVisible, setIsVisible] = useState(initialVisible)
    const [copied, setCopied] = useState(false)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [lightboxOpen, setLightboxOpen] = useState(false)
    const [fullImage, setFullImage] = useState<string | null>(null)
    const [isEditingLabel, setIsEditingLabel] = useState(false)
    const [editingLabel, setEditingLabel] = useState(clip.label || "")

    const isSavingLabelRef = useRef(false)
    const labelInputRef = useRef<HTMLInputElement>(null)
    const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const cachedRowSpanRef = useRef(10)
    const cardRef = useRef<HTMLDivElement>(null)

    const { hideContent, isMiniClip, soundOn, renameClip, distinctLabels, unhideClip, hideClip } = useClips()
    const relativeTime = useRelativeTime(clip.createdAt)
    const linkedContent = useMemo(() => insertLinks(clip.content), [clip.content])

    const labelSuggestions = useMemo(() => {
        if (!isEditingLabel || distinctLabels.length === 0) return []
        const q = editingLabel.toLowerCase()
        return distinctLabels
            .filter(l => l !== (clip.label || "") && (q === "" || l.toLowerCase().includes(q)))
            .slice(0, 8)
    }, [isEditingLabel, editingLabel, distinctLabels, clip.label])

    useCardRowSpan(cardRef, isMiniClip, isVisible)

    useEffect(() => {
        return () => { if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current) }
    }, [])

    useEffect(() => {
        if (isEditingLabel && labelInputRef.current) {
            labelInputRef.current.focus()
            labelInputRef.current.select()
        }
    }, [isEditingLabel])

    useEffect(() => {
        if (!dialogOpen || clip.type !== "image") { setFullImage(null); return }
        const id = Number(clip.id.replace('clip_', ''))
        GetClipImage(id).then(setFullImage).catch(() => { })
    }, [dialogOpen, clip.id, clip.type])

    useEffect(() => {
        const el = cardRef.current
        if (!el) return
        let observer: IntersectionObserver | null = null
        let hideDebounceTimer: ReturnType<typeof setTimeout> | null = null
        const timerId = setTimeout(() => {
            observer = new IntersectionObserver(
                ([entry]) => {
                    if (entry.isIntersecting) {
                        if (hideDebounceTimer !== null) {
                            clearTimeout(hideDebounceTimer)
                            hideDebounceTimer = null
                        }
                        setIsVisible(true)
                    } else {
                        const span = parseInt(el.style.getPropertyValue('--row-span'))
                        if (span > 0) cachedRowSpanRef.current = span
                        if (hideDebounceTimer === null) {
                            hideDebounceTimer = setTimeout(() => {
                                hideDebounceTimer = null
                                setIsVisible(false)
                            }, 300)
                        }
                    }
                },
                { rootMargin: '500px' }
            )
            observer.observe(el)
        }, 150)
        return () => {
            clearTimeout(timerId)
            if (hideDebounceTimer !== null) clearTimeout(hideDebounceTimer)
            observer?.disconnect()
        }
    }, [])

    // â”€â”€ Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    const handleCopy = async () => {
        playSound("/sounds/paper-copy.wav", soundOn, 1)
        try {
            if (clip.type === "image") {
                const clipId = Number(clip.id.replace('clip_', ''))
                const imageData = await GetClipImage(clipId)
                copyBase64ImageToClipboard(`data:image/png;base64,${imageData}`)
                return
            }
            if (clip.content == null) return
            await navigator.clipboard.writeText(clip.content)
            setCopied(true)
            if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current)
            copiedTimerRef.current = setTimeout(() => setCopied(false), 2000)
        } catch (err) { console.error("Failed to copy:", err) }
    }

    const handlePin = async () => {
        const clipId = Number(clip.id.replace('clip_', ''))
        playSound("/sounds/clipboard-slap.mp3", soundOn, 1)
        await TogglePin(clipId).catch(err => console.error("Failed to toggle pin:", err))
    }

    const handlePaste = async () => {
        if (!clip.content) return
        playSound("/sounds/paper-copy.wav", soundOn, 1)
        try {
            await PasteToWindow(clip.content)
        } catch (err) {
            console.error("PasteToWindow failed, falling back to copy:", err)
            await navigator.clipboard.writeText(clip.content)
        }
    }

    const handleDelete = async () => {
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

    const startEditingLabel = () => {
        setEditingLabel(clip.label || "")
        setIsEditingLabel(true)
    }

    const saveLabel = async () => {
        if (isSavingLabelRef.current) return
        isSavingLabelRef.current = true
        setIsEditingLabel(false)
        const trimmed = editingLabel.trim()
        if (trimmed !== (clip.label || "")) await renameClip(clip.id, trimmed)
        isSavingLabelRef.current = false
    }

    const cancelLabelEditing = () => {
        setIsEditingLabel(false)
        setEditingLabel(clip.label || "")
    }

    const handleLabelKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") { e.preventDefault(); saveLabel() }
        else if (e.key === "Escape") cancelLabelEditing()
    }

    const handleLinkClick = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement
        if (target.classList.contains('inserted-link')) {
            e.preventDefault()
            e.stopPropagation()
            const url = target.getAttribute('data-url')
            if (url) Browser.OpenURL(url)
        }
    }

    if (isDeleted) return null
    if (!isVisible) return <div id={tourId} ref={cardRef} />

    return (
        <>
            <div
                id={tourId}
                ref={cardRef}
                className={`group/card hand-drawn lined thin p-3 bg-[#F9F5E6] relative flex flex-col${clip.isHidden ? " ring-1 ring-amber-500/30" : ""}${isEditingLabel ? " z-50" : ""}`}
            >
                {/* Pin indicator */}
                {type === "pinned" && (
                    <div className="h-10 -top-5 right-[40%] absolute z-20">
                        <img src="pin.png" alt="pin-img" className="h-full" />
                        <div className="absolute h-3 w-4 rounded-[10px] shadow-lg/80 top-4 right-[10.5px]" />
                    </div>
                )}

                {/* Shield floating button */}
                {clip.isHidden ? (
                    <button
                        onClick={() => unhideClip(clip.id)}
                        className={`absolute -top-2 -right-2 z-20 flex items-center gap-1 text-[11px] font-medium text-amber-900 bg-amber-300 border border-amber-500 rounded-full shadow-sm hover:bg-green-200 hover:text-green-900 hover:border-green-500 transition-all opacity-0 group-hover/card:opacity-100 ${isMiniClip ? "p-1" : "px-2 py-0.5"}`}
                        title="Mark as safe (unhide)"
                    >
                        <ShieldCheck className="h-3 w-3" />
                        {!isMiniClip && <span>sensitive</span>}
                    </button>
                ) : (
                    <button
                        onClick={() => hideClip(clip.id)}
                        className="absolute -top-2 -right-2 z-20 p-1.5 rounded-full text-orange-800 bg-orange-200 border border-orange-400 shadow-sm hover:bg-orange-300 hover:border-orange-500 transition-all opacity-0 group-hover/card:opacity-100"
                        title="Mark as sensitive (hide)"
                    >
                        <ShieldAlert className="h-3.5 w-3.5" />
                    </button>
                )}

                {/* Pin floating button - left side */}
                <button
                    onClick={handlePin}
                    className={`absolute -top-2 -left-2 z-20 p-1.5 rounded-full border shadow-sm transition-all opacity-0 group-hover/card:opacity-100 ${
                        clip.isPinned
                            ? "text-amber-800 bg-amber-200 border-amber-400 hover:bg-red-200 hover:text-red-700 hover:border-red-400"
                            : "text-yellow-700 bg-yellow-100 border-yellow-300 hover:bg-yellow-200 hover:border-yellow-400"
                    }`}
                    title={clip.isPinned ? "Unpin clip" : "Pin clip"}
                >
                    <Pin className={`h-3 w-3 ${clip.isPinned ? "fill-current" : ""}`} />
                </button>

                {/* Tag floating button - below shield, opens/closes label input */}
                <button
                    onClick={isEditingLabel ? cancelLabelEditing : startEditingLabel}
                    onMouseDown={isEditingLabel ? (e) => e.preventDefault() : undefined}
                    className={`absolute top-6 -right-2 z-20 p-1.5 rounded-full border shadow-sm transition-all opacity-0 group-hover/card:opacity-100 ${
                        isEditingLabel
                            ? "text-red-700 bg-red-200 border-red-400 hover:bg-red-300 hover:border-red-500"
                            : "text-indigo-700 bg-indigo-100 border-indigo-300 hover:bg-indigo-200 hover:border-indigo-400"
                    }`}
                    title={isEditingLabel ? "Cancel label editing" : "Add label"}
                >
                    {isEditingLabel ? <X className="h-3 w-3" /> : <Tag className="h-3 w-3" />}
                </button>

                {/* Header - network indicator on left, time on right */}
                <div className="mb-3 flex items-start justify-between shrink-0">
                    <div className="flex items-center gap-1.5">
                        {clip.source === "network" && (
                            <span title="Synced from LAN">
                                <Network className="h-3 w-3 text-blue-600/60" />
                            </span>
                        )}
                    </div>
                    <span className="text-xs text-muted-foreground md:hidden">{relativeTime}</span>
                </div>

                {/* Label badge - shown when not editing */}
                {clip.label && !isEditingLabel && (
                    <div className="flex items-center gap-1 text-[11px] text-amber-700/60 mb-1.5 shrink-0">
                        <Tag className="h-3 w-3 shrink-0" />
                        <span className="truncate">{clip.label}</span>
                    </div>
                )}

                {/* Label input - grid 0frâ†’1fr for height transition */}
                <div className="relative shrink-0">
                    <div
                        className={`grid overflow-hidden [transition:grid-template-rows_0.2s_ease]${isEditingLabel ? " grid-rows-[1fr]" : " grid-rows-[0fr]"}`}
                    >
                        <div className="min-h-0">
                            <div className="flex items-center gap-1 pb-1.5 pt-0.5">
                                <Tag className="h-3 w-3 shrink-0 text-amber-600/50" />
                                <input
                                    ref={labelInputRef}
                                    type="text"
                                    className="w-full text-xs px-1 py-0.5 bg-transparent border-b border-dashed border-amber-600/50 outline-none text-foreground placeholder:text-muted-foreground/50"
                                    placeholder="Enter labelâ€¦"
                                    value={editingLabel}
                                    onChange={(e) => setEditingLabel(e.target.value)}
                                    onBlur={saveLabel}
                                    onKeyDown={handleLabelKeyDown}
                                />
                            </div>
                        </div>
                    </div>
                    {/* Suggestions - absolutely positioned so they never affect card layout */}
                    {isEditingLabel && labelSuggestions.length > 0 && (
                        <div className="absolute top-full left-0 right-0 z-60 mt-0.5 bg-[#F9F5E6] border border-dashed border-amber-600/50 shadow-lg overflow-hidden">
                            <ScrollAreaDark className="max-h-40">
                                <div className="divide-y divide-amber-200/40">
                                {labelSuggestions.map(suggestion => (
                                    <button
                                        key={suggestion}
                                        className="w-full text-left px-2 py-2 text-[11px] text-amber-900 hover:bg-amber-200/80 hover:text-amber-950 flex items-center gap-1.5 transition-colors"
                                        onMouseDown={(e) => {
                                            e.preventDefault()
                                            if (isSavingLabelRef.current) return
                                            isSavingLabelRef.current = true
                                            setIsEditingLabel(false)
                                            setEditingLabel(suggestion)
                                            if (suggestion !== (clip.label || "")) {
                                                renameClip(clip.id, suggestion)
                                                    .catch(console.error)
                                                    .finally(() => { isSavingLabelRef.current = false })
                                            } else {
                                                isSavingLabelRef.current = false
                                            }
                                        }}
                                    >
                                        <Tag className="h-2.5 w-2.5 shrink-0" />
                                        <span className="truncate">{suggestion}</span>
                                    </button>
                                ))}
                            </div>
                            </ScrollAreaDark>
                        </div>
                    )}
                </div>

                {/* Content */}
                <div
                    className={`flex-1 min-h-0 overflow-hidden cursor-pointer hover:scale-95 transition-transform ${hideContent ? "hard-to-read" : ""}`}
                    onClick={(e) => {
                        handleLinkClick(e)
                        if (!(e.target as HTMLElement).classList.contains('inserted-link')) {
                            setDialogOpen(true)
                        }
                    }}
                >
                    {clip.type === "image" && clip.image ? (
                        <img
                            src={`data:image/png;base64,${clip.image}`}
                            alt="Clip image"
                            className="w-full h-auto object-contain max-h-48 rounded"
                        />
                    ) : (
                        <p
                            className="line-clamp-4 text-sm text-foreground md:line-clamp-8"
                            dangerouslySetInnerHTML={{ __html: linkedContent }}
                        />
                    )}
                </div>

                {/* Footer: timestamp + sensitive indicator + action buttons */}
                <div className="flex flex-col-reverse gap-2 justify-between mt-2 shrink-0">
                    <div className="flex items-center gap-2">
                        {clip.isHidden && (
                            <span title="Sensitive clip">
                                <ShieldAlert className="h-3 w-3 text-orange-600/60" />
                            </span>
                        )}
                        <span className="hidden text-xs text-muted-foreground md:block">{relativeTime}</span>
                    </div>
                    {/* Buttons invisible until hover - still take up space */}
                    <div className="flex gap-2 opacity-0 group-hover/card:opacity-100 transition-opacity">
                        <button
                            onClick={handleCopy}
                            className={`rounded p-1.5 transition-colors ${copied ? "bg-green-100 text-green-700" : "bg-foreground/5 text-foreground hover:bg-foreground/10"}`}
                            title="Copy to clipboard"
                        >
                            <Copy className="h-4 w-4" />
                        </button>
                        {clip.type !== "image" && (
                            <button
                                onClick={handlePaste}
                                className="rounded p-1.5 bg-foreground/5 text-foreground transition-colors hover:bg-purple-100 hover:text-purple-700"
                                title="Paste into previous window"
                            >
                                <ClipboardPaste className="h-4 w-4" />
                            </button>
                        )}
                        {clip.type !== "image" && (
                            <Suspense fallback={null}>
                                <EditClipDialog clip={clip}>
                                    <button
                                        className="rounded p-1.5 bg-foreground/5 text-foreground transition-colors hover:bg-blue-100 hover:text-blue-700"
                                        title="Edit clip"
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </button>
                                </EditClipDialog>
                            </Suspense>
                        )}
                        <button
                            onClick={handleDelete}
                            className="rounded p-1.5 bg-foreground/5 text-foreground transition-colors hover:bg-red-100 hover:text-red-700"
                            title="Delete clip"
                        >
                            <Trash2 className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Detail dialog */}
            {dialogOpen && (
                <Dialog open={dialogOpen} onOpenChange={(open) => {
                    setDialogOpen(open)
                    if (!open) setLightboxOpen(false)
                }}>
                    {clip.type === "image" && clip.image ? (
                        <DialogContent className="px-3 border-0 rounded-sm max-w-2xl bg-[url(/board-texture.avif)] bg-cover h-screen! sm:h-[90vh]! max-h-125">
                            <ScrollArea className="overflow-auto">
                                <img
                                    src={`data:image/png;base64,${fullImage ?? clip.image}`}
                                    alt="Clip image"
                                    onClick={() => setLightboxOpen(true)}
                                    className={`w-full h-auto object-contain rounded cursor-zoom-in ${hideContent ? "hard-to-read" : ""}`}
                                />
                            </ScrollArea>
                            <Suspense fallback={null}>
                                <ImageLightbox
                                    src={`data:image/png;base64,${fullImage ?? clip.image}`}
                                    open={lightboxOpen}
                                    hideContent={hideContent}
                                    onClose={() => setLightboxOpen(false)}
                                />
                            </Suspense>
                        </DialogContent>
                    ) : (
                        <DialogContent className="px-3 rounded-sm max-w-2xl bg-[url(/board-texture.avif)] bg-cover border-0 h-screen! sm:h-[90vh]! max-h-125">
                            <div className="w-fit hidden sm:block absolute h-[20%] top-[-7%] left-0 mx-auto right-0 z-10">
                                <div className="absolute border-black h-2 left-0 right-0 w-[90%] mx-auto bottom-0 shadow-md/65"></div>
                                <img src="/clip.png" className="h-full" alt="" />
                            </div>
                            <div className="page rounded-none! overflow-x-scroll overflow-y-hidden shadow-md/50">
                                <div className="margin"></div>
                                <DialogHeader className="sm:pt-7">
                                    <DialogTitle>Clip Content</DialogTitle>
                                    <DialogDescription>Created {relativeTime}</DialogDescription>
                                    <img src="/seperator.png" alt="" className="w-full" />
                                </DialogHeader>
                                <ScrollAreaPencil
                                    className={`max-h-[60vh] pr-4 overflow-x-hidden pb-90 ${hideContent ? "hard-to-read" : ""}`}
                                    onClick={handleLinkClick}
                                >
                                    <p className="whitespace-pre-wrap wrap-break-word text-sm" dangerouslySetInnerHTML={{ __html: linkedContent }} />
                                </ScrollAreaPencil>
                            </div>
                        </DialogContent>
                    )}
                </Dialog>
            )}
        </>
    )
}

export default memo(ClipCard, (prev, next) =>
    prev.clip.id === next.clip.id &&
    prev.clip.content === next.clip.content &&
    prev.clip.image === next.clip.image &&
    prev.clip.isPinned === next.clip.isPinned &&
    prev.clip.isHidden === next.clip.isHidden &&
    prev.clip.label === next.clip.label &&
    prev.type === next.type &&
    prev.tourId === next.tourId &&
    prev.initialVisible === next.initialVisible
)