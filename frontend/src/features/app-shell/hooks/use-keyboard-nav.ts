import { useState, useCallback, useEffect, useRef } from "react"
import type { FilteredClips } from "@/features/search/workers/search.worker"
import { PasteToWindow } from "../../../../bindings/Clipcat/app"

interface UseKeyboardNavOptions {
    isSmallScreen: boolean
    isMiniClip: boolean
    isQuickPaste: boolean
    filteredClips: FilteredClips
    showSensitive: boolean
    searchVisible: boolean
    toggleSearchVisible: () => void
    suppressSearchForNav: () => void
    searchInputRef: React.RefObject<HTMLInputElement | null>
}

export function useKeyboardNav({
    isSmallScreen, isMiniClip, isQuickPaste,
    filteredClips, showSensitive,
    searchVisible, toggleSearchVisible, suppressSearchForNav,
    searchInputRef,
}: UseKeyboardNavOptions) {
    const [selectedIndex, setSelectedIndex] = useState(-1)
    const pasteMapRef = useRef<Map<string, () => Promise<void>>>(new Map())

    const registerPaste = useCallback((id: string, fn: () => Promise<void>) => {
        pasteMapRef.current.set(id, fn)
    }, [])

    const handleSelect = useCallback((index: number) => setSelectedIndex(index), [])

    // Build flat clip array matching render order
    const flatClips = [
        ...filteredClips.pinned,
        ...filteredClips.recent,
        ...(showSensitive ? filteredClips.hiddenPinned.concat(filteredClips.hiddenRecent) : []),
    ]

    const flatClipCount = flatClips.length
    const hiddenCount = filteredClips.hiddenPinned.length + filteredClips.hiddenRecent.length

    // Reset selection when clips or search change
    useEffect(() => {
        setSelectedIndex(-1)
    }, [filteredClips])

    const handlePasteSelected = useCallback(async () => {
        if (selectedIndex < 0) return
        const clip = flatClips[selectedIndex]
        if (!clip) return
        const pasteFn = pasteMapRef.current.get(clip.id)
        if (pasteFn) {
            await pasteFn()
        } else if (clip.type !== "image" && clip.content) {
            await PasteToWindow(clip.content)
        }
    }, [selectedIndex, flatClips])

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === 'f') {
                e.preventDefault()
                if (isSmallScreen || isMiniClip || isQuickPaste) {
                    toggleSearchVisible()
                } else {
                    searchInputRef.current?.focus()
                }
                return
            }

            if (!isMiniClip && !isQuickPaste) return

            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                if (searchVisible) suppressSearchForNav()
                if (flatClipCount === 0) return
                setSelectedIndex(prev => {
                    if (prev < 0) return e.key === 'ArrowDown' ? 0 : flatClipCount - 1
                    if (e.key === 'ArrowDown') return (prev + 1) % flatClipCount
                    return (prev - 1 + flatClipCount) % flatClipCount
                })
            } else if (e.key === 'Enter' && selectedIndex >= 0) {
                e.preventDefault()
                if (searchVisible) suppressSearchForNav()
                handlePasteSelected()
            } else if (e.key === 'Escape') {
                setSelectedIndex(-1)
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isSmallScreen, isMiniClip, isQuickPaste, flatClipCount, selectedIndex, searchVisible, handlePasteSelected, suppressSearchForNav, toggleSearchVisible, searchInputRef])

    return { selectedIndex, hiddenCount, handleSelect, registerPaste }
}
