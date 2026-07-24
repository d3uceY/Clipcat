import { useState, useRef, useCallback, useEffect } from "react"

const RESTORE_DELAY = 900

/**
 * Temporarily hides the sticky search bar while arrow-key navigating,
 * without clearing the typed filter. The bar reappears once navigation pauses.
 */
export function useNavHide(searchVisible: boolean) {
    const [navHideActive, setNavHideActive] = useState(false)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const suppressSearchForNav = useCallback(() => {
        setNavHideActive(true)
        if (timerRef.current) clearTimeout(timerRef.current)
        timerRef.current = setTimeout(() => {
            setNavHideActive(false)
            timerRef.current = null
        }, RESTORE_DELAY)
    }, [])

    // Genuine close (Ctrl+F / toggle button) cancels any pending restore
    useEffect(() => {
        if (!searchVisible) {
            if (timerRef.current) clearTimeout(timerRef.current)
            setNavHideActive(false)
        }
    }, [searchVisible])

    useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

    const barShown = searchVisible && !navHideActive

    return { navHideActive, suppressSearchForNav, barShown }
}
