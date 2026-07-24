import { useState, useEffect } from 'react'
import { formatTime } from '@/features/clips/utils/format-time'

// ---------------------------------------------------------------------------
// Single shared interval for all cards instead of one setInterval per card.
// With 5000 clips that would be 5000 live timer handles; this uses one.
// ---------------------------------------------------------------------------
type TickSubscriber = () => void
const subscribers = new Set<TickSubscriber>()
let globalTimer: ReturnType<typeof setInterval> | null = null

function subscribeToMinuteTick(fn: TickSubscriber): () => void {
    subscribers.add(fn)
    if (globalTimer === null) {
        globalTimer = setInterval(() => {
            subscribers.forEach(sub => sub())
        }, 60_000)
    }
    return () => {
        subscribers.delete(fn)
        if (subscribers.size === 0 && globalTimer !== null) {
            clearInterval(globalTimer)
            globalTimer = null
        }
    }
}

export const useRelativeTime = (dateString: string) => {
    const [time, setTime] = useState(() => formatTime(dateString))

    useEffect(() => {
        // Re-sync in case dateString changed between renders
        setTime(formatTime(dateString))
        return subscribeToMinuteTick(() => setTime(formatTime(dateString)))
    }, [dateString])

    return time
}