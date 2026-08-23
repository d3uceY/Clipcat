import { useState, useRef, useEffect, lazy, Suspense } from "react"
import { startTour, hasSeenTour } from "@/utils/onboarding"
import { Search, ShieldAlert, X, Plus, Trash2, Command, Zap } from "lucide-react"
import ClipCard from "@/features/clips/components/clip-card"
import ClipListItem from "@/features/clips/components/clip-list-item"
import LabelFilterBar from "@/features/search/components/label-filter-bar"
import { useClips } from "@/contexts/ClipContext"
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { playSound } from "@/utils/play-sound";
import { killAllAnimations } from "@/utils/kill-animations";
import WindowControls from "./window-controls";
import CommandPalette from "./command-palette";
import { Browser, Events } from "@wailsio/runtime";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useSearchClips } from "@/features/search/hooks/use-search-clips"
import { useSemanticSearch } from "@/features/search/hooks/use-semantic-search"
import { useDebounce } from "@/utils/use-debounce"
import { useUpdateCheck } from "../hooks/use-update-check"
import { useNavHide } from "../hooks/use-nav-hide"
import { useKeyboardNav } from "../hooks/use-keyboard-nav"

const AboutDialog = lazy(() => import("@/features/settings/components/about-dialog"))
const AddClipDialog = lazy(() => import("@/components/add-clip-dialog"))
const DeleteClipsDialog = lazy(() => import("@/components/delete-clips-dialog"))

function PageContent() {
    const [searchQuery, setSearchQuery] = useState("")
    const [searchFocused, setSearchFocused] = useState(false)
    const [curtainsDone, setCurtainsDone] = useState(false)
    const [showSensitive, setShowSensitive] = useState(false)
    const [searchVisible, setSearchVisible] = useState(false)
    const [isSmallScreen, setIsSmallScreen] = useState(false)

    const { clips, soundOn, hideContent, clipsLoaded, activeLabels, autoHideSensitive, isMiniClip, isQuickPaste, requestQuickPaste } = useClips()
    const searchInputRef = useRef<HTMLInputElement>(null)
    const searchBarRef = useRef<HTMLDivElement>(null)
    const searchToggleBtnRef = useRef<HTMLButtonElement>(null)

    // --- Hooks: extracted logic (testable without rendering) ---

    const { version, updateInfo, showUpdateDialog, setShowUpdateDialog, checkForUpdates } = useUpdateCheck()
    // Debounce the query fed to the backend search so it only runs once the
    // user pauses typing (~200ms), not on every keystroke.
    const debouncedSearchQuery = useDebounce(searchQuery, 200)
    const filteredClips = useSearchClips({ clips, searchQuery: debouncedSearchQuery, activeLabels })
    // Meaning search fallback: fires only when a normal search finds nothing
    // and the user accepts the native "search by meaning" prompt.
    const { offer: semanticOffer, semanticClips, semanticPending, runSemanticSearch, dismissSemanticSearch } = useSemanticSearch(searchQuery)

    const toggleSearchVisible = () => {
        setSearchVisible(v => {
            const next = !v
            if (next) setTimeout(() => searchInputRef.current?.focus(), 50)
            return next
        })
    }

    const { suppressSearchForNav, navCooldown, barShown } = useNavHide(searchVisible)
    const { selectedIndex, hiddenCount, handleSelect, registerPaste } = useKeyboardNav({
        isSmallScreen, isMiniClip, isQuickPaste,
        filteredClips, showSensitive,
        searchVisible, toggleSearchVisible, suppressSearchForNav,
        navCooldown,
        searchInputRef,
    })

    // --- Effects: render-tied concerns ---

    // Track md breakpoint (768px)
    useEffect(() => {
        const mq = window.matchMedia("(max-width: 767px)")
        setIsSmallScreen(mq.matches)
        const onChange = (e: MediaQueryListEvent) => setIsSmallScreen(e.matches)
        mq.addEventListener("change", onChange)
        return () => mq.removeEventListener("change", onChange)
    }, [])

    // Typing in search filters the list - jump back to the top so the first
    // matching clip is visible.
    useEffect(() => {
        window.scrollTo(0, 0)
    }, [searchQuery])

    // Quick Paste re-summon (Ctrl+Shift+V after a paste hid the window): jump
    // to the Recent section so the freshest clips are in view, and focus the
    // most recent clip - the one at the top of the section.
    //
    // A ref (reassigned on every render) lets the handler read fresh clip data
    // without re-subscribing to the event whenever the clips list changes.
    const recentFocusIndexRef = useRef(-1)
    recentFocusIndexRef.current =
        filteredClips.recent.length > 0
            ? filteredClips.pinned.length + (showSensitive ? filteredClips.hiddenPinned.length : 0)
            : -1

    useEffect(() => {
        const off = Events.On("window:quickpaste-shown", () => {
            document.getElementById("recent-section")?.scrollIntoView({ block: "start" })
            if (recentFocusIndexRef.current >= 0) {
                handleSelect(recentFocusIndexRef.current)
            }
        })
        return off
    }, [handleSelect])

    // Close sticky search bar when clicking outside it (and outside its toggle button)
    useEffect(() => {
        if (!searchVisible) return
        const handlePointerDown = (e: PointerEvent) => {
            const target = e.target as Node
            if (searchBarRef.current?.contains(target)) return
            if (searchToggleBtnRef.current?.contains(target)) return
            setSearchVisible(false)
        }
        document.addEventListener('pointerdown', handlePointerDown)
        return () => document.removeEventListener('pointerdown', handlePointerDown)
    }, [searchVisible])

    // Keep the latest "utility mode" flag for the entrance animation without
    // re-running it when the mode flips (so exiting Mini Clip back into full
    // screen never replays the curtain).
    const utilityModeRef = useRef(false)
    utilityModeRef.current = isMiniClip || isQuickPaste

    // Curtain entrance animation
    useGSAP(() => {
        if (!clipsLoaded) return;
        // Mini Clip / Quick Paste are utility modes - skip the paper-curtain
        // entrance entirely. Once the window is hidden to the tray the WebView
        // stops ticking rAF, so a running timeline stalls mid-flight and
        // resumes on the next hotkey summon (the "freezes at first" jank).
        if (utilityModeRef.current) {
            setCurtainsDone(true)
            return
        }
        const tl = gsap.timeline({
            onComplete: () => {
                gsap.set('.pussy', { clearProps: 'transform' })
                gsap.set('h1, .torn-input', { clearProps: 'all' })
                setCurtainsDone(true)
            }
        });
        tl.to('.paper-curtain-1', {
            left: "-53vw", duration: 1.5, ease: "steps(12)", rotation: -2,
            onStart: () => playSound('paper-curtain-sound.mp3', soundOn, 1)
        })
            .to('.paper-curtain-2', {
                right: '-53vw', duration: 1.5, ease: "steps(9)", rotation: 2,
            }, '-=1.5')
            .to('.paper-curtain-1', { rotation: 0, duration: 0.3, ease: "power2.out" }, '-=0.3')
            .to('.paper-curtain-2', { rotation: 0, duration: 0.3, ease: "power2.out" }, '-=0.3')
            .from('.pussy', {
                y: '120%', x: '-20%', rotation: -15, scale: 0.8, ease: "steps(12)"
            }, "-=0.7")
            .to('.pussy', {
                rotation: 0, scale: 1, x: '0%', duration: 0.4, ease: "elastic.out(1, 0.6)"
            }, '-=0.2')
            .from('h1, .torn-input', {
                opacity: 0, y: 20, rotation: -1, duration: 0.5, stagger: 0.15, ease: "back.out(1.5)"
            }, '-=0.5')
            .to('h1, .torn-input', { rotation: 0, duration: 0.3, ease: "power2.out" })
    }, [clipsLoaded])

    // Entering Mini Clip or Quick Paste: hard-stop and clean up every
    // animation at the mode switch. A window hidden to the tray leaves rAF
    // throttled, so any in-flight timeline stalls and would resume frozen on
    // the next re-show - killing it here keeps the first paint after a hotkey
    // summon clean.
    useEffect(() => {
        if (!isMiniClip && !isQuickPaste) return
        killAllAnimations()
        setCurtainsDone(true)
    }, [isMiniClip, isQuickPaste])

    // Sticky search bar GSAP animation
    useGSAP(() => {
        const bar = searchBarRef.current
        if (!bar) return
        if (barShown) {
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
                    if (!searchVisible) setSearchQuery("")
                }
            })
        }
    }, [searchVisible, barShown])

    // Onboarding tour
    useEffect(() => {
        if (!hasSeenTour()) {
            const t = setTimeout(startTour, 2200)
            return () => clearTimeout(t)
        }
    }, [])

    // --- Render ---

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
                                Download
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

            {/* pussy cat image */}
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
                {/* Header: info (left), search (center), label filter (right) */}
                <div className="mb-10 flex items-center gap-4 justify-between">
                    {/* Left - about / version or command palette trigger */}
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

                    {/* Center - search (full bar in normal mode only) */}
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

                    {/* Right - search toggle + quick paste + sensitive toggle + label filter */}
                    <div className="shrink-0 flex items-center gap-2">
                        {(isSmallScreen || isMiniClip || isQuickPaste) && (
                            <button
                                ref={searchToggleBtnRef}
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

                {/* Sticky search bar - small screen / mini/quickpaste mode */}
                {/* Outer wrapper stays 0-height so it never reserves flow space (stuck or not);
                    overflow-visible lets the animated bar overlay the content below instead of pushing it down. */}
                {(isSmallScreen || isMiniClip || isQuickPaste) && (
                    <div
                        ref={searchBarRef}
                        className="sticky top-8 md:top-10 -mx-6 md:-mx-10 z-20 px-6 md:px-10"
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

                {/* Pinned Section */}
                {(filteredClips.pinned.length > 0 || (showSensitive && filteredClips.hiddenPinned.length > 0)) && (
                    <section className={isMiniClip ? "mb-4" : "mb-12"}>
                        <div className="flex items-center gap-8 mb-4">
                            <h2 className="sm:flex hidden items-center gap-2 text-2xl font-bold text-foreground">
                                <img
                                    src="/pin-doodle.svg"
                                    alt=""
                                    draggable={false}
                                    className="h-7 w-auto -mt-0.5 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:rotate-6 motion-reduce:transition-none motion-reduce:transform-none"
                                />
                                <span className="italic">Pinned <span className="text-xl"> ({filteredClips.pinned.length + (showSensitive ? filteredClips.hiddenPinned.length : 0)}) </span></span>
                            </h2>
                        </div>
                        {isMiniClip ? (
                            <div className="flex flex-col gap-3">
                                {filteredClips.pinned.map((clip, i) => (
                                    <ClipListItem key={clip.id} clip={clip} index={i} isSelected={i === selectedIndex} onSelect={handleSelect} onPasteReady={registerPaste} />
                                ))}
                                {showSensitive && filteredClips.hiddenPinned.map((clip, i) => {
                                    const idx = filteredClips.pinned.length + i
                                    return <ClipListItem key={clip.id} clip={clip} revealed index={idx} isSelected={idx === selectedIndex} onSelect={handleSelect} onPasteReady={registerPaste} />
                                })}
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

                {/* Recent Section */}
                {(filteredClips.recent.length > 0 || (showSensitive && filteredClips.hiddenRecent.length > 0)) && (
                    <section id="recent-section" className="scroll-mt-[140px]">
                        <div className="flex items-center gap-8 mb-4">
                            <h2 className=" sm:flex hidden items-center gap-2 text-2xl font-bold text-foreground">
                                <img
                                    src="/recent-doodle.svg"
                                    alt=""
                                    draggable={false}
                                    className="h-7 w-auto -mt-0.5 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:rotate-6 motion-reduce:transition-none motion-reduce:transform-none"
                                />
                                <span className="italic">Recent <span className="text-xl"> ({filteredClips.recent.length + (showSensitive ? filteredClips.hiddenRecent.length : 0)}) </span></span>
                            </h2>
                        </div>
                        {isMiniClip ? (
                            <div className="flex flex-col gap-3">
                                {filteredClips.recent.map((clip, i) => {
                                    const idx = filteredClips.pinned.length + (showSensitive ? filteredClips.hiddenPinned.length : 0) + i
                                    return <ClipListItem key={clip.id} clip={clip} index={idx} isSelected={idx === selectedIndex} onSelect={handleSelect} onPasteReady={registerPaste} />
                                })}
                                {showSensitive && filteredClips.hiddenRecent.map((clip, i) => {
                                    const idx = filteredClips.pinned.length + filteredClips.hiddenPinned.length + filteredClips.recent.length + i
                                    return <ClipListItem key={clip.id} clip={clip} revealed index={idx} isSelected={idx === selectedIndex} onSelect={handleSelect} onPasteReady={registerPaste} />
                                })}
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

                {/* Floating action buttons - Add Clip + Delete */}
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

                {/* Meaning search results - shown when a normal search found
                    nothing and the user chose to search by meaning */}
                {semanticClips && semanticClips.length > 0 && (
                    <section className={isMiniClip ? "mb-4" : "mb-12"}>
                        <div className="flex items-center gap-8 mb-4">
                            <h2 className="sm:flex hidden items-center gap-2 text-2xl font-bold text-foreground">
                                <img
                                    src="/recent-doodle.svg"
                                    alt=""
                                    draggable={false}
                                    className="h-7 w-auto -mt-0.5 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:rotate-6 motion-reduce:transition-none motion-reduce:transform-none"
                                />
                                <span className="italic">Matched by meaning <span className="text-xl"> ({semanticClips.length}) </span></span>
                            </h2>
                        </div>
                        {isMiniClip ? (
                            <div className="flex flex-col gap-3">
                                {semanticClips.map((clip, i) => (
                                    <ClipListItem key={clip.id} clip={clip} index={i} isSelected={i === selectedIndex} onSelect={handleSelect} onPasteReady={registerPaste} />
                                ))}
                            </div>
                        ) : (
                            <div className="free-form-grid-container">
                                {semanticClips.map((clip, i) => (
                                    <ClipCard key={clip.id} clip={clip} type="recent" initialVisible={i < 25} />
                                ))}
                            </div>
                        )}
                    </section>
                )}

                {/* Meaning search offer / in progress / empty state - these are
                    mutually exclusive. The offer only appears after a normal
                    search came up empty, and "Searching by meaning..." only
                    shows after the user accepts the offer. */}
                {filteredClips.pinned.length === 0 && filteredClips.recent.length === 0
                    && (!showSensitive || (filteredClips.hiddenPinned.length === 0 && filteredClips.hiddenRecent.length === 0))
                    && !(semanticClips && semanticClips.length > 0)
                    && (
                        semanticOffer ? (
                            <div className="flex-col h-64 text-black flex items-center justify-center gap-4 px-6">
                                <p className="text-lg text-black text-center">
                                    No exact matches found. Want me to search by meaning instead?
                                </p>
                                <div className="flex flex-wrap items-center justify-center gap-3">
                                    <button
                                        onClick={runSemanticSearch}
                                        className="rounded px-4 py-1.5 text-sm bg-foreground text-white hover:opacity-80 transition-opacity"
                                    >
                                        Search by meaning
                                    </button>
                                    <button
                                        onClick={dismissSemanticSearch}
                                        className="rounded px-4 py-1.5 text-sm bg-foreground/5 hover:bg-foreground/10 transition-colors"
                                    >
                                        Dismiss
                                    </button>
                                </div>
                            </div>
                        ) : semanticPending ? (
                            <div className="flex-col h-64 text-black flex items-center justify-center gap-2">
                                <p className="text-lg text-black text-center">Searching by meaning...</p>
                            </div>
                        ) : (
                            <div className="flex-col h-64 text-black flex items-center justify-center gap-2">
                                <p className="text-lg text-black text-center">
                                    {searchQuery ? "No clips found matching your search" : "No clips yet. Start copying!"}
                                </p>
                            </div>
                        )
                    )}
            </div>
        </main>
    )
}

import { ClipProvider } from "@/contexts/ClipContext"

export default function Page() {
    return (
        <ClipProvider>
            <PageContent />
        </ClipProvider>
    )
}
