import { Copy, Pin, Trash2, Pencil, ClipboardPaste, Tag, ShieldAlert, ShieldCheck } from "lucide-react"
import { useState, useRef, useMemo, useEffect, lazy, Suspense } from "react"
import { createPortal } from "react-dom"
import type { Clip } from '../../types/clip'
import { TogglePin, Delete, PasteToWindow, GetClipImage } from "../../bindings/Clipcat/app"
import { useClips } from "@/context/ClipContext"
import { playSound } from "@/helpers/playSound"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { useRelativeTime } from "@/hooks/use-relative-time"
import { ScrollArea } from "./ui/scroll-area-white"
import { ScrollArea as ScrollAreaPencil } from "./ui/scroll-area-pencil"
import { ScrollArea as ScrollAreaDark } from "./ui/scroll-area"
import { copyBase64ImageToClipboard } from "@/helpers/copyBase64Image"
const EditClipDialog = lazy(() => import("./edit-clip-dialog"))
const ImageLightbox = lazy(() => import("./image-lightbox"))
import { insertLinks } from "@/helpers/insertLinks"
import { Browser } from "@wailsio/runtime"

interface ClipCardOverlayProps {
    clip: Clip
    type: "pinned" | "recent"
    cardRect: DOMRect
    onDelete: () => void
    onDeleteRollback: () => void
    /** Called when focus enters or leaves the overlay so the parent keeps it mounted while the user is typing */
    onFocusChange: (focused: boolean) => void
    /** Mouse entered the overlay - cancel the parent's leave-hide timer */
    onHoverEnter: () => void
    /** Mouse left the overlay - start the parent's leave-hide timer */
    onHoverLeave: () => void
}

export default function ClipCardOverlay({ clip, type, cardRect, onDelete, onDeleteRollback, onFocusChange, onHoverEnter, onHoverLeave }: ClipCardOverlayProps) {
    const { soundOn, hideContent, isMiniClip, renameClip, distinctLabels, unhideClip, hideClip } = useClips()

    const [copied, setCopied] = useState(false)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [lightboxOpen, setLightboxOpen] = useState(false)
    const [fullImage, setFullImage] = useState<string | null>(null)
    const [isEditingLabel, setIsEditingLabel] = useState(false)
    const [editingLabel, setEditingLabel] = useState(clip.label || "")

    const isSavingLabelRef = useRef(false)
    const labelInputRef = useRef<HTMLInputElement>(null)
    const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const relativeTime = useRelativeTime(clip.createdAt)
    const linkedContent = useMemo(() => insertLinks(clip.content), [clip.content])

    const labelSuggestions = useMemo(() => {
        if (!isEditingLabel || distinctLabels.length === 0) return []
        const q = editingLabel.toLowerCase()
        return distinctLabels
            .filter(l => l !== (clip.label || "") && (q === "" || l.toLowerCase().includes(q)))
            .slice(0, 8)
    }, [isEditingLabel, editingLabel, distinctLabels, clip.label])

    // Fetch full-resolution image when the detail dialog opens
    useEffect(() => {
        if (!dialogOpen || clip.type !== "image") { setFullImage(null); return }
        const id = Number(clip.id.replace('clip_', ''))
        GetClipImage(id).then(setFullImage).catch(() => { })
    }, [dialogOpen, clip.id, clip.type])

    useEffect(() => {
        return () => { if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current) }
    }, [])

    // Focus the label input when editing starts
    useEffect(() => {
        if (isEditingLabel && labelInputRef.current) {
            labelInputRef.current.focus()
            labelInputRef.current.select()
        }
    }, [isEditingLabel])

    // ── Handlers ─────────────────────────────────────────────────────────────

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
        onDelete()
        try {
            await Delete(clipId)
        } catch (err) {
            console.error("Failed to delete clip:", err)
            onDeleteRollback()
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

    // ── Render ────────────────────────────────────────────────────────────────

    return createPortal(
        <>
            <div
                className={`hand-drawn lined thin p-3 bg-[#F9F5E6] flex flex-col shadow-lg animate-in fade-in-0 zoom-in-95 duration-150${clip.isHidden ? " ring-1 ring-amber-500/30" : ""}`}
                style={{
                    position: 'fixed',
                    top: cardRect.top,
                    left: cardRect.left,
                    width: cardRect.width,
                    minHeight: cardRect.height,
                    zIndex: 9,
                    overflow: 'visible',
                    // Step aside when the detail dialog is open so it renders on top
                    opacity: dialogOpen ? 0 : undefined,
                    pointerEvents: dialogOpen ? 'none' : undefined,
                }}
                onMouseEnter={onHoverEnter}
                onMouseLeave={onHoverLeave}
                onFocus={() => onFocusChange(true)}
                onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) onFocusChange(false)
                }}
            >
                {/* Pin indicator */}
                {type === "pinned" && (
                    <div className="h-10 -top-5 right-[40%] absolute z-20">
                        <img src="pin.png" alt="pin-img" className="h-full" />
                        <div className="absolute h-3 w-4 rounded-[10px] shadow-lg/80 top-4 right-[10.5px]" />
                    </div>
                )}

                {/* Shield button */}
                {clip.isHidden ? (
                    <button
                        onClick={() => unhideClip(clip.id)}
                        className={`absolute -top-2 -right-2 z-20 flex items-center gap-1 text-[11px] font-medium text-amber-900 bg-amber-300 border border-amber-500 rounded-full shadow-sm hover:bg-green-200 hover:text-green-900 hover:border-green-500 transition-colors ${isMiniClip ? "p-1" : "px-2 py-0.5"}`}
                        title="Mark as safe (unhide)"
                    >
                        <ShieldCheck className="h-3 w-3" />
                        {!isMiniClip && <span>sensitive</span>}
                    </button>
                ) : (
                    <button
                        onClick={() => hideClip(clip.id)}
                        className="absolute -top-2 -right-2 z-20 p-1.5 rounded-full text-amber-800 bg-amber-200 border border-amber-400 shadow-sm hover:bg-amber-300 hover:border-amber-500 transition-all"
                        title="Mark as sensitive (hide)"
                    >
                        <ShieldAlert className="h-3.5 w-3.5" />
                    </button>
                )}

                {/* Header icon + mobile timestamp */}
                <div className="mb-2 flex items-start justify-between shrink-0">
                    <span className="text-xl"></span>
                    <span className="text-xs text-muted-foreground md:hidden">{relativeTime}</span>
                </div>

                {/* Label area */}
                <div className={`mb-1.5 shrink-0${isEditingLabel ? " relative" : ""}`}>
                    {isEditingLabel ? (
                        <>
                            <div className="flex items-center gap-1">
                                <Tag className="h-3 w-3 shrink-0 text-amber-600/50" />
                                <input
                                    ref={labelInputRef}
                                    type="text"
                                    className="w-full text-xs px-1 py-0.5 bg-transparent border-b border-dashed border-amber-600/50 outline-none text-foreground placeholder:text-muted-foreground/50"
                                    placeholder="Enter label…"
                                    value={editingLabel}
                                    onChange={(e) => setEditingLabel(e.target.value)}
                                    onBlur={saveLabel}
                                    onKeyDown={handleLabelKeyDown}
                                />
                            </div>
                            {labelSuggestions.length > 0 && (
                                <div className="absolute top-full left-0 right-0 z-30 mt-0.5 bg-[#F9F5E6] border border-dashed border-amber-600/30 shadow-md">
                                    <ScrollAreaDark className="max-h-40">
                                    {labelSuggestions.map(suggestion => (
                                        <button
                                            key={suggestion}
                                            className="w-full text-left px-2 py-1.5 text-[11px] text-amber-700/70 hover:bg-amber-50/80 hover:text-amber-800 flex items-center gap-1.5 transition-colors"
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
                                            {suggestion}
                                        </button>
                                    ))}
                                    </ScrollAreaDark>
                                </div>
                            )}
                        </>
                    ) : clip.label ? (
                        <button
                            onClick={startEditingLabel}
                            className="group/label flex items-center gap-1 text-[11px] text-amber-700/70 hover:text-amber-700 transition-colors cursor-text"
                        >
                            <Tag className="h-3 w-3 shrink-0" />
                            <span className="truncate max-w-50">{clip.label}</span>
                            <Pencil className="h-3 w-3 opacity-0 group-hover/label:opacity-100 transition-opacity" />
                        </button>
                    ) : (
                        <button
                            onClick={startEditingLabel}
                            className="flex items-center gap-1 text-[11px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors cursor-text"
                        >
                            <Tag className="h-3 w-3 shrink-0" />
                            Add label…
                        </button>
                    )}
                </div>

                {/* Content */}
                <div
                    className={`flex-1 min-h-0 overflow-hidden cursor-pointer hover:scale-95 transition-transform ${hideContent ? "hard-to-read" : ""}`}
                    onClick={(e) => {
                        handleLinkClick(e)
                        if (!(e.target as HTMLElement).classList.contains('inserted-link')) {
                            setDialogOpen(true)
                            onFocusChange(true) // keep overlay alive while dialog is open
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
                            className="line-clamp-4 text-sm text-foreground md:line-clamp-6"
                            dangerouslySetInnerHTML={{ __html: linkedContent }}
                        />
                    )}
                </div>

                {/* Footer: timestamp + action buttons */}
                <div className="flex flex-col-reverse gap-2 justify-between mt-2 shrink-0">
                    <span className="hidden text-xs text-muted-foreground md:block">{relativeTime}</span>
                    <div className="flex gap-2">
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
                            onClick={handlePin}
                            className={`rounded p-1.5 transition-colors ${clip.isPinned
                                ? "bg-yellow-100 text-yellow-700 hover:bg-red-100 hover:text-red-700"
                                : "bg-foreground/5 text-foreground hover:bg-yellow-100 hover:text-yellow-700"
                            }`}
                            title={clip.isPinned ? "Unpin clip" : "Pin clip"}
                        >
                            <Pin className={`h-4 w-4 ${clip.isPinned ? "fill-current" : ""}`} />
                        </button>
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

            {/* Detail dialog - rendered outside the overlay div so it isn't clipped */}
            {dialogOpen && (
                <Dialog open={dialogOpen} onOpenChange={(open) => {
                    setDialogOpen(open)
                    if (!open) {
                        setLightboxOpen(false)
                        onFocusChange(false) // allow overlay to dismiss now that dialog is closed
                    }
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
        </>,
        document.body
    )
}
