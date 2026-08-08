import { useEffect, useState } from "react"

/**
 * Returns a debounced copy of `value` that only updates after `delay` ms
 * have passed since the last change. Useful for throttling expensive work
 * (e.g. running the search worker) while the user is still typing.
 */
export function useDebounce<T>(value: T, delay = 200): T {
    const [debounced, setDebounced] = useState(value)

    useEffect(() => {
        const t = setTimeout(() => setDebounced(value), delay)
        return () => clearTimeout(t)
    }, [value, delay])

    return debounced
}
