import { useState, useRef, useCallback, useEffect } from "react"

const RESTORE_DELAY = 900
const COOLDOWN_EXTRA = 150

/**
 * Temporarily hides the sticky search bar while arrow-key navigating,
 * without clearing the typed filter. The bar reappears once navigation pauses.
 */
export function useNavHide(searchVisible: boolean) {
    const [navHideActive, setNavHideActive] = useState(false)
    const [navCooldown, setNavCooldown] = useState(false)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const cooldownRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const suppressSearchForNav = useCallback(() => {
        setNavHideActive(true)
        setNavCooldown(true)
        if (timerRef.current) clearTimeout(timerRef.current)
        if (cooldownRef.current) clearTimeout(cooldownRef.current)
        timerRef.current = setTimeout(() => {
            setNavHideActive(false)
            timerRef.current = null
        }, RESTORE_DELAY)
        cooldownRef.current = setTimeout(() => {
            setNavCooldown(false)
            cooldownRef.current = null
        }, RESTORE_DELAY + COOLDOWN_EXTRA)
    }, [])

    // Genuine close (Ctrl+F / toggle button) cancels any pending restore
    useEffect(() => {
        if (!searchVisible) {
            if (timerRef.current) clearTimeout(timerRef.current)
            if (cooldownRef.current) clearTimeout(cooldownRef.current)
            setNavHideActive(false)
            setNavCooldown(false)
        }
    }, [searchVisible])

    useEffect(() => () => {
        if (timerRef.current) clearTimeout(timerRef.current)
        if (cooldownRef.current) clearTimeout(cooldownRef.current)
    }, [])

    const barShown = searchVisible && !navHideActive

    return { navHideActive, navCooldown, suppressSearchForNav, barShown }
}
