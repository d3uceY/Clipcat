import { useState, useEffect, useRef, useCallback, forwardRef, useOptimistic } from "react";
import { Browser } from "@wailsio/runtime";
import { useClips } from "@/contexts/ClipContext";
import { playSound } from "@/utils/play-sound";
import { UpdateStorageLimit, GetStorageLimit, GetClips, DeleteAllClips, DeletePinnedClips, DeleteUnpinnedClips, GetSyncSettings, SaveSyncSettings, ConfirmDelete } from "../../../../bindings/Clipcat/app";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, Download, Trash2, Save, Eye, EyeOff, AppWindow, ClipboardList, Cpu, ShieldCheck, Network, type LucideIcon } from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import type { UpdateInfo } from "./about-dialog";

gsap.registerPlugin(useGSAP);

type SettingsTab = "window" | "clipboard" | "system" | "privacy" | "network";

interface SettingsPanelProps {
    /** Animated close triggered by the parent's GSAP timeline */
    onClose: () => void;
    /** Forwarded to the Quick Paste switch - parent owns the confirm dialog */
    onQuickPasteToggle: () => void;
    updateAvailable?: UpdateInfo | null;
    onCheckUpdate?: () => Promise<void>;
    platform: string;
    /** True while the panel is open — gates the ink entrance choreography. */
    open?: boolean;
}

/**
 * The full-screen settings panel.
 * Uses forwardRef so the parent (WindowControls) can animate it with GSAP.
 */
const SettingsPanel = forwardRef<HTMLDivElement, SettingsPanelProps>(
    ({ onClose, onQuickPasteToggle, updateAvailable, onCheckUpdate, platform, open = false }, ref) => {
        const {
            soundOn, toggleSound,
            isMiniClip, toggleMiniClip,
            toggleStartup, isStartup,
            hideContent, toggleHideContent,
            clips,
            isPaused, togglePause,
            ignoreList, addIgnoreEntry, removeIgnoreEntry,
            isQuickPaste,
            autoHideSensitive, toggleAutoHideSensitive,
            isCursorSnap, toggleCursorSnap,
            getClips,
        } = useClips();

        const [activeTab, setActiveTab] = useState<SettingsTab>("window");
        const [newIgnoreEntry, setNewIgnoreEntry] = useState("");
        const [limit, setLimit] = useState(100);
        const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

        // Network / LAN sync state
        const [syncEnabled, setSyncEnabled] = useState(false);
        const [syncPassphrase, setSyncPassphrase] = useState("");
        const [syncPeerCount, setSyncPeerCount] = useState(0);
        const [isSyncSaving, setIsSyncSaving] = useState(false);
        const [showPassphrase, setShowPassphrase] = useState(false);


        const [optimisticMiniClip, setOptimisticMiniClip] = useOptimistic(
            isMiniClip,
            (_state, next: boolean) => next
        );

        const handleToggleMiniClip = () => {
            setOptimisticMiniClip(!optimisticMiniClip);
            void toggleMiniClip();
        };

        // --- Animation refs & helpers -----------------------------------------
        const tabStripRef = useRef<HTMLDivElement>(null);
        const tabContentRef = useRef<HTMLDivElement>(null);
        const limitRef = useRef<HTMLSpanElement>(null);
        const ctxSafeRef = useRef<((fn: () => void) => () => void) | null>(null);

        // Local, non-nullable ref for GSAP scoping — stays in sync with the
        // forwarded ref so the parent (WindowControls) can still animate the root.
        const rootRef = useRef<HTMLDivElement>(null);
        const setRootRef = useCallback((el: HTMLDivElement | null) => {
            rootRef.current = el;
            if (typeof ref === "function") ref(el);
            else if (ref) (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
        }, [ref]);

        const prefersReducedMotion = () =>
            typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

        useEffect(() => {
            GetStorageLimit().then(setLimit).catch(() => { });
        }, []);

        useEffect(() => {
            GetSyncSettings().then((s) => {
                setSyncEnabled(s.enabled);
                setSyncPassphrase(s.passphrase);
                setSyncPeerCount(s.peerCount);
            }).catch(() => { });
        }, []);

        const incrementLimit = async () => {
            playSound('/sounds/switch-off.mp3', soundOn, 1);
            const next = Math.min(limit + 50, 500);
            setLimit(next);
            try { await UpdateStorageLimit(next); await GetClips(); }
            catch (e) { console.error("Failed to update storage limit:", e); }
        };

        const decrementLimit = async () => {
            playSound('/sounds/switch-on.mp3', soundOn, 1);
            const next = Math.max(limit - 50, 100);
            setLimit(next);
            try { await UpdateStorageLimit(next); await GetClips(); }
            catch (e) { console.error("Failed to update storage limit:", e); }
        };

        const handleDeleteAllClips = async () => {
            const confirmed = await ConfirmDelete("Are you sure you want to delete ALL clips? This cannot be undone.")
            if (!confirmed) return
            await DeleteAllClips()
            getClips()
        };

        const handleDeletePinnedClips = async () => {
            const confirmed = await ConfirmDelete("Are you sure you want to delete all pinned clips? This cannot be undone.")
            if (!confirmed) return
            await DeletePinnedClips()
            getClips()
        };

        const handleDeleteUnpinnedClips = async () => {
            const confirmed = await ConfirmDelete("Are you sure you want to delete all recent clips? This cannot be undone.")
            if (!confirmed) return
            await DeleteUnpinnedClips()
            getClips()
        };

        const handleAddIgnoreEntry = async () => {
            const name = newIgnoreEntry.trim();
            if (!name) return;
            await addIgnoreEntry(name);
            setNewIgnoreEntry("");
        };

        const handleSaveSyncSettings = async () => {
            setIsSyncSaving(true);
            try {
                await SaveSyncSettings(syncEnabled, syncPassphrase);
                playSound('/sounds/switch-on.mp3', soundOn, 1);
            } catch (e) {
                console.error("Failed to save sync settings:", e);
            } finally {
                setIsSyncSaving(false);
            }
        };

        // ------------------------------------------------------------------
        //  Motion choreography — ink on paper
        // ------------------------------------------------------------------

        // Small rubber-stamp press shared by toggles, steppers and action buttons.
        const press = (el: HTMLElement | null, r = -4, s = 0.78) => {
            if (!el || !ctxSafeRef.current || prefersReducedMotion()) return;
            const run = ctxSafeRef.current(() => {
                gsap.fromTo(
                    el,
                    { scale: s, rotation: r },
                    { scale: 1, rotation: 0, duration: 0.45, ease: "elastic.out(1, 0.5)" }
                );
            });
            run();
        };

        // Entrance: the giant "Settings" writes itself in, the rubber stamp and
        // tape land, then the flags and first page's rows get stamped down.
        // Runs once per open (parent drives open via the `open` prop).
        useGSAP(() => {
            if (!open || prefersReducedMotion()) return;
            const tl = gsap.timeline({ defaults: { ease: "expo.out" } });
            tl.fromTo(
                ".settings-title-char",
                { y: 70, rotation: -10, opacity: 0, transformOrigin: "left bottom" },
                { y: 0, rotation: 0, opacity: 1, duration: 0.6, stagger: 0.05, ease: "expo.out" },
                0.1
            )
                .fromTo(".settings-tagline", { y: 14, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45 }, "-=0.4")
                .fromTo(".settings-stamp", { scale: 0.4, rotation: -24, opacity: 0 }, { scale: 1, rotation: 5, duration: 0.5, ease: "back.out(2.4)" }, "-=0.3")
                .fromTo(".settings-tape", { scaleX: 0, opacity: 0 }, { scaleX: 1, opacity: 1, duration: 0.35, ease: "power3.out", stagger: 0.07 }, "-=0.3")
                .fromTo("[data-tab]", { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, stagger: 0.045 }, "-=0.35")
                .to('[data-tab][data-active="true"]', { y: -3, scale: 1.06, rotation: 0, duration: 0.4, ease: "back.out(1.5)" }, "-=0.3")
                .fromTo(
                    ".settings-label",
                    { y: -16, rotation: -6, opacity: 0, transformOrigin: "left top" },
                    { y: 0, rotation: 0, opacity: 1, duration: 0.45, ease: "back.out(2)" },
                    "-=0.2"
                )
                .fromTo(
                    ".settings-row",
                    { y: 24, rotation: 1.2, opacity: 0, transformOrigin: "left center" },
                    { y: 0, rotation: 0, opacity: 1, duration: 0.5, ease: "back.out(1.7)", stagger: 0.06 },
                    "-=0.3"
                );
        }, { dependencies: [open], scope: rootRef, revertOnUpdate: true });

        // Tab switch: settle the flags and stamp the new page's rows in.
        useGSAP(() => {
            if (!open || prefersReducedMotion()) return;

            if (tabStripRef.current) {
                const tabs = Array.from(tabStripRef.current.querySelectorAll<HTMLElement>("[data-tab]"));
                tabs.forEach((tab) => {
                    const tilt = parseFloat(tab.dataset.tilt || "0");
                    const active = tab.dataset.active === "true";
                    gsap.to(tab, {
                        y: active ? -3 : 0,
                        rotation: active ? 0 : tilt,
                        scale: active ? 1.06 : 1,
                        duration: 0.45,
                        ease: "back.out(1.5)",
                        overwrite: "auto",
                    });
                });
            }

            if (tabContentRef.current) {
                gsap.fromTo(
                    tabContentRef.current,
                    { opacity: 0, y: 6, rotation: 0.5, scale: 0.99, transformOrigin: "center top" },
                    { opacity: 1, y: 0, rotation: 0, scale: 1, duration: 0.28, ease: "power2.out" }
                );
            }
            gsap.fromTo(
                ".settings-label",
                { y: -16, rotation: -6, opacity: 0, transformOrigin: "left top" },
                { y: 0, rotation: 0, opacity: 1, duration: 0.45, ease: "back.out(2)" }
            );
            gsap.fromTo(
                ".settings-row",
                { y: 24, rotation: 1.2, opacity: 0, transformOrigin: "left center" },
                { y: 0, rotation: 0, opacity: 1, duration: 0.5, ease: "back.out(1.7)", stagger: 0.06, delay: 0.06 }
            );
        }, { dependencies: [activeTab], scope: rootRef, revertOnUpdate: true });

        // Magnetic tab flags + resting tilt. Attach once for the panel's lifetime
        // so switching tabs never rebuilds listeners.
        useGSAP((_ctx, contextSafe) => {
            if (contextSafe) ctxSafeRef.current = contextSafe;
            const strip = tabStripRef.current;
            if (!strip) return;
            const tabs = Array.from(strip.querySelectorAll<HTMLElement>("[data-tab]"));
            if (tabs.length === 0) return;

            tabs.forEach((tab) => {
                const tilt = parseFloat(tab.dataset.tilt || "0");
                const active = tab.dataset.active === "true";
                gsap.set(tab, { rotation: active ? 0 : tilt, y: active ? -3 : 0, scale: active ? 1.06 : 1 });
            });

            if (!contextSafe) return;
            if (!window.matchMedia("(hover: hover)").matches || prefersReducedMotion()) return;

            const cleanups: Array<() => void> = [];
            tabs.forEach((tab) => {
                // gsap.quickTo reuses a single tween per property instead of
                // creating a new tween on every mousemove — much cheaper.
                const xTo = gsap.quickTo(tab, "x", { duration: 0.35, ease: "power2.out" });
                const rotTo = gsap.quickTo(tab, "rotation", { duration: 0.35, ease: "power2.out" });

                const move = (e: MouseEvent) => {
                    const rect = tab.getBoundingClientRect();
                    const dx = e.clientX - (rect.left + rect.width / 2);
                    const tilt = parseFloat(tab.dataset.tilt || "0");
                    xTo(dx * 0.22);
                    rotTo(tilt + dx * 0.05);
                };
                const leave = contextSafe(() => {
                    const tilt = parseFloat(tab.dataset.tilt || "0");
                    const active = tab.dataset.active === "true";
                    gsap.to(tab, {
                        x: 0,
                        rotation: active ? 0 : tilt,
                        y: active ? -3 : 0,
                        scale: active ? 1.06 : 1,
                        duration: 0.55,
                        ease: "elastic.out(1, 0.4)",
                    });
                });
                tab.addEventListener("mousemove", move);
                tab.addEventListener("mouseleave", leave);
                cleanups.push(() => {
                    tab.removeEventListener("mousemove", move);
                    tab.removeEventListener("mouseleave", leave);
                });
            });
            return () => cleanups.forEach((fn) => fn());
        }, { scope: tabStripRef });

        // The limit number "ticks" whenever the stepper changes it.
        useGSAP(() => {
            const el = limitRef.current;
            if (!el || prefersReducedMotion()) return;
            gsap.fromTo(el, { scale: 1.35, rotation: -3 }, { scale: 1, rotation: 0, duration: 0.45, ease: "back.out(2.5)" });
        }, { dependencies: [limit] });

        const hasClips = () => clips.recent.length > 0 || clips.pinned.length > 0;

        //  Reusable: hand-drawn toggle — the whole switch "flicks" with a press
        const Toggle = ({ on, toggle, disabled }: { on: boolean; toggle: () => void; disabled?: boolean }) => {
            const btnRef = useRef<HTMLButtonElement>(null);
            return (
                <button
                    ref={btnRef}
                    onClick={() => {
                        playSound(on ? '/sounds/switch-on.mp3' : '/sounds/switch-off.mp3', soundOn, 1);
                        if (disabled) return;
                        press(btnRef.current, on ? -8 : 8);
                        toggle();
                    }}
                    className="menu-switch-container relative block h-6 shrink-0 rounded disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-amber-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#F9F5E6] focus-visible:outline-none"
                    disabled={disabled}
                    aria-pressed={on}
                >
                    {on
                        ? <img src="/on.png" alt="" className="block h-full drop-shadow-[0_2px_2px_rgba(0,0,0,0.25)]" />
                        : <img src="/off.png" alt="" className="block h-full drop-shadow-[0_2px_2px_rgba(0,0,0,0.25)]" />}
                </button>
            );
        };

        //  Reusable: a single setting row — stamped onto the ruled page
        const Row = ({ label, desc, children }: { label: string; desc?: React.ReactNode; children: React.ReactNode }) => (
            <div className="settings-row flex items-center justify-between gap-3 py-3 border-b border-dashed border-foreground/10 last:border-0">
                <div className="flex-1 min-w-0">
                    <p className="text-sm! leading-snug">{label}</p>
                    {desc && <p className="text-[11px]! opacity-45 mt-0.5 leading-snug">{desc}</p>}
                </div>
                <div className="shrink-0">{children}</div>
            </div>
        );

        //  Separator
        const Sep = ({ narrow }: { narrow?: boolean }) => (
            <div className={`my-3 ${narrow ? "w-1/2 mx-auto" : ""}`}>
                <img src="/seperator.png" alt="" className="w-full opacity-40" />
            </div>
        );

        //  Section label — a torn strip of washi tape, same trick as the tape
        //  squares on the home page search bar
        const SectionLabel = ({ children }: { children: React.ReactNode }) => (
            <div className="settings-label relative inline-block mb-3 mt-1">
                <span className="absolute -inset-x-1.5 inset-y-0.5 -rotate-1 bg-amber-200/50 rounded-[2px]" />
                <p className="relative text-[10px]! uppercase tracking-widest font-bold text-amber-900/70 px-0.5">{children}</p>
            </div>
        );

        //  Storage limit stepper
        const LimitStepper = () => (
            <div className="flex flex-col items-center">
                <button
                    className="block w-4 -rotate-90 rounded disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-amber-500/60 focus-visible:outline-none"
                    onClick={(e) => { press(e.currentTarget, -8); incrementLimit(); }}
                    disabled={limit >= 500}
                    aria-label="Increase clip limit"
                >
                    <img src="/arrow.png" alt="increase" className="h-full block" />
                </button>
                <span ref={limitRef} className="inline-block text-sm! text-center tabular-nums">{limit}</span>
                <button
                    className="block w-4 rotate-90 rounded disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-amber-500/60 focus-visible:outline-none"
                    onClick={(e) => { press(e.currentTarget, 8); decrementLimit(); }}
                    disabled={limit <= 100}
                    aria-label="Decrease clip limit"
                >
                    <img src="/arrow.png" alt="decrease" className="h-full block" />
                </button>
            </div>
        );

        //  Action button — a quick rubber-stamp press
        const ActionBtn = ({ onClick, children, disabled }: {
            onClick: () => void; children: React.ReactNode; disabled?: boolean
        }) => (
            <button
                onClick={(e) => { if (disabled) return; press(e.currentTarget, 2, 0.92); onClick(); }}
                disabled={disabled}
                className="flex items-center gap-1 text-xs! px-2 py-1 hand-drawn-btn lined thin font-bold hover:opacity-70 transition-opacity disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-amber-500/60 focus-visible:ring-offset-1 focus-visible:outline-none"
            >
                {children}
            </button>
        );

        const tabs: SettingsTab[] = ["window", "clipboard", "system", "privacy", "network"];

        const tabIcons: Record<SettingsTab, LucideIcon> = {
            window: AppWindow,
            clipboard: ClipboardList,
            system: Cpu,
            privacy: ShieldCheck,
            network: Network,
        };

        const tabAccent: Record<SettingsTab, string> = {
            window: "text-[#41403e] bg-[#F9F5E6]",
            clipboard: "text-amber-900 bg-amber-100",
            system: "text-[#41403e] bg-[#F9F5E6]",
            privacy: "text-rose-900 bg-rose-100",
            network: "text-blue-900 bg-blue-100",
        };
        // A hair of rotation per tab so the row reads like a set of hand-stuck
        // paper flags rather than a uniform machined tab strip.
        const tabTilt = [-1, 0.6, -0.5, 0.8, -0.6];

        const activeDot = (id: SettingsTab) => {
            if (id === "privacy" && ignoreList.length > 0) return ignoreList.length;
            if (id === "network" && syncEnabled && syncPeerCount > 0) return syncPeerCount;
            if (id === "system" && updateAvailable) return "!";
            return null;
        };

        return (
            <div
                ref={setRootRef}
                className="setting-dialog relative z-10 flex flex-col
                           w-full h-full
                           md:w-[74vw] max-w-200 md:h-[74vh]"
            >
                {/* Notebook margin rule - the same red ruling used on the clip
                    detail page, so Settings still reads as a page from the
                    same notebook rather than a separate UI system. */}
                <div className="margin hidden sm:block opacity-30" style={{ left: "2.25rem" }} />

                {/* Washi tape holding the page to the backdrop — bigger on desktop.
                    The extra height grows upward into the empty backdrop space, so
                    the tapes never cover the title, stamp, close button or tab bar. */}
                <div className="settings-tape pointer-events-none absolute -top-2.5 left-6 z-2 h-5 w-14 -rotate-6 rounded-[2px] bg-amber-200/40 shadow-sm md:-top-7 md:left-8 md:h-12 md:w-24" />
                <div className="settings-tape pointer-events-none absolute -top-2.5 right-8 z-2 h-5 w-14 rotate-6 rounded-[2px] bg-amber-200/40 shadow-sm md:-top-7 md:right-10 md:h-12 md:w-24" />

                {/*  Header — giant ink title, rubber stamp + close  */}
                <header className="relative z-1 shrink-0 px-10 max-sm:px-6 pt-9 pb-1">
                    <div className="flex items-start justify-between gap-4">
                        <div className="relative min-w-0">
                            <h2
                                aria-label="Settings"
                                className="settings-title -rotate-1 font-bold leading-none tracking-tight text-foreground"
                                style={{ fontSize: "clamp(2.5rem, 6.5vw, 4rem)" }}
                            >
                                {"Settings".split("").map((ch, i) => (
                                    <span key={i} className="settings-title-char inline-block" aria-hidden="true">
                                        {ch === " " ? "\u00A0" : ch}
                                    </span>
                                ))}
                            </h2>
                            <p className="settings-tagline mt-1.5 pl-1.5 text-[12px]! italic opacity-40">
                                a fresh page for every tweak
                            </p>
                            <div className="settings-tape absolute -bottom-2.5 left-2 z-0 h-4 w-24 -rotate-2 rounded-[2px] bg-amber-200/40 shadow-sm" />
                        </div>

                        <div className="flex items-start gap-3">
                            <span className="settings-stamp mt-1 hidden rotate-3 items-center rounded-sm border-2 border-dashed border-red-400/50 px-2 py-0.5 text-[10px]! font-bold uppercase tracking-widest text-red-400/70 sm:inline-flex">
                                Clipcat
                            </span>
                            <button
                                onClick={onClose}
                                aria-label="Close settings"
                                className="bg-[#F8F5F0] flex h-8 w-8 items-center justify-center hand-drawn-btn lined thin text-sm! font-bold transition-all hover:rotate-90 hover:opacity-70 focus-visible:ring-2 focus-visible:ring-amber-500/60 focus-visible:outline-none"
                            >
                                x
                            </button>
                        </div>
                    </div>
                </header>

                {/*  Tab bar — paper flags, magnetic on hover  */}
                <div ref={tabStripRef} className="relative z-1 px-10 max-sm:px-5 shrink-0">
                    <div className="flex items-end gap-1.5 flex-wrap pb-1">
                        {tabs.map((id, i) => {
                            const dot = activeDot(id);
                            const isActive = activeTab === id;
                            const Icon = tabIcons[id];
                            return (
                                <button
                                    key={id}
                                    data-tab
                                    data-tilt={tabTilt[i]}
                                    data-active={isActive ? "true" : "false"}
                                    onClick={() => setActiveTab(id)}
                                    className={`relative flex items-center gap-1.5 text-[11px]! px-3 py-1.5 capitalize transition-colors hand-drawn-btn will-change-transform focus-visible:ring-2 focus-visible:ring-amber-500/60 focus-visible:outline-none ${
                                        isActive
                                            ? `font-bold lined thin ${tabAccent[id]} shadow-[0_8px_16px_-8px_rgba(0,0,0,0.35)]`
                                            : "opacity-45 hover:opacity-75"
                                    }`}
                                >
                                    <Icon size={12} strokeWidth={2.5} className="shrink-0" />
                                    <span className="leading-none">{id}</span>
                                    {dot && (
                                        <span className={`ml-0.5 flex min-w-3.5 h-3.5 items-center justify-center rounded-full px-0.5 text-[9px]! font-bold leading-none ${
                                            dot === "!" ? "bg-red-500/25 text-red-700" : "bg-current/15"
                                        }`}>
                                            {dot}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                    <Sep narrow />
                </div>

                {/*  Tab content  */}
                <ScrollArea className="relative z-1 flex-1 min-h-0 px-12 max-sm:px-8 pb-6">
                    <div key={activeTab} ref={tabContentRef}>

                    {/* â•â•â•â•â•â• WINDOW â•â•â•â•â•â• */}
                    {activeTab === "window" && (
                        <div className="pt-3">
                            <Row label="Mini Clip" desc={<>Compact window that stays out of your way. <kbd className="text-[10px] px-1 py-0.5 bg-foreground/10 rounded">Alt+M</kbd> to toggle.</>}>
                                <Toggle on={optimisticMiniClip} toggle={handleToggleMiniClip} />
                            </Row>
                            <Row
                                label="Smart Position"
                                desc={isQuickPaste ? "Summon next to your cursor when Quick Paste activates." : "Requires Quick Paste to be enabled."}
                            >
                                <Toggle on={isCursorSnap} toggle={toggleCursorSnap} disabled={!isQuickPaste} />
                            </Row>
                        </div>
                    )}

                    {/* â•â•â•â•â•â• CLIPBOARD â•â•â•â•â•â• */}
                    {activeTab === "clipboard" && (
                        <div className="pt-3">
                            <Row label="Pause Capture" desc="Temporarily stop recording clipboard changes.">
                                <Toggle on={isPaused} toggle={togglePause} />
                            </Row>
                            <Row label="Hide Content" desc={<>Blur all clip content. <kbd className="text-[10px] px-1 py-0.5 bg-foreground/10 rounded">Alt+H</kbd> to toggle.</>}>
                                <Toggle on={hideContent} toggle={toggleHideContent} disabled={!hasClips()} />
                            </Row>
                            <Row label="Auto-hide Sensitive" desc="Collapse clips that look like passwords, API keys, or tokens.">
                                <Toggle on={autoHideSensitive} toggle={toggleAutoHideSensitive} />
                            </Row>
                            <Row label="Clipboard Limit" desc="How many clips to keep. Older unpinned clips are removed when the limit is reached.">
                                <LimitStepper />
                            </Row>
                        </div>
                    )}

                    {/* â•â•â•â•â•â• SYSTEM â•â•â•â•â•â• */}
                    {activeTab === "system" && (
                        <div className="pt-3">
                            <Row label="Sound" desc={<>Audio feedback on every action. <kbd className="text-[10px] px-1 py-0.5 bg-foreground/10 rounded">Alt+S</kbd> to toggle.</>}>
                                <Toggle on={soundOn} toggle={toggleSound} />
                            </Row>
                            <Row label="Load on Startup" desc="Launch Clipcat automatically when your system starts.">
                                <Toggle on={isStartup} toggle={toggleStartup} />
                            </Row>
                            <Row
                                label="Quick Paste"
                                desc={<>
                                    Hides to the tray. <kbd className="text-[10px] px-1 py-0.5 bg-foreground/10 rounded">{platform === "darwin" ? "âŒ˜" : "Ctrl"}+Shift+V</kbd> summons it, pick a clip, it pastes and vanishes.
                                </>}
                            >
                                <Toggle on={isQuickPaste} toggle={onQuickPasteToggle} />
                            </Row>

                            <Sep narrow />

                            <SectionLabel>Updates</SectionLabel>
                            {updateAvailable ? (
                                <div className="space-y-2 py-1">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                                        <p className="text-sm! font-semibold">Update Available</p>
                                    </div>
                                    <p className="text-xs! opacity-50">
                                        Version <strong>{updateAvailable.version}</strong> is ready.
                                        {updateAvailable.releaseDate && <> Released {new Date(updateAvailable.releaseDate).toLocaleDateString()}.</>}
                                    </p>
                                    <button
                                        onClick={() => Browser.OpenURL('https://d3ucey.github.io/Clipcat/download')}
                                        className="inline-flex items-center gap-1.5 hand-drawn-btn lined thin text-xs! px-2 py-1 font-bold hover:opacity-70 transition-opacity"
                                    >
                                        <Download size={11} /> Download Update
                                    </button>
                                </div>
                            ) : (
                                <Row label="Check for Updates" desc="See if a new version is available.">
                                    <ActionBtn
                                        onClick={async () => { if (!onCheckUpdate) return; setIsCheckingUpdate(true); await onCheckUpdate(); setIsCheckingUpdate(false); }}
                                        disabled={isCheckingUpdate || !onCheckUpdate}
                                    >
                                        <RefreshCw size={11} className={isCheckingUpdate ? "animate-spin" : ""} />
                                        {isCheckingUpdate ? "Checking" : "Check"}
                                    </ActionBtn>
                                </Row>
                            )}
                        </div>
                    )}

                    {/* â•â•â•â•â•â• PRIVACY â•â•â•â•â•â• */}
                    {activeTab === "privacy" && (
                        <div className="pt-3">
                            <SectionLabel>Clear History</SectionLabel>
                            <Row label="Delete Recents">
                                <ActionBtn onClick={handleDeleteUnpinnedClips}><Trash2 size={11} /> Delete</ActionBtn>
                            </Row>
                            <Row label="Delete Pinned">
                                <ActionBtn onClick={handleDeletePinnedClips}><Trash2 size={11} /> Delete</ActionBtn>
                            </Row>
                            <Row label="Delete All">
                                <ActionBtn onClick={handleDeleteAllClips}><Trash2 size={11} /> Delete</ActionBtn>
                            </Row>

                            <Sep narrow />

                            <SectionLabel>Blocked Apps</SectionLabel>
                            <p className="text-xs! opacity-50 mb-3">Clipboard content from these apps is never captured.</p>
                            <div className="flex gap-1 mb-2">
                                <input
                                    type="text"
                                    value={newIgnoreEntry}
                                    onChange={e => setNewIgnoreEntry(e.target.value)}
                                    onKeyDown={e => e.key === "Enter" && handleAddIgnoreEntry()}
                                    placeholder="Process name, e.g. 1password.exe"
                                    className="flex-1 text-xs! px-2 py-1 border-b border-current bg-transparent focus:outline-none placeholder-gray-400"
                                />
                                <button onClick={handleAddIgnoreEntry} className="text-xs! px-2 font-bold hover:opacity-70 transition-opacity">+</button>
                            </div>
                            {ignoreList.length > 0 && (
                                <ul className="space-y-0.5 mt-1">
                                    {ignoreList.map(entry => (
                                        <li key={entry} className="flex items-center justify-between text-xs! group">
                                            <span className="truncate opacity-70">{entry}</span>
                                            <button
                                                onClick={() => removeIgnoreEntry(entry)}
                                                className="ml-1 shrink-0 opacity-0 group-hover:opacity-50 hover:opacity-100! hover:text-red-600 transition-all text-[10px]!"
                                                title="Remove"
                                            >x</button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    {/* â•â•â•â•â•â• NETWORK â•â•â•â•â•â• */}
                    {activeTab === "network" && (
                        <div className="pt-3">
                            <Row label="LAN Sync" desc="Sync clips with other devices on the same local network. End-to-end encrypted.">
                                <Toggle on={syncEnabled} toggle={() => setSyncEnabled(v => !v)} />
                            </Row>

                            <div className="mt-3 mb-1">
                                <SectionLabel>Passphrase</SectionLabel>
                                <p className="text-xs! opacity-50 mb-3">Every device must use the same passphrase. Data is encrypted in transit.</p>
                                <div className="flex items-center gap-1">
                                    <div className="relative flex-1">
                                        <input
                                            type={showPassphrase ? "text" : "password"}
                                            value={syncPassphrase}
                                            onChange={e => setSyncPassphrase(e.target.value)}
                                            placeholder="Enter a shared passphrase"
                                            disabled={!syncEnabled}
                                            className="w-full text-xs! px-2 py-1 pr-7 border-b border-current bg-transparent focus:outline-none placeholder-gray-400 disabled:opacity-40 [&::-ms-reveal]:hidden [&::-webkit-credentials-auto-fill-button]:hidden"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassphrase(v => !v)}
                                            disabled={!syncEnabled}
                                            className="absolute right-1 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-70 disabled:opacity-20 transition-opacity"
                                            title={showPassphrase ? "Hide passphrase" : "Show passphrase"}
                                        >
                                            {showPassphrase ? <EyeOff size={12} /> : <Eye size={12} />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 flex items-center justify-between">
                                <ActionBtn onClick={handleSaveSyncSettings} disabled={isSyncSaving || (syncEnabled && syncPassphrase.trim() === "")}>
                                    <Save size={11} /> {isSyncSaving ? "Saving" : "Save"}
                                </ActionBtn>
                                {syncEnabled && (
                                    <p className="text-xs! opacity-50">
                                        {syncPeerCount === 0 ? "No peers found" : `${syncPeerCount} peer${syncPeerCount === 1 ? "" : "s"} connected`}
                                    </p>
                                )}
                            </div>
                        </div>
                    )}
                    </div>
                </ScrollArea>

                {/* Paper texture */}
                <img src="/menu-clean.png" alt="" className="settings-bg"/>
            </div>
        );
    }
);

SettingsPanel.displayName = "SettingsPanel";
export default SettingsPanel;
