import { useRef, useState, useEffect, lazy, Suspense } from "react";
import { Window } from "@wailsio/runtime";
import { useClips } from "@/context/ClipContext";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { playSound } from "@/helpers/playSound";
import { GetPlatform } from "../../bindings/Clipcat/app";
const DeleteClipsDialog = lazy(() => import("./delete-clips-dialog"));
import { Dialog, DialogContent } from "@/components/ui/dialog";
import type { UpdateInfo } from "./about-dialog";
import SettingsPanel from "./settings-panel";

interface WindowControlsProps {
    updateAvailable?: UpdateInfo | null;
    onCheckUpdate?: () => Promise<void>;
}

export default function WindowControls({ updateAvailable, onCheckUpdate }: WindowControlsProps) {
    const [fullScreen, setFullScreen] = useState<boolean>(false);
    const { soundOn, isMiniClip, toggleMiniClip, isQuickPaste, toggleQuickPaste } = useClips();
    const settingBtnRef    = useRef<HTMLButtonElement>(null);
    const settingDialogRef = useRef<HTMLDivElement>(null);
    const panelRef         = useRef<HTMLDivElement>(null);
    const [dialogOpen, setDialogOpen]                   = useState(false);
    const [showQuickPasteConfirm, setShowQuickPasteConfirm] = useState(false);
    const [platform, setPlatform]                       = useState("");

    useEffect(() => {
        GetPlatform().then(setPlatform).catch(() => setPlatform(""));
        Window.IsMaximised().then(setFullScreen).catch(() => {});
    }, []);

    // -- Quick Paste toggle � shows confirmation when turning on --------------

    const handleQuickPasteToggle = async () => {
        if (isQuickPaste) {
            playSound('/sounds/switch-on.mp3', soundOn, 1);
            await toggleQuickPaste();
            if (isMiniClip) await toggleMiniClip();
        } else {
            setShowQuickPasteConfirm(true);
        }
    };

    const confirmEnableQuickPaste = async () => {
        setDialogOpen(false);
        gsap.set(settingDialogRef.current, { display: "none" });
        playSound('/sounds/switch-off.mp3', soundOn, 1);
        await toggleQuickPaste();
        if (!isMiniClip) await toggleMiniClip();
        setShowQuickPasteConfirm(false);
        Window.Hide();
    };

    // -- GSAP open / close animation ------------------------------------------

    useGSAP(() => {
        gsap.set(settingDialogRef.current, { display: "none" });
    }, []);

    const tlRef = useRef(gsap.timeline());

    const handleSettingsClick = () => {
        const tl = tlRef.current;
        tl.clear();
        if (!dialogOpen) {
            setDialogOpen(true);
            tl.to(settingBtnRef.current, {
                y: 10, rotation: -2, duration: 0.3, ease: "power2.out",
                onStart: () => playSound('/sounds/crank.mp3', soundOn, 1),
            })
              .set(settingDialogRef.current, { display: "flex" })
              .fromTo(panelRef.current,
                  { opacity: 0, scale: 0.96, y: -16 },
                  { opacity: 1, scale: 1, y: 0, duration: 0.45, ease: "back.out(1.2)",
                    onStart: () => playSound('/sounds/paper-collect.mp3', soundOn, 1) });
        } else {
            setDialogOpen(false);
            tl.to(panelRef.current, {
                opacity: 0, scale: 0.97, y: 10, duration: 0.3, ease: "power2.in",
                onStart: () => playSound('/sounds/paper-collect.mp3', soundOn, 1),
            })
              .to(settingBtnRef.current, {
                  y: 0, rotation: 0, duration: 0.3, ease: "elastic.out(1, 0.5)",
                  onStart: () => playSound('/sounds/crank.mp3', soundOn, 1),
              })
              .set(settingDialogRef.current, { display: "none" })
              .set(panelRef.current, { scale: 1, y: 0 });
        }
    };

    // -- Window maximise/restore -----------------------------------------------

    const handleWindowScreen = async () => {
        const isMax = await Window.IsMaximised();
        if (isMax) { Window.UnMaximise(); setFullScreen(false); }
        else        { Window.Maximise();  setFullScreen(true);  }
    };

    // -------------------------------------------------------------------------

    return (
        <div className="flex flex-row-reverse items-center fixed z-10 top-0 right-0 md:mr-[2%] md:pt-3 pt-2 mr-2 gap-4">

            {/* --- Gear + settings overlay --- */}
            <div className="mt-1 relative z-10">
                <button id="tour-settings" onClick={handleSettingsClick} ref={settingBtnRef} className="relative z-10">
                    <img src="/settings.png" alt="settings" className="h-5 shadow-md/30" />
                    {updateAvailable && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 border border-white pointer-events-none" />
                    )}
                </button>

                <div ref={settingDialogRef} className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/40" onClick={handleSettingsClick} />
                    <SettingsPanel
                        ref={panelRef}
                        onClose={handleSettingsClick}
                        onQuickPasteToggle={handleQuickPasteToggle}
                        updateAvailable={updateAvailable}
                        onCheckUpdate={onCheckUpdate}
                        platform={platform}
                    />
                </div>
            </div>

            {/* --- Quick-access Delete (no settings needed) --- */}
            <div className="mt-1">
                <Suspense fallback={null}>
                    <DeleteClipsDialog>
                        <button className="hover:opacity-70 transition-opacity" title="Clear clipboard history">
                            <img src="/delete-base.png" alt="clear history" className="h-5 shadow-md/30" />
                        </button>
                    </DeleteClipsDialog>
                </Suspense>
            </div>

            {/* --- Windows window controls --- */}
            {!isMiniClip && platform === "windows" && (
                <div className="flex items-center gap-1" style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties}>
                    <button onClick={() => Window.Minimise()}>
                        <img src="/minimize.png" alt="minimize" className="h-5 shadow-md/30" />
                    </button>
                    <button onClick={handleWindowScreen}>
                        <img src={fullScreen ? "/unmaximise.png" : "/maximize.png"} alt="maximize" className="h-5 shadow-md/30" />
                    </button>
                    <button onClick={() => Window.Hide()}>
                        <img src="/close.png" alt="close" className="h-5 shadow-md/30" />
                    </button>
                </div>
            )}

            {/* --- Quick Paste confirmation dialog --- */}
            <Dialog open={showQuickPasteConfirm} onOpenChange={(open) => { if (!open) setShowQuickPasteConfirm(false); }}>
                <DialogContent showCloseButton={false} className="hand-drawn lined thin p-6 bg-[#F9F5E6] max-w-sm border-0 sm:rounded-none">
                    <div className="flex flex-col gap-4">
                        <div className="flex flex-col gap-2">
                            <h2 className="text-lg font-bold">Enable Quick Paste?</h2>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                Clipcat will slip into the system tray and stay out of your way.
                            </p>
                            <ul className="text-sm mt-1 space-y-1.5">
                                <li><span className="font-semibold">{platform === "darwin" ? "Cmd" : "Ctrl"}+Shift+V</span> � summon Clipcat from any window</li>
                                <li>Click the content on a clip to fire it into the last window you used</li>
                                <li>The tray icon also brings Clipcat back whenever you need it (Windows only)</li>
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
