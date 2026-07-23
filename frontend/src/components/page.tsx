import { useState, useRef, useEffect, lazy, Suspense } from "react"
import type { FilteredClips } from '../workers/search.worker'
import { startTour, hasSeenTour } from "@/helpers/onboarding"
import { Search, ShieldAlert, X, Plus, Trash2, Command, Zap } from "lucide-react"
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
    const [searchVisible, setSearchVisible] = useState(false)
    const [isSmallScreen, setIsSmallScreen] = useState(false)
    const { clips, soundOn, hideContent, clipsLoaded, activeLabels, autoHideSensitive, isMiniClip, isQuickPaste, requestQuickPaste } = useClips()
    const searchInputRef = useRef<HTMLInputElement>(null)
    const searchBarRef = useRef<HTMLDivElement>(null)

    // Track md breakpoint (768px) so small screens get the collapsible search bar
    useEffect(() => {
        const mq = window.matchMedia("(max-width: 767px)")
        setIsSmallScreen(mq.matches)
        const onChange = (e: MediaQueryListEvent) => setIsSmallScreen(e.matches)
        mq.addEventListener("change", onChange)
        return () => mq.removeEventListener("change", onChange)
    }, [])

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

    // Toggles the sticky search bar — opens immediately, closes after GSAP animation.
    const toggleSearchVisible = () => {
        setSearchVisible(v => {
            const next = !v
            if (next) setTimeout(() => searchInputRef.current?.focus(), 50)
            return next
        })
    }

    // GSAP animate the sticky search bar — paper unfurling / rolling up
    useGSAP(() => {
        const bar = searchBarRef.current
        if (!bar) return

        if (searchVisible) {
            gsap.set(bar, { display: 'block', height: 'auto', opacity: 0 })
            const naturalHeight = bar.offsetHeight
            gsap.fromTo(bar,
                { height: 0, opacity: 0, scaleY: 0.6, rotation: 1, marginBottom: 0, transformOrigin: 'top center' },
                { height: naturalHeight, opacity: 1, scaleY: 1, rotation: 0, marginBottom: '1.5rem', duration: 0.4, ease: 'power3.out' }
            )
        } else {
            gsap.to(bar, {
                height: 0, opacity: 0, scaleY: 0.85, rotation: -0.5, marginBottom: 0, duration: 0.2, ease: 'power3.in',
                onComplete: () => {
                    gsap.set(bar, { display: 'none', height: 'auto', scaleY: 1, rotation: 0 })
                    setSearchQuery("")
                }
            })
        }
    }, [searchVisible])

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.key === 'f') {
                e.preventDefault()
                if (isSmallScreen || isMiniClip || isQuickPaste) {
                    toggleSearchVisible()
                } else {
                    searchInputRef.current?.focus()
                }
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isSmallScreen, isMiniClip, isQuickPaste])





    return (
        <main className=" bg-background p-6 md:p-10">

            {/* First-load update notification dialog */}
            <Dialog open={showUpdateDialog} onOpenChange={setShowUpdateDialog}>
                <DialogContent showCloseButton={false} className="hand-drawn lined thin p-6 bg-[#F9F5E6] max-w-sm border-0 sm:rounded-none">
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            <h2 className="text-lg font-bold">Update Available</h2>
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
                    <img src="/paper-curtain.png" className="paper-curtain-1 h-screen fixed w-[53vw] left-0 top-0 bottom-0 z-40 " />
                    <img src="/paper-curtain.png" className="paper-curtain-2 h-screen fixed w-[53vw] -right-8 top-0 bottom-0 z-40 " />
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
                    {/* Left - about / version (normal mode on large screens) or command palette trigger (small screen / mini/quickpaste) */}
                    {!isSmallScreen && !isMiniClip ? (
                        <div className="shrink-0">
                            <div id="tour-about" className="items-center gap-2 sm:flex">
                                {
                                    version &&
                                    <Suspense fallback={null}>
                                        <AboutDialog version={version} updateAvailable={updateInfo} />
                                    </Suspense>
                                }
                            </div>
                        </div>
                    ) : (
                        <div className="shrink-0">
                            <button
                                onClick={() => window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, key: 'k', bubbles: true }))}
                                className="hand-drawn-btn lined thin flex items-center gap-2 px-3 py-1.5 text-xs! transition-all relative top-2 bg-[#F9F5E6] text-amber-950 hover:bg-amber-100"
                                title="Command palette (Ctrl+K)"
                            >
                                <Command className="h-3.5 w-3.5 shrink-0 text-amber-700" />
                                <span className="hidden sm:inline font-medium">Menu</span>
                            </button>
                        </div>
                    )}

                    {/* Center - search (full bar in normal mode only; hidden on small screens & mini/quickpaste) */}
                    {!(isSmallScreen || isMiniClip || isQuickPaste) && (
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
                                className="w-full text-base sm:text-xl pl-4 pr-10 pt-2 text-foreground placeholder-gray-500 placeholder:text-lg focus:outline-none shadow-xl"
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
                    )}

                    {/* Right - search toggle (small screen / mini/quickpaste) + quick paste + sensitive toggle + label filter, grouped together */}
                    <div className="shrink-0 flex items-center gap-2">
                        {(isSmallScreen || isMiniClip || isQuickPaste) && (
                            <button
                                onClick={toggleSearchVisible}
                                className={`hand-drawn-btn lined thin flex items-center gap-2 px-3 py-1.5 text-xs! transition-all relative top-2 ${searchVisible
                                        ? "bg-amber-200 text-amber-950"
                                        : "bg-[#F9F5E6] text-amber-950 hover:bg-amber-100"
                                    }`}
                                title="Search clips (Ctrl+F)"
                            >
                                <Search className="h-3.5 w-3.5 shrink-0 text-amber-700" />
                                <span className="hidden sm:inline font-medium">Search</span>
                            </button>
                        )}
                        <button
                            onClick={() => requestQuickPaste()}
                            className={`hand-drawn-btn lined thin flex items-center gap-2 px-3 py-1.5 text-xs! transition-all relative top-2 ${isQuickPaste
                                    ? "bg-green-200 text-green-950"
                                    : "bg-[#F9F5E6] text-amber-950 hover:bg-amber-100"
                                }`}
                            title={isQuickPaste ? "Disable Quick Paste" : "Enable Quick Paste"}
                        >
                            <Zap className={`h-3.5 w-3.5 shrink-0 ${isQuickPaste ? "text-green-700" : "text-amber-700"}`} />
                            <span className="hidden sm:inline font-medium">Quick Paste</span>
                        </button>
                        {autoHideSensitive && hiddenCount > 0 && (
                            <button
                                onClick={() => setShowSensitive(v => !v)}
                                className={`hand-drawn-btn lined thin flex items-center gap-2 px-3 py-1.5 text-xs transition-all relative top-2 ${showSensitive
                                        ? "bg-amber-200 text-amber-950"
                                        : "bg-[#F9F5E6] text-amber-950 hover:bg-amber-100"
                                    }`}
                                title={showSensitive ? "Hide sensitive clips again" : "Reveal sensitive clips"}
                            >
                                <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-amber-700" />
                                <span className="hidden lg:inline font-medium text-sm">Sensitive</span>
                                <span className="flex items-center justify-center h-4 w-4 rounded-full bg-amber-300 text-amber-900 text-[10px] font-bold leading-none">
                                    {hiddenCount}
                                </span>
                            </button>
                        )}
                        <LabelFilterBar />
                    </div>
                </div>

                {/* Sticky search bar — small screen / mini/quickpaste mode, animated by GSAP */}
                {(isSmallScreen || isMiniClip || isQuickPaste) && (
                    <div
                        ref={searchBarRef}
                        className="sticky top-8 md:top-10 -mx-6 md:-mx-10 px-6 md:px-10 z-20"
                        style={{ display: 'none' }}
                    >
                        <div className="relative max-w-md mx-auto torn-input">
                            <div className="tape-1 absolute -top-3 left-0 h-10 w-4 bg-yellow-200/40 rotate-45 rounded-sm shadow-sm"></div>
                            <div className="tape-2 absolute -top-3 right-0 h-10 w-4 bg-yellow-200/40 -rotate-45 rounded-sm shadow-sm"></div>
                            <input
                                id="tour-search"
                                ref={searchInputRef}
                                type="text"
                                placeholder="Search clips... (Ctrl + F)"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onFocus={() => setSearchFocused(true)}
                                onBlur={() => setSearchFocused(false)}
                                className="w-full text-base pl-4 pr-10 pt-1.5 text-foreground placeholder-gray-500 focus:outline-none shadow-xl"
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
