import { useEffect, useCallback } from "react"
import { createPortal } from "react-dom"

interface ImageLightboxProps {
    src: string
    alt?: string
    open: boolean
    hideContent?: boolean
    onClose: () => void
}

// Full-screen image lightbox rendered via a portal so it sits above all other
// layers (dialogs, overlays, etc.) regardless of stacking context.
// Escape is intercepted in the capture phase so it closes the lightbox first
// without also triggering the parent Dialog's own Escape handler.
export default function ImageLightbox({ src, alt = "Image", open, hideContent = false, onClose }: ImageLightboxProps) {
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === "Escape") {
            e.stopPropagation()
            onClose()
        }
    }, [onClose])

    useEffect(() => {
        if (!open) return
        window.addEventListener("keydown", handleKeyDown, true)
        return () => window.removeEventListener("keydown", handleKeyDown, true)
    }, [open, handleKeyDown])

    if (!open) return null

    return createPortal(
        <div
            className="fixed inset-0 z-9999 bg-black/90 flex items-center justify-center cursor-zoom-out pointer-events-auto animate-in fade-in-0 duration-150"
            onClick={onClose}
        >
            <img
                src={src}
                alt={alt}
                className={`max-w-[95vw] max-h-[95vh] object-contain select-none ${hideContent ? "hard-to-read" : ""}`}
            />
        </div>,
        document.body
    )
}
