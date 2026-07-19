import { useState, useRef, useMemo, memo, useEffect } from "react"
import { Tag } from "lucide-react"
import type { Clip } from '../../types/clip'
import { useClips } from "@/context/ClipContext"
import { useRelativeTime } from "@/hooks/use-relative-time"
import { useCardRowSpan } from "@/hooks/use-card-row-span"
import ClipCardOverlay from "./clip-card-overlay"
import { insertLinks } from "@/helpers/insertLinks"

interface ClipCardProps {
    clip: Clip
    type: "pinned" | "recent"
    tourId?: string
    initialVisible?: boolean
}

function ClipCard({ clip, type, tourId, initialVisible = true }: ClipCardProps) {
    const [isDeleted, setIsDeleted] = useState(false)
    const [isVisible, setIsVisible] = useState(initialVisible)
    const [isHovered, setIsHovered] = useState(false)
    const [overlayFocused, setOverlayFocused] = useState(false)
    const [cardRect, setCardRect] = useState<DOMRect | null>(null)

    const cachedRowSpanRef = useRef(10)
    const cardRef = useRef<HTMLDivElement>(null)
    const hoverLeaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const { hideContent, isMiniClip } = useClips()
    const relativeTime = useRelativeTime(clip.createdAt)
    const linkedContent = useMemo(() => insertLinks(clip.content), [clip.content])

    useCardRowSpan(cardRef, isMiniClip, isVisible)

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

    const handleHoverEnter = () => {
        if (hoverLeaveTimerRef.current) clearTimeout(hoverLeaveTimerRef.current)
        if (cardRef.current) setCardRect(cardRef.current.getBoundingClientRect())
        setIsHovered(true)
    }

    const handleHoverLeave = () => {
        hoverLeaveTimerRef.current = setTimeout(() => setIsHovered(false), 80)
    }

    if (isDeleted) return null
    if (!isVisible) return <div id={tourId} ref={cardRef} />

    const showOverlay = (isHovered || overlayFocused) && cardRect !== null

    return (
        <div
            id={tourId}
            ref={cardRef}
            className={`hand-drawn lined thin p-3 bg-[#F9F5E6] relative${clip.isHidden ? " ring-1 ring-amber-500/30" : ""}${showOverlay ? " invisible" : ""}`}
            onMouseEnter={handleHoverEnter}
            onMouseLeave={handleHoverLeave}
        >
            {/* Pin indicator */}
            {type === "pinned" && (
                <div className="h-10 -top-5 right-[40%] absolute z-20">
                    <img src="pin.png" alt="pin-img" className="h-full" />
                    <div className="absolute h-3 w-4 rounded-[10px] shadow-lg/80 top-4 right-[10.5px]" />
                </div>
            )}

            {/* Header */}
            <div className="mb-3 flex items-start justify-between">
                <span className="text-xl"></span>
                <span className="text-xs text-muted-foreground md:hidden">{relativeTime}</span>
            </div>

            {/* Label badge — visible without hovering */}
            {clip.label && (
                <div className="flex items-center gap-1 text-[11px] text-amber-700/60 mb-1.5">
                    <Tag className="h-3 w-3 shrink-0" />
                    <span className="truncate">{clip.label}</span>
                </div>
            )}

            {/* Content */}
            <div className={`${hideContent ? "hard-to-read" : ""} mb-4 flex-1 overflow-hidden`}>
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

            {/* Desktop timestamp */}
            <span className="hidden text-xs text-muted-foreground md:block">{relativeTime}</span>

            {showOverlay && (
                <ClipCardOverlay
                    clip={clip}
                    type={type}
                    cardRect={cardRect!}
                    onDelete={() => setIsDeleted(true)}
                    onDeleteRollback={() => setIsDeleted(false)}
                    onFocusChange={setOverlayFocused}
                    onHoverEnter={handleHoverEnter}
                    onHoverLeave={handleHoverLeave}
                />
            )}
        </div>
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