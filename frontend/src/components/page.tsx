import { useState, useRef, useEffect, useMemo, lazy, Suspense } from "react"
import { startTour, hasSeenTour } from "@/helpers/onboarding"
import { Search } from "lucide-react"
import ClipCard from "./clip-card"
import { useClips } from "../context/ClipContext"
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { playSound } from "@/helpers/playSound";
import WindowControls from "./window-controls";
import { GetVersion } from "../../wailsjs/go/main/App";

const AboutDialog = lazy(() => import("./about-dialog"))
const AddClipDialog = lazy(() => import("./add-clip-dialog"))

function PageContent() {
    const [searchQuery, setSearchQuery] = useState("")
    const [searchFocused, setSearchFocused] = useState(false)
    const [version, setVersion] = useState("")
    const [curtainsDone, setCurtainsDone] = useState(false)
    const { clips, soundOn, hideContent, clipsLoaded } = useClips()
    const searchInputRef = useRef<HTMLInputElement>(null)

    useGSAP(() => {
        if (!clipsLoaded) return;
        const tl = gsap.timeline({
            onComplete: () => {
                // Remove compositor layers: clear GSAP inline transforms from all
                // animated elements so the browser can de-promote them, and remove
                // the paper curtain images from the DOM entirely — they are full-
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

    useEffect(() => {
        if (!hasSeenTour()) {
            // Small delay so the page entrance animation has finished
            const t = setTimeout(startTour, 2200)
            return () => clearTimeout(t)
        }
    }, [])


    const filteredClips = useMemo(() => {
        const query = searchQuery.toLowerCase()

        if (!query) {
            return {
                pinned: clips.pinned,
                recent: clips.recent,
            }
        }

        return {
            pinned: clips.pinned.filter(
                (clip) =>
                    clip?.content?.toLowerCase().includes(query),
            ),
            recent: clips.recent.filter(
                (clip) =>
                    clip?.content?.toLowerCase().includes(query),
            ),
        }
    }, [searchQuery, clips])

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

            {/* Draggable title bar */}
            <div className="fixed z-10 top-1 left-0 right-0 h-10 cursor-grab" style={{ '--wails-draggable': 'drag' } as React.CSSProperties}></div>
            <WindowControls />
            {!curtainsDone && (
                <>
                    <img src="/paper-curtain.png" className="paper-curtain-1 h-screen fixed w-[53vw] left-0 top-0 bottom-0 z-10 " />
                    <img src="/paper-curtain.png" className="paper-curtain-2 h-screen fixed w-[53vw] -right-8 top-0 bottom-0 z-10 " />
                </>
            )}

            {/* // pussy cat image */}
            <div className="h-[20vh] min-h-25 max-h-50 pussy fixed bottom-0 -left-6 z-1">
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
                {/* Header */}
                <div className="mb-10 sm:flex-row flex justify-center items-center gap-8 sm:justify-between">
                    <div id="tour-about" className="items-center gap-2 sm:flex">
                        <h1 className="font-serif text-xl font-bold italic text-foreground sm:block hidden">About</h1>
                        {
                            version &&
                            <Suspense fallback={null}>
                                <AboutDialog version={version} />
                            </Suspense>
                        }
                    </div>

                    <div className="relative w-full max-w-md torn-input">
                        <div className="tape-1 absolute -top-3 left-0 h-12 w-4 bg-yellow-200/40 rotate-45 rounded-sm shadow-sm"></div>
                        <div className="tape-2 absolute -top-3 right-0 h-12 w-4 bg-yellow-200/40 -rotate-45 rounded-sm shadow-sm"></div>
                        <input
                            id="tour-search"
                            ref={searchInputRef}
                            type="text"
                            placeholder="Search (Ctrl+F)"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onFocus={() => setSearchFocused(true)}
                            onBlur={() => setSearchFocused(false)}
                            className="w-full text-base sm:text-xl px-4 pt-2 text-foreground placeholder-gray-500 focus:outline-none shadow-xl"
                        />
                        <Search className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#c0bdbd]" />
                    </div>
                </div>

                {/* Pinned Section */}
                {filteredClips.pinned.length > 0 && (
                    <section className="mb-12">
                        <div className="flex items-center gap-8 mb-4">
                            <h2 className="sm:flex hidden items-center gap-2 text-2xl font-bold text-foreground">
                                <span className="text-2xl">📌</span>
                                <span className="italic">Pinned <span className="text-xl"> ({filteredClips.pinned.length}) </span></span>
                            </h2>
                            <div id="tour-add-clip" className="sm:m-0 mx-auto mb-2">
                                <Suspense fallback={null}>
                                    <AddClipDialog>
                                        <button className="hover:scale-95 sm:p-2 p-4 rounded-lg! h-auto bg-amber-100 transition-transform hand-drawn-btn dashed thin" title="Add new clip">
                                            <div className="flex items-center sm:gap-2 gap-1 font-bold">
                                                <span className="text-xs leading-0.5">Add Clip</span>
                                                <span className="text-base leading-0.5">+</span>
                                            </div>
                                        </button>
                                    </AddClipDialog>
                                </Suspense>
                            </div>
                        </div>
                        <div className="free-form-grid-container">
                            {filteredClips.pinned.map((clip, i) => (
                                <ClipCard key={clip.id} clip={clip} type="pinned" initialVisible={i < 25} tourId={i === 0 ? "tour-clip-card" : undefined} />
                            ))}
                        </div>
                    </section>
                )}

                {/* Recent Section */}
                {filteredClips.recent.length > 0 && (
                    <section>
                        <div className="flex items-center gap-8 mb-4">
                            <h2 className=" sm:flex hidden items-center gap-2 text-2xl font-bold text-foreground">
                                <span className="text-2xl">📝</span>
                                <span className="italic">Recent <span className="text-xl"> ({filteredClips.recent.length}) </span></span>
                            </h2>
                            <div>
                                <Suspense fallback={null}>
                                    <AddClipDialog triggerClassName="sm:block hidden">
                                        <button className="hover:scale-95 p-2 rounded-lg! h-auto bg-amber-100 transition-transform hand-drawn-btn dashed thin" title="Add new clip">
                                            <div className="flex items-center sm:gap-2 gap-1 font-bold">
                                                <span className="text-xs leading-0.5">Add Clip</span>
                                                <span className="text-base leading-0.5">+</span>
                                            </div>
                                        </button>
                                    </AddClipDialog>
                                </Suspense>
                            </div>
                        </div>
                        <div className="free-form-grid-container">
                            {filteredClips.recent.map((clip, i) => (
                                <ClipCard key={clip.id} clip={clip} type="recent" initialVisible={i < 25} tourId={i === 0 && filteredClips.pinned.length === 0 ? "tour-clip-card" : undefined} />
                            ))}
                        </div>
                    </section>
                )}

                {/* Empty State */}
                {filteredClips.pinned.length === 0 && filteredClips.recent.length === 0 && (
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
