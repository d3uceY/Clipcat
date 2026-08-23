import { useState, useEffect, useRef } from "react"
import type { Clip } from "@/features/clips/types"
import { Events } from "@wailsio/runtime"
import { SemanticSearch } from "../../../../bindings/Clipcat/app"

// Meaning-based search fallback.
//
// Normal text search lives in useSearchClips. When the backend finds no
// matches it emits "search:no-results"; this hook listens for that event and
// surfaces an in-app "search by meaning?" prompt instead of searching right
// away. Only when the user accepts does it embed the query and return the
// closest clips, and only then does the "Searching by meaning..." state show.
// (The accept/decline used to live in a backend OS-native dialog, which
// rendered Yes/No on Windows and never fired the custom button callbacks - so
// the promise hung and the searching text was stuck on screen.)
export function useSemanticSearch(searchQuery: string) {
    // true = a normal search came up empty; show the "search by meaning?" offer.
    const [offer, setOffer] = useState(false)
    // null = no meaning search done yet for the current query; [] = searched
    // (user declined or nothing was close enough); non-empty = matches.
    const [semanticClips, setSemanticClips] = useState<Clip[] | null>(null)
    // true only while an accepted meaning search is actually running.
    const [semanticPending, setSemanticPending] = useState(false)

    // Read the latest query without re-subscribing to the event (the listener
    // has empty deps). Only prompt when the event still matches what the user
    // is looking at - a stale event from a query they've since changed must
    // not fire the offer.
    const currentQueryRef = useRef(searchQuery)
    currentQueryRef.current = searchQuery

    // One search at a time, even if the backend emits again mid-flight.
    const pendingRef = useRef(false)

    // Any change to the query text discards the previous meaning results and
    // any pending offer.
    useEffect(() => {
        setSemanticClips(null)
        setOffer(false)
    }, [searchQuery])

    useEffect(() => {
        const off = Events.On("search:no-results", (e) => {
            const query: string = e.data
            if (!query || query !== currentQueryRef.current) return
            if (pendingRef.current) return
            // Don't search yet - ask the user first. This is plain in-app UI,
            // so declining (or doing nothing) never leaves a stuck "Searching
            // by meaning..." state behind.
            setOffer(true)
        })
        return off
    }, [])

    const runSemanticSearch = () => {
        const query = currentQueryRef.current
        if (!query || pendingRef.current) return
        pendingRef.current = true
        setOffer(false)
        setSemanticPending(true)
        SemanticSearch(query)
            .then((res) => {
                if (query === currentQueryRef.current) setSemanticClips(res ?? [])
            })
            .catch(() => {
                if (query === currentQueryRef.current) setSemanticClips([])
            })
            .finally(() => {
                pendingRef.current = false
                setSemanticPending(false)
            })
    }

    const dismissSemanticSearch = () => setOffer(false)

    return { offer, semanticClips, semanticPending, runSemanticSearch, dismissSemanticSearch }
}
