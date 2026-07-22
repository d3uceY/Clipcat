import { useState, useRef, useEffect, lazy, Suspense } from "react"
import type { FilteredClips } from '../workers/search.worker'
import { startTour, hasSeenTour } from "@/helpers/onboarding"
import { Search, ShieldAlert, X, Plus, Trash2 } from "lucide-react"
import ClipCard from "./clip-card"
import ClipListItem from "./clip-list-item"
import LabelFilterBar from "./label-filter-bar"
import { useClips } from "../context/ClipContext"
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { playSound } from "@/helpers/playSound";
import WindowControls from "./window-controls";
import CommandPalette from "./command-palette";
import { GetVersion } from "../../bindings/Clipcat/app";
import { Browser } from "@wailsio/runtime";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { UpdateInfo } from "./about-dialog";

const AboutDialog = lazy(() => import("./about-dialog"))
const AddClipDialog = lazy(() => import("./add-clip-dialog"))
const DeleteClipsDialog = lazy(() => import("./delete-clips-dialog"))

function PageContent() {
    const [searchQuery, setSearchQuery] = useState("")
    const [searchFocused, setSearchFocused] = useState(false)
    const [version, setVersion] = useState("")
    const [curtainsDone, setCurtainsDone] = useState(false)
    const [showSensitive, setShowSensitive] = useState(false)
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
    const [showUpdateDialog, setShowUpdateDialog] = useState(false)
    const { clips, soundOn, hideContent, clipsLoaded, activeLabels, autoHideSensitive, isMiniClip } = useClips()
    const searchInputRef = useRef<HTMLInputElement>(null)

    const checkForUpdates = async () => {
        if (!version) return;
        try {
            const response = await fetch("https://api.github.com/repos/d3uceY/Clipcat/releases/latest");
            if (!response.ok) return;
            const data = await response.json();
            const latestVersion = data.tag_name;
            const isStable = !version.endsWith("-dev") && !version.endsWith("-beta") && !version.endsWith("-alpha");
            if (latestVersion !== version && isStable) {
                setUpdateInfo({ version: latestVersion, releaseUrl: data.html_url, releaseDate: data.published_at });
            } else {
                setUpdateInfo(null);
            }
        } catch { /* silently ignore network errors */ }
    }

    useGSAP(() => {
        if (!clipsLoaded) return;
        const tl = gsap.timeline({
            onComplete: () => {
                // Remove compositor layers: clear GSAP inline transforms from all
                // animated elements so the browser can de-promote them, and remove
                // the paper curtain images from the DOM entirely - they are full-
                // viewport fixed layers that inflate GPU memory for the app's lifetime.
                gsap.set('.pussy', { clearProps: 'transform' })
                gsap.set('h1, .torn-input', { clearProps: 'all' })
                setCurtainsDone(true)
            }
        });
        tl.to('.paper-curtain-1', {
            left: "-53vw",
            duration: 1.5,
            ease: "steps(12)",
            rotation: -2,
            onStart: () => playSound('paper-curtain-sound.mp3', soundOn, 1)
        })
            .to('.paper-curtain-2', {
                right: '-53vw',
                duration: 1.5,
                ease: "steps(9)",
                rotation: 2,
            }, '-=1.5')
            .to('.paper-curtain-1', {
                rotation: 0,
                duration: 0.3,
                ease: "power2.out"
            }, '-=0.3')
            .to('.paper-curtain-2', {
                rotation: 0,
                duration: 0.3,
                ease: "power2.out"
            }, '-=0.3')
            .from('.pussy', {
                y: '120%',
                x: '-20%',
                rotation: -15,
                scale: 0.8,
                ease: "steps(12)"
            }, "-=0.7")
            .to('.pussy', {
                rotation: 0,
                scale: 1,
                x: '0%',
                duration: 0.4,
                ease: "elastic.out(1, 0.6)"
            }, '-=0.2')
            .from('h1, .torn-input', {
                opacity: 0,
                y: 20,
                rotation: -1,
                duration: 0.5,
                stagger: 0.15,
                ease: "back.out(1.5)"
            }, '-=0.5')
            .to('h1, .torn-input', {
                rotation: 0,
                duration: 0.3,
                ease: "power2.out"
            })
    }, [clipsLoaded])

    useEffect(() => {
        GetVersion().then(setVersion).catch(err => console.error("Failed to get version:", err))
    }, [])

    // Initialize browser notifications on mount
    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().catch(() => { });
        }
    }, [])

    // Run the update check once version is loaded
    useEffect(() => {
        if (!version) return;
        const run = async () => {
            try {
                const response = await fetch("https://api.github.com/repos/d3uceY/Clipcat/releases/latest");
                if (!response.ok) return;
                const data = await response.json();
                const latestVersion = data.tag_name;
                const isStable = !version.endsWith("-dev") && !version.endsWith("-beta") && !version.endsWith("-alpha");
                if (latestVersion !== version && isStable) {
                    const info: UpdateInfo = { version: latestVersion, releaseUrl: data.html_url, releaseDate: data.published_at };
                    setUpdateInfo(info);
                    // Show first-load dialog once per available version
                    const seenKey = `update-seen-${latestVersion}`;
                    if (!localStorage.getItem(seenKey)) {
                        localStorage.setItem(seenKey, "1");
                        setShowUpdateDialog(true);
                        // Fire a browser notification if permitted
                        if ('Notification' in window && Notification.permission === 'granted') {
                            playSound("/sounds/notification.wav", localStorage.getItem("soundOn") !== "false", 1);
                            new Notification('Clipcat update available', {
                                body: `Version ${latestVersion} is ready to download.`,
                            });
                        }
                    }
                }
            } catch { /* silently ignore */ }
        };
        run();
    }, [version])

    useEffect(() => {
        if (!hasSeenTour()) {
            // Small delay so the page entrance animation has finished
            const t = setTimeout(startTour, 2200)
            return () => clearTimeout(t)
        }
    }, [])


    const [filteredClips, setFilteredClips] = useState<FilteredClips>({
        pinned: [],
        recent: [],
        hiddenPinned: [],
        hiddenRecent: [],
    })
    const searchWorkerRef = useRef<Worker | null>(null)

    // Spin up the search worker once and tear it down on unmount.
    useEffect(() => {
        const worker = new Worker(
            new URL('../workers/search.worker.ts', import.meta.url),
            { type: 'module' }
        )
        searchWorkerRef.current = worker
        worker.onmessage = (e: MessageEvent<FilteredClips>) => setFilteredClips(e.data)
        return () => {
            worker.terminate()
            searchWorkerRef.current = null
        }
    }, [])

    // Re-filter whenever clips, the search query, or label filters change.
    // Runs off the main thread so typing never blocks the UI.
    useEffect(() => {
        searchWorkerRef.current?.postMessage({ clips, searchQuery, activeLabels })
    }, [clips, searchQuery, activeLabels])

    const hiddenCount = filteredClips.hiddenPinned.length + filteredClips.hiddenRecent.length

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === 'f') {
                e.preventDefault()
                searchInputRef.current?.focus()
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [])





    return (
        <main className=" bg-background p-6 md:p-10">

            {/* First-load update notification dialog */}
            <Dialog open={showUpdateDialog} onOpenChange={setShowUpdateDialog}>
                <DialogContent showCloseButton={false} className="hand-drawn lined thin p-6 bg-[#F9F5E6] max-w-sm border-0 sm:rounded-none">
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            <h2 className="text-lg font-bold">🎉 Update Available</h2>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                Version <strong>{updateInfo?.version}</strong> of Clipcat is ready to download.
                            </p>
                            {updateInfo?.releaseDate && (
                                <p className="text-xs text-muted-foreground">
                                    Released {new Date(updateInfo.releaseDate).toLocaleDateString()}
                                </p>
                            )}
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                            <button
                                onClick={() => setShowUpdateDialog(false)}
                                className="rounded px-3 py-1 text-sm bg-foreground/5 hover:bg-foreground/10 transition-colors"
                            >
                                Later
                            </button>
                            <button
                                onClick={() => { setShowUpdateDialog(false); Browser.OpenURL('https://d3ucey.github.io/Clipcat/download'); }}
                                className="rounded px-3 py-1 text-sm bg-foreground text-white hover:opacity-80 transition-opacity"
                            >
                                ⬇︎ Download
                            </button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Draggable title bar */}
            <div className="fixed z-10 top-1 left-0 right-0 h-10 cursor-grab" style={{ '--wails-draggable': 'drag' } as React.CSSProperties}></div>
            <WindowControls updateAvailable={updateInfo} onCheckUpdate={checkForUpdates} />
            <CommandPalette />
            {!curtainsDone && (
                <>
                    <img src="/paper-curtain.png" className="paper-curtain-1 h-screen fixed w-[53vw] left-0 top-0 bottom-0 z-10 " />
                    <img src="/paper-curtain.png" className="paper-curtain-2 h-screen fixed w-[53vw] -right-8 top-0 bottom-0 z-10 " />
                </>
            )}

            {/* // pussy cat image */}
            <div className={`h-[20vh] min-h-25 max-h-50 pussy fixed bottom-0 -left-6 z-1${isMiniClip ? " hidden" : ""}`}>
                {(searchFocused && searchQuery.length > 0) || (filteredClips.pinned.length === 0 && filteredClips.recent.length === 0) ?
                    (<img src="/pussy-nothing.png" alt="pussy" className="block h-full pussy-nothing" />)
                    :
                    !hideContent ?
                        (<img src="/pussy.png" alt="pussy" className="block h-full pussy-1" />)
                        :
                        (<img src="/pussy-hide.png" alt="pussy" className="block h-full pussy-2" />)
                }
            </div>
            <div className="margin"></div>
            <div className="mx-auto max-w-6xl">
                {/* Header: info (left) · search (center) · label filter (right) */}
                <div className="mb-10 flex items-center gap-4 justify-between">
                    {/* Left – about / version */}
                    <div className="shrink-0">
                        {!isMiniClip && (
                            <div id="tour-about" className="items-center gap-2 sm:flex">
                                {
                                    version &&
                                    <Suspense fallback={null}>
                                        <AboutDialog version={version} updateAvailable={updateInfo} />
                                    </Suspense>
                                }
                            </div>
                        )}
                    </div>

                    {/* Center – search */}
                    <div className="relative flex-1 max-w-md torn-input mx-auto">
                        <div className="tape-1 absolute -top-3 left-0 h-12 w-4 bg-yellow-200/40 rotate-45 rounded-sm shadow-sm"></div>
                        <div className="tape-2 absolute -top-3 right-0 h-12 w-4 bg-yellow-200/40 -rotate-45 rounded-sm shadow-sm"></div>
                        <input
                            id="tour-search"
                            ref={searchInputRef}
                            type="text"
                            placeholder="Ctrl+K for command palette"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onFocus={() => setSearchFocused(true)}
                            onBlur={() => setSearchFocused(false)}
                            className="w-full text-base sm:text-xl pl-4 pr-10 pt-2 text-foreground placeholder-gray-500 focus:outline-none shadow-xl"
                        />
                        {searchQuery ? (
                            <button
                                onClick={() => { setSearchQuery(""); searchInputRef.current?.focus() }}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#c0bdbd] hover:text-foreground transition-colors"
                                title="Clear search"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        ) : (
                            <Search className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#c0bdbd]" />
                        )}
                    </div>

                    {/* Right – label filter */}
                    <div className="shrink-0">
                        <LabelFilterBar />
                    </div>
                </div>

                {/* Sensitive clips indicator - only shown when auto-hide is on and there are hidden clips */}
                {autoHideSensitive && hiddenCount > 0 && (
                    <div className={`${!isMiniClip ? "mb-6" : "-mb-6 -mt-4"} flex items-center gap-3 flex-wrap`}>
                        <button
                            onClick={() => setShowSensitive(v => !v)}
                            className={`hand-drawn-btn lined thin inline-flex items-center gap-1.5 px-3 py-1 ${isMiniClip ? "text-[10px]!" : "text-xs!"} mb-4 mt-2 transition-opacity hover:opacity-70 ${showSensitive
                                    ? "bg-amber-200 text-amber-900"
                                    : "bg-amber-50/80 text-amber-700/80 hover:bg-amber-100 hover:text-amber-800"
                                }`}
                        >
                            <ShieldAlert className="h-3 w-3" />
                            {showSensitive
                                ? `Hide ${hiddenCount} sensitive clip${hiddenCount !== 1 ? "s" : ""}`
                                : `${hiddenCount} sensitive clip${hiddenCount !== 1 ? "s" : ""} hidden — click to reveal`
                            }
                        </button>
                    </div>
                )}

                {/* Pinned Section — interleaves hidden pinned clips when showSensitive is active */}
                {(filteredClips.pinned.length > 0 || (showSensitive && filteredClips.hiddenPinned.length > 0)) && (
                    <section className={isMiniClip ? "mb-4" : "mb-12"}>
                        <div className="flex items-center gap-8 mb-4">
                            <h2 className="sm:flex hidden items-center gap-2 text-2xl font-bold text-foreground">
                                <span className="text-2xl">📌</span>
                                <span className="italic">Pinned <span className="text-xl"> ({filteredClips.pinned.length + (showSensitive ? filteredClips.hiddenPinned.length : 0)}) </span></span>
                            </h2>
                        </div>
                        {isMiniClip ? (
                            <div className="flex flex-col gap-3">
                                {filteredClips.pinned.map((clip) => (
                                    <ClipListItem key={clip.id} clip={clip} />
                                ))}
                                {showSensitive && filteredClips.hiddenPinned.map((clip) => (
                                    <ClipListItem key={clip.id} clip={clip} revealed />
                                ))}
                            </div>
                        ) : (
                            <div className="free-form-grid-container">
                                {filteredClips.pinned.map((clip, i) => (
                                    <ClipCard key={clip.id} clip={clip} type="pinned" initialVisible={i < 25} tourId={i === 0 ? "tour-clip-card" : undefined} />
                                ))}
                                {showSensitive && filteredClips.hiddenPinned.map((clip, i) => (
                                    <ClipCard key={clip.id} clip={clip} type="pinned" initialVisible={i < 25} />
                                ))}
                            </div>
                        )}
                    </section>
                )}

                {/* Recent Section — interleaves hidden recent clips when showSensitive is active */}
                {(filteredClips.recent.length > 0 || (showSensitive && filteredClips.hiddenRecent.length > 0)) && (
                    <section>
                        <div className="flex items-center gap-8 mb-4">
                            <h2 className=" sm:flex hidden items-center gap-2 text-2xl font-bold text-foreground">
                                <span className="text-2xl">📝</span>
                                <span className="italic">Recent <span className="text-xl"> ({filteredClips.recent.length + (showSensitive ? filteredClips.hiddenRecent.length : 0)}) </span></span>
                            </h2>
                        </div>
                        {isMiniClip ? (
                            <div className="flex flex-col gap-3">
                                {filteredClips.recent.map((clip) => (
                                    <ClipListItem key={clip.id} clip={clip} />
                                ))}
                                {showSensitive && filteredClips.hiddenRecent.map((clip) => (
                                    <ClipListItem key={clip.id} clip={clip} revealed />
                                ))}
                            </div>
                        ) : (
                            <div className="free-form-grid-container">
                                {filteredClips.recent.map((clip, i) => (
                                    <ClipCard key={clip.id} clip={clip} type="recent" initialVisible={i < 25} tourId={i === 0 && filteredClips.pinned.length === 0 ? "tour-clip-card" : undefined} />
                                ))}
                                {showSensitive && filteredClips.hiddenRecent.map((clip, i) => (
                                    <ClipCard key={clip.id} clip={clip} type="recent" initialVisible={i < 25} />
                                ))}
                            </div>
                        )}
                    </section>
                )}

                {/* Floating action buttons — Add Clip + Delete */}
                {!isMiniClip && (
                    <div className="fixed bottom-6 right-6 z-30 flex flex-col gap-3">
                        <Suspense fallback={null}>
                            <AddClipDialog>
                                <button
                                    id="tour-add-clip"
                                    className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-amber-600 bg-amber-200 shadow-lg transition-all hover:scale-110 hover:bg-amber-300"
                                    title="Add new clip"
                                >
                                    <Plus className="h-5 w-5 text-amber-800" />
                                </button>
                            </AddClipDialog>
                        </Suspense>
                        <Suspense fallback={null}>
                            <DeleteClipsDialog>
                                <button
                                    className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-red-500 bg-red-100 shadow-lg transition-all hover:scale-110 hover:bg-red-200"
                                    title="Clear clipboard history"
                                >
                                    <Trash2 className="h-5 w-5 text-red-700" />
                                </button>
                            </DeleteClipsDialog>
                        </Suspense>
                    </div>
                )}

                {/* Empty State — also check hidden clips when sensitive view is on */}
                {filteredClips.pinned.length === 0 && filteredClips.recent.length === 0
                    && (!showSensitive || (filteredClips.hiddenPinned.length === 0 && filteredClips.hiddenRecent.length === 0)) && (
                        <div className="flex-col h-64 text-black flex items-center justify-center gap-2">
                            <p className="text-lg text-black text-center">
                                {searchQuery ? "No clips found matching your search" : "No clips yet. Start copying!"}
                            </p>

                            <div className="text-lg text-black text-center">OR</div>
                            <div className="w-full flex justify-center">
                                <Suspense fallback={null}>
                                    <AddClipDialog>
                                        <button className="hover:scale-95 p-1 bg-amber-100 transition-transform cursor-pointer hand-drawn-btn dashed thin" title="Add new clip">
                                            <div className="flex items-center sm:gap-2 gap-1">
                                                <span className="sm:text-xl text-lg">Add Clip</span>
                                                <span className="sm:text-4xl text-2xl">+</span>
                                            </div>
                                        </button>
                                    </AddClipDialog>
                                </Suspense>
                            </div>
                        </div>
                    )}
            </div>
        </main>
    )
}

import { ClipProvider } from "../context/ClipContext"

export default function Page() {
    return (
        <ClipProvider>
            <PageContent />
        </ClipProvider>
    )
}
