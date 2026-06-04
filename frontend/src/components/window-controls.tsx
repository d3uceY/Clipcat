import { useRef, useState, useEffect, lazy, Suspense } from "react";
import { WindowIsMaximised, WindowMinimise, WindowUnmaximise, WindowMaximise, Quit, WindowHide } from "../../wailsjs/runtime/runtime";
import { BrowserOpenURL } from "../../wailsjs/runtime/runtime";
import { useClips } from "@/context/ClipContext";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { playSound } from "@/helpers/playSound";
import { UpdateStorageLimit, GetStorageLimit, GetPlatform } from "../../wailsjs/go/main/App";
import { GetClips } from "../../wailsjs/go/main/App";
import { ScrollArea } from "./ui/scroll-area";
import DeleteButton from "./delete-button";
import { Search, Command, ArrowBigUp, EyeOff, Volume2, Minimize2, ClipboardList, RefreshCw, Download } from "lucide-react";
const DeleteClipsDialog = lazy(() => import("./delete-clips-dialog"));
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { UpdateInfo } from "./about-dialog";

interface WindowControlsProps {
    updateAvailable?: UpdateInfo | null;
    onCheckUpdate?: () => Promise<void>;
}

export default function WindowControls({ updateAvailable, onCheckUpdate }: WindowControlsProps) {
    const [fullScreen, setFullScreen] = useState<boolean>(false);
    const [newIgnoreEntry, setNewIgnoreEntry] = useState("");
    const { soundOn, toggleSound, isMiniClip, toggleMiniClip, toggleStartup, isStartup, hideContent, toggleHideContent, clips, isPaused, togglePause, ignoreList, addIgnoreEntry, removeIgnoreEntry, isQuickPaste, toggleQuickPaste, autoHideSensitive, toggleAutoHideSensitive, isAlwaysOnTop, toggleAlwaysOnTop } = useClips();
    const settingBtnRef = useRef<HTMLButtonElement>(null);
    const settingDialogRef = useRef<HTMLDivElement>(null);
    const settingDialogInnerRef = useRef<HTMLDivElement>(null);
    const [dialogOpen, setDialogOpen] = useState<boolean>(false);
    const [limit, setLimit] = useState(100)
    const [showQuickPasteConfirm, setShowQuickPasteConfirm] = useState(false)
    const [platform, setPlatform] = useState<string>("")
    const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
    const [shortcutsOpen, setShortcutsOpen] = useState(false)

    useEffect(() => {
        GetPlatform().then(setPlatform).catch(() => setPlatform(""))
        WindowIsMaximised().then(setFullScreen).catch(() => {})
    }, [])

    const handleQuickPasteToggle = async () => {
        if (isQuickPaste) {
            playSound(isQuickPaste ? '/sounds/switch-on.mp3' : '/sounds/switch-off.mp3', soundOn, 1)
            await toggleQuickPaste()
            if (isMiniClip) {
                await toggleMiniClip()
            }
        } else {
            setShowQuickPasteConfirm(true)
        }
    }

    const confirmEnableQuickPaste = async () => {
        playSound('/sounds/switch-off.mp3', soundOn, 1)
        await toggleQuickPaste()
        if (!isMiniClip) {
            await toggleMiniClip()
        }
        setShowQuickPasteConfirm(false)
        WindowHide()
    }

    useEffect(() => {
        const loadLimit = async () => {
            try {
                const currentLimit = await GetStorageLimit();
                setLimit(currentLimit);
            } catch (error) {
                console.error("Failed to load storage limit:", error);
            }
        };
        loadLimit();
    }, []);

    const incrementLimit = async () => {
        // i know this sound is backwards but it sounds better this way
        playSound('/sounds/switch-off.mp3', soundOn, 1);
        const newLimit = Math.min(limit + 50, 500);
        setLimit(newLimit);
        try {
            await UpdateStorageLimit(newLimit);
            await GetClips();
        } catch (error) {
            console.error("Failed to update storage limit:", error);
        }
    };

    const decrementLimit = async () => {
        // yeah, ik it is backwards
        playSound('/sounds/switch-on.mp3', soundOn, 1);
        const newLimit = Math.max(limit - 50, 100);
        setLimit(newLimit);
        try {
            await UpdateStorageLimit(newLimit);
            await GetClips();
        } catch (error) {
            console.error("Failed to update storage limit:", error);
        }
    };

    const handleAddIgnoreEntry = async () => {
        const name = newIgnoreEntry.trim()
        if (!name) return
        await addIgnoreEntry(name)
        setNewIgnoreEntry("")
    }

    const MenuSwitch = (isOn: boolean, toggleFunction: () => void, disabled = false): React.JSX.Element => {
        const handleToggleFunction = () => {
            playSound(isOn ? '/sounds/switch-on.mp3' : '/sounds/switch-off.mp3', soundOn, 1);
            if (!disabled) {
                toggleFunction();
            }
        }
        return (
            <button onClick={handleToggleFunction} className="menu-switch-container block h-6 shrink-0 disabled:opacity-50" disabled={disabled}>
                {isOn ? <img src="/on.png" alt="" className='block h-full' /> : <img src="/off.png" alt="" className='block h-full' />}
            </button>
        );
    };



    const ClipStorageLimitSwitch = () => {
        return (
            <div className="flex items-center flex-col">
                <button
                    className="block w-4 -rotate-90 disabled:opacity-50"
                    onClick={incrementLimit}
                    disabled={limit >= 500}
                >
                    <img src="/arrow.png" alt="increment" className="h-full block" />
                </button>
                <div className="flex items-center justify-center w-fit">
                    <span className="text-center w-full text-sm">{limit}</span>
                </div>
                <button
                    className="block w-4 rotate-90 disabled:opacity-50"
                    onClick={decrementLimit}
                    disabled={limit <= 100}
                >
                    <img src="/arrow.png" alt="decrement" className="h-full block" />
                </button>
            </div>
        )
    }

    useGSAP(() => {
        gsap.set(
            settingDialogRef.current, {
            display: "none"
        })
    }, [])

    const tlRef = useRef(gsap.timeline());

    const handleSettingsClick = () => {
        const tl = tlRef.current;
        tl.clear();
        if (!dialogOpen) {
            setDialogOpen(true)
            tl.to(settingBtnRef.current, {
                y: 10,
                rotation: -2,
                duration: .3,
                ease: "power2.out",
                onStart: () => playSound('/sounds/crank.mp3', soundOn, 1)
            }).set(
                settingDialogRef.current, {
                display: "flex"
            }).fromTo(
                settingDialogInnerRef.current, {
                opacity: 0,
                y: -20,
                rotation: -2,
                scale: 0.88,
            }, {
                opacity: 1,
                y: 0,
                rotation: 0,
                scale: 1,
                duration: 0.5,
                ease: "back.out(1.2)",
                onStart: () => playSound('/sounds/paper-collect.mp3', soundOn, 1)
            })
        } else {
            setDialogOpen(false)
            tl.to(
                settingDialogInnerRef.current, {
                opacity: 0,
                y: 10,
                rotation: 2,
                scale: 0.95,
                duration: 0.35,
                ease: "power2.in",
                onStart: () => playSound('/sounds/paper-collect.mp3', soundOn, 1)
            })
                .to(settingBtnRef.current, {
                    y: 0,
                    rotation: 0,
                    duration: .3,
                    ease: "elastic.out(1, 0.5)",
                    onStart: () => playSound('/sounds/crank.mp3', soundOn, 1)
                }).set(
                    settingDialogRef.current, {
                    display: "none",
                }).set(
                    settingDialogInnerRef.current, {
                    rotation: 0,
                    scale: 1,
                })
        }
    }

    const Separator = () => {
        return (
            <div>
                <img src="/seperator.png" alt="" className="w-125 mx-auto" />
            </div>
        );
    };




    const handleWindowScreen = async () => {
        const isMax = await WindowIsMaximised();
        if (isMax) {
            WindowUnmaximise();
            setFullScreen(false);
        } else {
            WindowMaximise();
            setFullScreen(true);
        }
    };

    const hasClips = () => {
        return clips.recent.length > 0 || clips.pinned.length > 0;
    }

    return (
        <div className="flex flex-row-reverse items-center fixed z-10 top-0 right-0 md:mr-[2%] md:pt-3 pt-2 mr-2 gap-6">
            <div className="mt-1 relative z-10">
                <button id="tour-settings" onClick={handleSettingsClick} ref={settingBtnRef} className="relative z-10">
                    <img src="/settings.png" alt="close" className="h-5 shadow-md/30" />
                    {updateAvailable && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 border border-white pointer-events-none" />
                    )}
                </button>
                <div ref={settingDialogRef} className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/30" onClick={handleSettingsClick} />
                    <div ref={settingDialogInnerRef} className="setting-dialog relative z-10 w-[90vw] max-w-sm rounded-sm border-0 h-screen! sm:h-[90vh]! max-h-100">
                        <button
                            onClick={handleSettingsClick}
                            className="absolute top-3 bg-[#F8F5F0] right-3 z-10 w-7 h-7 flex items-center justify-center hand-drawn-btn lined thin text-sm font-bold hover:opacity-70"
                        >
                            ✕ 
                        </button>
                        <ScrollArea className="relative z-[1] h-full pt-6 px-6">
                            <h2 className="text-lg text-center">Settings</h2>
                            <Separator />

                            {/* ── Window ── */}
                            <p className="text-[10px] uppercase tracking-widest opacity-40 mt-1 mb-1">Window</p>
                            <div className="flex items-center gap-3 justify-between py-2" title="alt + m to toggle">
                                <p className="sm:text-base text-sm p-0!">Mini Clip</p>
                                <span className="flex-1 border-b border-dashed border-current opacity-20  mb-1 mx-1" />
                                {MenuSwitch(isMiniClip, toggleMiniClip)}
                            </div>
                            <div className="flex items-center gap-3 justify-between py-2" title={isQuickPaste ? "Turn off Quick Paste to use Always on Top" : "Keep the Clipcat window always above other windows"}>
                                <div className="flex flex-col">
                                    <p className="sm:text-base text-sm p-0!">Always on Top</p>
                                    {isQuickPaste && <p className="text-[10px] opacity-50 p-0!">Turn off Quick Paste first</p>}
                                </div>
                                <span className="flex-1 border-b border-dashed border-current opacity-20  mb-1 mx-1" />
                                {MenuSwitch(isAlwaysOnTop, toggleAlwaysOnTop, isQuickPaste)}
                            </div>

                            <Separator />
                            {/* ── Clipboard ── */}
                            <p className="text-[10px] uppercase tracking-widest opacity-40 mt-1 mb-1">Clipboard</p>
                            <div className="flex items-center gap-3 justify-between py-2" title="Pause clipboard capture temporarily">
                                <p className="sm:text-base text-sm p-0!">Pause Capture</p>
                                <span className="flex-1 border-b border-dashed border-current opacity-20  mb-1 mx-1" />
                                {MenuSwitch(isPaused, togglePause)}
                            </div>
                            <div className="flex items-center gap-3 justify-between py-2" title="Limits the number of clipboard items stored">
                                <p className="sm:text-base text-sm p-0!">Clipboard Limit</p>
                                <span className="flex-1 border-b border-dashed border-current opacity-20  mb-1 mx-1" />
                                <ClipStorageLimitSwitch />
                            </div>
                            <div className="flex items-center gap-3 justify-between py-2" title="alt + h to toggle">
                                <p className="sm:text-base text-sm p-0!">Hide Content</p>
                                <span className="flex-1 border-b border-dashed border-current opacity-20  mb-1 mx-1" />
                                {MenuSwitch(hideContent, toggleHideContent, !hasClips())}
                            </div>
                            <div className="flex items-center gap-3 justify-between py-2" title="Automatically hide clipboard items that look like passwords, API keys, or tokens">
                                <p className="sm:text-base text-sm p-0!">Auto-hide Sensitive</p>
                                <span className="flex-1 border-b border-dashed border-current opacity-20  mb-1 mx-1" />
                                {MenuSwitch(autoHideSensitive, toggleAutoHideSensitive)}
                            </div>

                            <Separator />
                            {/* ── System ── */}
                            <p className="text-[10px] uppercase tracking-widest opacity-40 mt-1 mb-1">System</p>
                            <div className="flex items-center gap-3 justify-between py-2" title="alt + s to toggle">
                                <p className="sm:text-base text-sm p-0!">Sound</p>
                                <span className="flex-1 border-b border-dashed border-current opacity-20  mb-1 mx-1" />
                                {MenuSwitch(soundOn, toggleSound)}
                            </div>
                            <div className="flex items-center gap-3 justify-between py-2" title="Enables or disables loading the app on system startup">
                                <p className="sm:text-base text-sm p-0!">Load on Startup</p>
                                <span className="flex-1 border-b border-dashed border-current opacity-20  mb-1 mx-1" />
                                {MenuSwitch(isStartup, toggleStartup)}
                            </div>
                            <div className="flex items-center gap-3 justify-between py-2" title={`Quick Paste: hides to the tray, ${platform === "darwin" ? "Cmd" : "Ctrl"}+Shift+V summons it, paste any clip into the last window you used`}>
                                <p className="sm:text-base text-sm p-0!">Quick Paste</p>
                                <span className="flex-1 border-b border-dashed border-current opacity-20  mb-1 mx-1" />
                                {MenuSwitch(isQuickPaste, handleQuickPasteToggle)}
                            </div>

                            <Separator />
                            {/* ── Updates ── */}
                            <p className="text-[10px] uppercase tracking-widest opacity-40 mt-1 mb-1">Updates</p>
                            {updateAvailable ? (
                                <div className="py-2 space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                                        <p className="sm:text-base text-sm font-semibold">Update Available</p>
                                    </div>
                                    <p className="text-xs text-foreground/60">
                                        Version <strong>{updateAvailable.version}</strong> is ready to download.
                                        {updateAvailable.releaseDate && (
                                            <> Released {new Date(updateAvailable.releaseDate).toLocaleDateString()}.</>
                                        )}
                                    </p>
                                    <button
                                        onClick={() => BrowserOpenURL(updateAvailable.releaseUrl)}
                                        className="inline-flex items-center gap-1.5 hand-drawn-btn lined thin text-xs! px-2 py-1 font-bold hover:opacity-70 transition-opacity"
                                    >
                                        <Download size={11} />
                                        Download Update
                                    </button>
                                </div>
                            ) : (
                                <div className="flex items-center gap-3 justify-between py-2">
                                    <p className="sm:text-base text-sm p-0!">Check for Updates</p>
                                    <span className="flex-1 border-b border-dashed border-current opacity-20 mb-1 mx-1" />
                                    <button
                                        onClick={async () => {
                                            if (!onCheckUpdate) return;
                                            setIsCheckingUpdate(true);
                                            await onCheckUpdate();
                                            setIsCheckingUpdate(false);
                                        }}
                                        disabled={isCheckingUpdate || !onCheckUpdate}
                                        className="flex items-center gap-1 !text-xs px-2 py-1 hand-drawn-btn lined thin font-bold hover:opacity-70 transition-opacity disabled:opacity-40"
                                        title="Check for a new version"
                                    >
                                        <RefreshCw size={11} className={isCheckingUpdate ? "animate-spin" : ""} />
                                        {isCheckingUpdate ? "Checking…" : "Check"}
                                    </button>
                                </div>
                            )}

                            <Separator />
                            {/* ── Shortcuts ── */}
                            <p className="text-[10px] uppercase tracking-widest opacity-40 mt-1 mb-1">Shortcuts</p>
                            <div className="py-1">
                                <button
                                    onClick={() => setShortcutsOpen(o => !o)}
                                    className="flex items-center gap-2 justify-between w-full py-1 hover:opacity-70 transition-opacity"
                                >
                                    <p className="sm:text-base text-sm p-0!">Keyboard Shortcuts</p>
                                    <img
                                        src="/arrow.png"
                                        alt=""
                                        className={`w-3.5 block transition-transform duration-200 ${shortcutsOpen ? "-rotate-90" : "rotate-90"}`}
                                    />
                                </button>
                                {shortcutsOpen && (() => {
                                    const isMac = platform === "darwin";
                                    const Kbd = ({ children }: { children: React.ReactNode }) => (
                                        <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-mono leading-none bg-foreground/10 border border-foreground/25 rounded min-w-4.5">
                                            {children}
                                        </span>
                                    );
                                    const Plus = () => <span className="mx-0.5 text-[10px] opacity-40">+</span>;
                                    const shortcuts: { icon: React.ReactNode; label: string; keys: React.ReactNode[]; note?: string }[] = [
                                        {
                                            icon: <Search size={12} />,
                                            label: "Search",
                                            keys: isMac
                                                ? [<Kbd key="cmd"><Command size={9} /></Kbd>, <Plus key="p1" />, <Kbd key="f">F</Kbd>]
                                                : [<Kbd key="ctrl">Ctrl</Kbd>, <Plus key="p1" />, <Kbd key="f">F</Kbd>],
                                        },
                                        {
                                            icon: <ClipboardList size={12} />,
                                            label: "Open Clipcat",
                                            keys: isMac
                                                ? [<Kbd key="cmd"><Command size={9} /></Kbd>, <Plus key="p1" />, <Kbd key="shift"><ArrowBigUp size={9} /></Kbd>, <Plus key="p2" />, <Kbd key="v">V</Kbd>]
                                                : [<Kbd key="ctrl">Ctrl</Kbd>, <Plus key="p1" />, <Kbd key="shift">Shift</Kbd>, <Plus key="p2" />, <Kbd key="v">V</Kbd>],
                                            note: "Quick Paste mode",
                                        },
                                        {
                                            icon: <Minimize2 size={12} />,
                                            label: "Mini Clip",
                                            keys: [<Kbd key="alt">Alt</Kbd>, <Plus key="p1" />, <Kbd key="m">M</Kbd>],
                                        },
                                        {
                                            icon: <EyeOff size={12} />,
                                            label: "Hide Content",
                                            keys: [<Kbd key="alt">Alt</Kbd>, <Plus key="p1" />, <Kbd key="h">H</Kbd>],
                                        },
                                        {
                                            icon: <Volume2 size={12} />,
                                            label: "Sound",
                                            keys: [<Kbd key="alt">Alt</Kbd>, <Plus key="p1" />, <Kbd key="s">S</Kbd>],
                                        },
                                    ];
                                    return (
                                        <div className="mt-2 mb-1 space-y-2.5">
                                            {shortcuts.map(({ icon, label, keys, note }) => (
                                                <div key={label} className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-1.5 text-xs opacity-80 shrink-0">
                                                        {icon}
                                                        <span>{label}</span>
                                                        {note && <span className="text-[9px] opacity-50 hidden sm:inline">({note})</span>}
                                                    </div>
                                                    <div className="flex items-center flex-wrap justify-end">
                                                        {keys}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    );
                                })()}
                            </div>

                            <Separator />
                            {/* ── Privacy ── */}
                            <p className="text-[10px] uppercase tracking-widest opacity-40 mt-1 mb-1">Privacy</p>
                            {/* Ignore List */}
                            <div className="py-2">
                                <p className="sm:text-base text-sm mb-2">Blocked Apps</p>
                                <div className="flex gap-1 mb-2">
                                    <input
                                        type="text"
                                        value={newIgnoreEntry}
                                        onChange={(e) => setNewIgnoreEntry(e.target.value)}
                                        onKeyDown={(e) => e.key === "Enter" && handleAddIgnoreEntry()}
                                        placeholder="e.g. 1password.exe"
                                        className="flex-1 text-xs px-2 py-1 border-b border-current bg-transparent focus:outline-none placeholder-gray-400"
                                    />
                                    <button
                                        onClick={handleAddIgnoreEntry}
                                        className="text-xs px-2 font-bold hover:opacity-70 transition-opacity"
                                        title="Add to block list"
                                    >
                                        +
                                    </button>
                                </div>
                                {ignoreList.length > 0 && (
                                    <ul className="space-y-1">
                                        {ignoreList.map((entry) => (
                                            <li key={entry} className="flex items-center justify-between text-xs">
                                                <span className="truncate text-foreground/80">{entry}</span>
                                                <button
                                                    onClick={() => removeIgnoreEntry(entry)}
                                                    className="ml-1 shrink-0 hover:text-red-600 transition-colors"
                                                    title="Remove"
                                                >
                                                    ✕
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                       
                            <Suspense fallback={null}>
                                <DeleteClipsDialog>
                                    <DeleteButton />
                                </DeleteClipsDialog>
                            </Suspense>
                        </ScrollArea>
                        <img src="/menu-clean.png" alt="" className="settings-bg" />
                    </div>
                </div>
            </div>

            {
                !isMiniClip && platform === "windows" && (
                    <div className=" flex items-center gap-1" style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties}>
                        <button onClick={() => WindowMinimise()}>
                            <img src="/minimize.png" alt="minimize" className="h-5 shadow-md/30" />
                        </button>
                        <button onClick={() => handleWindowScreen()}>
                            <img src={fullScreen ? "/unmaximise.png" : "/maximize.png"} alt="maximize" className="h-5 shadow-md/30" />
                        </button>
                        <button onClick={() => isQuickPaste ? WindowHide() : Quit()}>
                            <img src="/close.png" alt="close" className="h-5 shadow-md/30" />
                        </button>
                    </div>

                )
            }

            {/* Quick Paste enable confirmation dialog */}
            <Dialog open={showQuickPasteConfirm} onOpenChange={(open) => { if (!open) setShowQuickPasteConfirm(false) }}>
                <DialogContent showCloseButton={false} className="hand-drawn lined thin p-6 bg-[#F9F5E6] max-w-sm border-0 sm:rounded-none">
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            <h2 className="text-lg font-bold">Enable Quick Paste?</h2>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                Clipcat will slip into the system tray and stay out of your way.
                            </p>
                            <ul className="text-sm mt-1 space-y-1.5">
                                <li><span className="font-semibold">{platform === "darwin" ? "Cmd" : "Ctrl"}+Shift+V</span> — summon Clipcat from any window</li>
                                <li>Click the content on a clip to fire it into the last window you used</li>
                                <li>The tray icon also brings Clipcat back whenever you need it (only supported on Windows)</li>
                            </ul>
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                            <button
                                onClick={() => setShowQuickPasteConfirm(false)}
                                className="rounded px-3 py-1 text-sm bg-foreground/5 hover:bg-foreground/10 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmEnableQuickPaste}
                                className="rounded px-3 py-1 text-sm bg-foreground text-white hover:opacity-80 transition-opacity"
                            >
                                Enable &amp; Hide
                            </button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
