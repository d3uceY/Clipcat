import { Copy, Pin, Trash2, Pencil, ClipboardPaste } from "lucide-react"
import { useState, useRef, useMemo, memo, useEffect } from "react"
import type { Clip } from '../../types/clip'
import { TogglePin, Delete, PasteToWindow, GetClipImage } from "../../wailsjs/go/main/App"
import { useClips } from "@/context/ClipContext"
import { playSound } from "@/helpers/playSound"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { useRelativeTime } from "@/hooks/use-relative-time"
import { ScrollArea } from "./ui/scroll-area-white"
import { ScrollArea as ScrollAreaPencil } from "./ui/scroll-area-pencil"
import { copyBase64ImageToClipboard } from "@/helpers/copyBase64Image"
import { useCardRowSpan } from "@/hooks/use-card-row-span"
import EditClipDialog from "./edit-clip-dialog"
import { insertLinks } from "@/helpers/insertLinks"
import { BrowserOpenURL } from "../../wailsjs/runtime/runtime"
import { LogPrint } from "../../wailsjs/runtime/runtime"


interface ClipCardProps {
    clip: Clip
    type: "pinned" | "recent"
    tourId?: string
    initialVisible?: boolean
}

function ClipCard({ clip, type, tourId, initialVisible = true }: ClipCardProps) {
    const [copied, setCopied] = useState(false)
    const [dialogOpen, setDialogOpen] = useState(false)
    const [isDeleted, setIsDeleted] = useState(false)
    const [isVisible, setIsVisible] = useState(initialVisible)
    const [fullImage, setFullImage] = useState<string | null>(null)
    const cachedRowSpanRef = useRef(10) // matches CSS default span
    const cardRef = useRef<HTMLDivElement>(null)
    const { getClips, soundOn, hideContent, isMiniClip } = useClips()
    const relativeTime = useRelativeTime(clip.createdAt)
    const linkedContent = useMemo(() => insertLinks(clip.content), [clip.content])

    // Fetch full-resolution image when the detail dialog opens.
    useEffect(() => {
        if (!dialogOpen || clip.type !== "image") return
        const id = Number(clip.id.replace('clip_', ''))
        GetClipImage(id).then(setFullImage).catch(() => {})
    }, [dialogOpen, clip.id, clip.type])

    useCardRowSpan(cardRef, isMiniClip, isVisible)

    useEffect(() => {
        const el = cardRef.current
        if (!el) return
        let observer: IntersectionObserver | null = null
        // Delay setup so initial batch measurements (~41 ms) complete first.
        // Cards that started invisible have no measurement race — they render
        // as placeholders immediately and get measured when scrolled into view.
        const timerId = setTimeout(() => {
            observer = new IntersectionObserver(
                ([entry]) => {
                    if (!entry.isIntersecting) {
                        const span = parseInt(el.style.getPropertyValue('--row-span'))
                        if (span > 0) cachedRowSpanRef.current = span
                    }
                    setIsVisible(entry.isIntersecting)
                },
                { rootMargin: '500px' }
            )
            observer.observe(el)
        }, 150)
        return () => {
            clearTimeout(timerId)
            observer?.disconnect()
        }
    }, [])


    const handleCopy = async () => {
        playSound("/sounds/paper-copy.wav", soundOn, 1)
        try {
            if (clip.type === "image") {
                const clipId = Number(clip.id.replace('clip_', ''))
                const imageData = await GetClipImage(clipId)
                copyBase64ImageToClipboard(`data:image/png;base64,${imageData}`)
                return
            }
            if (clip.content === undefined) return
            await navigator.clipboard.writeText(clip.content)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        } catch (err) {
            console.error("Failed to copy:", err)
        }
    }

    const handlePin = async () => {
        const clipId = Number(clip.id.replace('clip_', ''))
        playSound("/sounds/clipboard-slap.mp3", soundOn, 1)
        await TogglePin(clipId).catch((err) => {
            console.error("Failed to toggle pin:", err)
        }).finally(() => {
            getClips()
        })
    }

    const handlePaste = async () => {
        if (!clip.content) return
        playSound("/sounds/paper-copy.wav", soundOn, 1)
        try {
            await PasteToWindow(clip.content)
        } catch (err) {
            // Fall back to regular copy if paste-back fails
            console.error("PasteToWindow failed, falling back to copy:", err)
            await navigator.clipboard.writeText(clip.content)
        }
    }

    const handleDelete = async () => {
        const clipId = Number(clip.id.replace('clip_', ''))
        playSound("/sounds/paper-rip.mp3", soundOn, 0.5)

        // Optimistically hide the card immediately
        setIsDeleted(true)

        try {
            await Delete(clipId)
            await getClips()
        } catch (err) {
            console.error("Failed to delete clip:", err)
            LogPrint(`Failed to delete clip: ${err}`)   
            setIsDeleted(false) // rollback on failure
        }
    }

    const handleViewClip = () => {
        setDialogOpen(true)
    }

    const handleLinkClick = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement
        if (target.classList.contains('inserted-link')) {
            e.preventDefault()
            e.stopPropagation()
            const url = target.getAttribute('data-url')
            if (url) {
                BrowserOpenURL(url)
            }
        }
    }

    if (isDeleted) return null

    // Placeholder for off-screen cards — keeps the grid cell the right size
    // without rendering the full React subtree.
    // No inline style needed: CSS uses --row-span (last measured value, or
    // the default of 10) so the cell stays correctly sized with no JS override.
    if (!isVisible) {
        return <div id={tourId} ref={cardRef} />
    }

    return (
        <div
            id={tourId}
            ref={cardRef}
            className={"hand-drawn lined thin p-3 bg-[#F9F5E6] relative group"}
        >   {/* Header with icon and timestamp */}
            {type == "pinned" &&
                <div className="h-10 -top-5 right-[40%] absolute">
                    <img src={"pin.png"} alt="pin-img" className="h-full" />
                    <div className="absolute h-6 w-5 rounded-full shadow-lg/80 top-2 right-3" />
                </div>}
            <div className="mb-3 flex items-start justify-between">
                <span className="text-xl"></span>
                <span className="text-xs text-muted-foreground md:hidden">{relativeTime}</span>
            </div>

            {/* Content */}
            <div className={`mb-4 flex-1 overflow-hidden cursor-pointer hover:scale-95 transition-transform  ${hideContent ? "hard-to-read" : ""}`} onClick={(e) => { handleLinkClick(e); if (!(e.target as HTMLElement).classList.contains('inserted-link')) handleViewClip(); }}>
                {clip.type === "image" && clip.image ? (
                    <img
                        src={`data:image/png;base64,${clip.image}`}
                        alt="Clip image"
                        className="w-full h-auto object-contain max-h-48 rounded"
                    />
                ) : (
                    <p className={`line-clamp-4 text-sm text-foreground md:line-clamp-8`} dangerouslySetInnerHTML={{ __html: linkedContent }}></p>
                )}
            </div>

            {/* Footer with time and actions */}
            <div className="flex flex-col-reverse gap-2 justify-between">
                <span className="hidden text-xs text-muted-foreground md:block">{relativeTime}</span>
                <div className="flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                        onClick={handleCopy}
                        className={`rounded p-1.5 transition-colors ${copied ? "bg-green-100 text-green-700" : "bg-foreground/5 text-foreground hover:bg-foreground/10"
                            }`}
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
                        <EditClipDialog clip={clip}>
                            <button
                                className="rounded p-1.5 bg-foreground/5 text-foreground transition-colors hover:bg-blue-100 hover:text-blue-700"
                                title="Edit clip"
                            >
                                <Pencil className="h-4 w-4" />
                            </button>
                        </EditClipDialog>
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

            {dialogOpen && (
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    {
                        clip.type === "image" && clip.image ? (
                            <DialogContent className="px-3 border-0 rounded-sm max-w-2xl bg-[url(/board-texture.avif)] bg-cover h-screen!  sm:h-[90vh]! max-h-125">
                                {/* clip image */}
                                <ScrollArea className=" overflow-auto ">
                                    <img
                                        src={`data:image/png;base64,${fullImage ?? clip.image}`}
                                        alt="Clip image"
                                        className={`w-full h-auto object-contain rounded ${hideContent ? "hard-to-read" : ""}`}
                                    />
                                </ScrollArea>
                            </DialogContent>

                        )

                            :

                            (<DialogContent className="px-3 rounded-sm max-w-2xl bg-[url(/board-texture.avif)] bg-cover border-0 h-screen!  sm:h-[90vh]! max-h-125">
                                {/* clip image */}
                                <div className="w-fit hidden sm:block absolute h-[20%] top-[-7%] left-0 mx-auto right-0 z-10">
                                    <div className="absolute border-black h-2 left-0 right-0 w-[90%] mx-auto bottom-0 shadow-md/65"></div>
                                    <img src="/clip.png" className="h-full" alt="" />
                                </div>

                                <div className="page rounded-none! overflow-x-scroll overflow-y-hidden shadow-md/50">
                                    <div className="margin"></div>
                                    <DialogHeader className="sm:pt-7">
                                        <DialogTitle>Clip Content</DialogTitle>
                                        <DialogDescription>Created {relativeTime}</DialogDescription>
                                        <img src="/seperator.png" alt="" className="w-full " />
                                    </DialogHeader>
                                    <ScrollAreaPencil className=" max-h-[60vh] pr-4 overflow-x-hidden" onClick={handleLinkClick}>
                                            <p className={`whitespace-pre-wrap wrap-break-word text-sm ${hideContent ? "hard-to-read" : ""}`} dangerouslySetInnerHTML={{ __html: linkedContent }} />
                                    </ScrollAreaPencil>
                                </div>
                            </DialogContent>
                            )
                    }
                </Dialog>
            )}
        </div>
    )
}

export default memo(ClipCard, (prev, next) =>
    prev.clip.id === next.clip.id &&
    prev.clip.content === next.clip.content &&
    prev.clip.image === next.clip.image &&
    prev.clip.isPinned === next.clip.isPinned &&
    prev.type === next.type &&
    prev.tourId === next.tourId &&
    prev.initialVisible === next.initialVisible
)
