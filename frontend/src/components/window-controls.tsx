import { useRef, useState, useEffect } from "react";
import { WindowIsMaximised, WindowMinimise, WindowUnmaximise, WindowMaximise, Quit, WindowHide } from "../../wailsjs/runtime/runtime";
import { useClips } from "@/context/ClipContext";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { playSound } from "@/helpers/playSound";
import { UpdateStorageLimit, GetStorageLimit, GetPlatform } from "../../wailsjs/go/main/App";
import { GetClips } from "../../wailsjs/go/main/App";
import { ScrollArea } from "./ui/scroll-area";
import DeleteButton from "./delete-button";
import DeleteClipsDialog from "./delete-clips-dialog";
import { Dialog, DialogContent } from "@/components/ui/dialog";

export default function WindowControls() {
    const [fullScreen, setFullScreen] = useState<boolean>(false);
    const [newIgnoreEntry, setNewIgnoreEntry] = useState("");
    const { soundOn, toggleSound, isMiniClip, toggleMiniClip, toggleStartup, isStartup } = useClips();
    const { hideContent, toggleHideContent, clips, isPaused, togglePause, ignoreList, addIgnoreEntry, removeIgnoreEntry, isGhostMode, toggleGhostMode } = useClips();
    const settingBtnRef = useRef<HTMLButtonElement>(null);
    const settingDialogRef = useRef<HTMLDivElement>(null);
    const [dialogOpen, setDialogOpen] = useState<boolean>(false);
    const [limit, setLimit] = useState(100)
    const [showQuickPasteConfirm, setShowQuickPasteConfirm] = useState(false)
    const [platform, setPlatform] = useState<string>("")

    useEffect(() => {
        GetPlatform().then(setPlatform).catch(() => setPlatform(""))
    }, [])

    const handleQuickPasteToggle = () => {
        if (isGhostMode) {
            playSound(isGhostMode ? '/sounds/switch-on.mp3' : '/sounds/switch-off.mp3', soundOn, 1)
            toggleGhostMode()
        } else {
            setShowQuickPasteConfirm(true)
        }
    }

    const confirmEnableQuickPaste = async () => {
        playSound('/sounds/switch-off.mp3', soundOn, 1)
        await toggleGhostMode()
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
                display: "block"
            }).fromTo(
                settingDialogRef.current, {
                opacity: 0,
                y: -15,
                rotation: -3,
                scale: 0.92,
            }, {
                opacity: 1,
                y: 5,
                rotation: 0,
                scale: 1,
                duration: 0.5,
                ease: "back.out(1.2)",
                onStart: () => playSound('/sounds/paper-collect.mp3', soundOn, 1)
            })
        } else {
            setDialogOpen(false)
            tl.to(
                settingDialogRef.current, {
                opacity: 0,
                y: -10,
                rotation: 2,
                scale: 0.95,
                duration: 0.35,
                ease: "power2.in",
                onStart: () => playSound('/sounds/paper-collect.mp3', soundOn, 1)
            }
            )
                .to(settingBtnRef.current, {
                    y: 0,
                    rotation: 0,
                    duration: .3,
                    ease: "elastic.out(1, 0.5)",
                    onStart: () => playSound('/sounds/crank.mp3', soundOn, 1)

                }).set(
                    settingDialogRef.current, {
                    display: "none",
                    rotation: 0,
                    scale: 1,
                })
        }
    }

    const Separator = () => {
        return (
            <div>
                <img src="/seperator.png" alt="" className="w-125" />
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
                </button>
                <div ref={settingDialogRef} className="setting-dialog absolute min-w-56  -right-1 top-5">
                    <ScrollArea className="h-[calc(100vh-100px)] max-h-70 min-h-60 pt-4 px-4">
                        <h2 className="text-lg text-center">Settings</h2>
                        <Separator />
                        <div className="flex items-center gap-3 justify-between py-2" title="alt + m to toggle">
                            <p className="sm:text-base text-sm p-0!">Mini Clip</p>
                            {MenuSwitch(isMiniClip, toggleMiniClip)}
                        </div>
                        <Separator />
                        <div className="flex items-center gap-3 justify-between py-2" title="alt + h to toggle">
                            <p className="sm:text-base text-sm p-0!">Hide                                                    Content</p>
                            {MenuSwitch(hideContent, toggleHideContent, !hasClips())}
                        </div>
                        <Separator />
                        <div className="flex items-center gap-3 justify-between py-2" title="Limits the number of clipboard items stored">
                            <p className="sm:text-base text-sm p-0!">Clipboard Limit</p>
                            <ClipStorageLimitSwitch />
                        </div>
                        <Separator />
                        <div className="flex items-center gap-3 justify-between py-2" title="alt + s to toggle">
                            <p className="sm:text-base text-sm p-0!">Sound</p>
                            {MenuSwitch(soundOn, toggleSound)}
                        </div>
                        <Separator />
                        <div className="flex items-center gap-3 justify-between py-2" title="Pause clipboard capture temporarily">
                            <p className="sm:text-base text-sm p-0!">Pause Capture</p>
                            {MenuSwitch(isPaused, togglePause)}
                        </div>
                        <Separator />
                        <div className="flex items-center gap-3 justify-between py-2" title="Quick Paste: hides to the tray, Ctrl+Shift+V summons it, paste any clip into the last window you used">
                            <p className="sm:text-base text-sm p-0!">Quick Paste</p>
                            {MenuSwitch(isGhostMode, handleQuickPasteToggle)}
                        </div>
                        <Separator />
                        <div className="flex items-center gap-3 justify-between py-2" title="Enables or disables loading the app on system startup">
                            <p className="sm:text-base text-sm p-0!">Load on Startup</p>
                            {MenuSwitch(isStartup, toggleStartup)}
                        </div>
                        <Separator />
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
                        <Separator />
                        <DeleteClipsDialog>
                            <DeleteButton />
                        </DeleteClipsDialog>
                    </ScrollArea>
                    <img src="/menu-clean.png" alt="" className="settings-bg" />
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
                        <button onClick={() => isGhostMode ? WindowHide() : Quit()}>
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
                                <li><span className="font-semibold">Ctrl+Shift+V</span> — summon Clipcat from any window</li>
                                <li>Click the paste icon on a clip to fire it into the last window you used</li>
                                <li>The tray icon also brings Clipcat back whenever you need it</li>
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
