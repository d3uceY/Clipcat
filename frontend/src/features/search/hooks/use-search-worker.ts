import { useState, useEffect, useRef } from "react"
import type { FilteredClips } from "../workers/search.worker"
import type { Clip } from "@/features/clips/types"

interface UseSearchWorkerOptions {
    clips: { pinned: Clip[]; recent: Clip[] }
    searchQuery: string
    activeLabels: string[]
}

export function useSearchWorker({ clips, searchQuery, activeLabels }: UseSearchWorkerOptions) {
    const [filteredClips, setFilteredClips] = useState<FilteredClips>({
        pinned: [],
        recent: [],
        hiddenPinned: [],
        hiddenRecent: [],
    })
    const workerRef = useRef<Worker | null>(null)

    useEffect(() => {
        const worker = new Worker(
            new URL('../workers/search.worker.ts', import.meta.url),
            { type: 'module' }
        )
        workerRef.current = worker
        worker.onmessage = (e: MessageEvent<FilteredClips>) => setFilteredClips(e.data)
        return () => {
            worker.terminate()
            workerRef.current = null
        }
    }, [])

    useEffect(() => {
        workerRef.current?.postMessage({ clips, searchQuery, activeLabels })
    }, [clips, searchQuery, activeLabels])

    return filteredClips
}
