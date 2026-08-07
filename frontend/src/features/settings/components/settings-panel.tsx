import { useState, useEffect, useRef, forwardRef } from "react";
import { Browser } from "@wailsio/runtime";
import { useClips } from "@/contexts/ClipContext";
import { playSound } from "@/utils/play-sound";
import { UpdateStorageLimit, GetStorageLimit, GetClips, DeleteAllClips, DeletePinnedClips, DeleteUnpinnedClips, GetSyncSettings, SaveSyncSettings, ConfirmDelete } from "../../../../bindings/Clipcat/app";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, Download, Trash2, Save, Eye, EyeOff } from "lucide-react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import type { UpdateInfo } from "./about-dialog";

type SettingsTab = "window" | "clipboard" | "system" | "privacy" | "network";

interface SettingsPanelProps {
    /** Animated close triggered by the parent's GSAP timeline */
    onClose: () => void;
    /** Forwarded to the Quick Paste switch - parent owns the confirm dialog */
    onQuickPasteToggle: () => void;
    updateAvailable?: UpdateInfo | null;
    onCheckUpdate?: () => Promise<void>;
    platform: string;
}

/**
 * The full-screen settings panel.
 * Uses forwardRef so the parent (WindowControls) can animate it with GSAP.
 */
const SettingsPanel = forwardRef<HTMLDivElement, SettingsPanelProps>(
    ({ onClose, onQuickPasteToggle, updateAvailable, onCheckUpdate, platform }, ref) => {
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

        const hasClips = () => clips.recent.length > 0 || clips.pinned.length > 0;

        //  Reusable: hand-drawn toggle 
        const Toggle = ({ on, toggle, disabled }: { on: boolean; toggle: () => void; disabled?: boolean }) => (
            <button
                onClick={() => { playSound(on ? '/sounds/switch-on.mp3' : '/sounds/switch-off.mp3', soundOn, 1); if (!disabled) toggle(); }}
                className="menu-switch-container block h-6 shrink-0 disabled:opacity-50"
                disabled={disabled}
            >
                {on
                    ? <img src="/on.png" alt="" className="block h-full" />
                    : <img src="/off.png" alt="" className="block h-full" />}
            </button>
        );

        //  Reusable: a single setting row with visible description 
        const Row = ({ label, desc, children }: { label: string; desc?: React.ReactNode; children: React.ReactNode }) => (
            <div className="flex items-center justify-between gap-3 py-2.5">
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

        //  Section label - a small torn strip of washi tape, same trick as
        //     the tape squares on the home page search bar 
        const SectionLabel = ({ children }: { children: React.ReactNode }) => (
            <div className="relative inline-block mb-3 mt-1">
                <span className="absolute -inset-x-1.5 inset-y-0.5 -rotate-1 bg-amber-200/50 rounded-[2px]" />
                <p className="relative text-[10px]! uppercase tracking-widest font-bold text-amber-900/70 px-0.5">{children}</p>
            </div>
        );

        //  Storage limit stepper 
        const LimitStepper = () => (
            <div className="flex flex-col items-center">
                <button className="block w-4 -rotate-90 disabled:opacity-50" onClick={incrementLimit} disabled={limit >= 500}>
                    <img src="/arrow.png" alt="increase" className="h-full block" />
                </button>
                <span className="text-sm! text-center tabular-nums">{limit}</span>
                <button className="block w-4 rotate-90 disabled:opacity-50" onClick={decrementLimit} disabled={limit <= 100}>
                    <img src="/arrow.png" alt="decrease" className="h-full block" />
                </button>
            </div>
        );

        //  Action button 
        const ActionBtn = ({ onClick, children, disabled }: {
            onClick: () => void; children: React.ReactNode; disabled?: boolean
        }) => (
            <button
                onClick={onClick}
                disabled={disabled}
                className="flex items-center gap-1 text-xs! px-2 py-1 hand-drawn-btn lined thin font-bold hover:opacity-70 transition-opacity disabled:opacity-40"
            >
                {children}
            </button>
        );

        const tabs: SettingsTab[] = ["window", "clipboard", "system", "privacy", "network"];

        const tabAccent: Record<SettingsTab, string> = {
            window: "text-[#41403e] bg-[#F9F5E6]",
            clipboard: "text-amber-900 bg-amber-100",
            system: "text-[#41403e] bg-[#F9F5E6]",
            privacy: "text-rose-900 bg-rose-100",
            network: "text-blue-900 bg-blue-100",
        };
        // A hair of rotation per tab so the row reads like a set of hand-stuck
        // paper flags rather than a uniform machined tab strip.
        const tabTilt = ["-1deg", "0.6deg", "-0.5deg", "0.8deg", "-0.6deg"];

        const activeDot = (id: SettingsTab) => {
            if (id === "privacy" && ignoreList.length > 0) return ignoreList.length;
            if (id === "network" && syncEnabled && syncPeerCount > 0) return syncPeerCount;
            if (id === "system" && updateAvailable) return "!";
            return null;
        };

        // Animate tab content on switch - paper page settle
        const tabContentRef = useRef<HTMLDivElement>(null);
        useGSAP(() => {
            if (!tabContentRef.current) return;
            gsap.fromTo(tabContentRef.current,
                { opacity: 0, y: 6, rotation: 1, scale: 0.98, transformOrigin: 'center top' },
                { opacity: 1, y: 0, rotation: 0, scale: 1, duration: 0.3, ease: 'power4.out' }
            );
        }, { dependencies: [activeTab], scope: tabContentRef });


        return (
            <div
                ref={ref}
                className="setting-dialog relative z-10 flex flex-col
                           w-full h-full
                           md:w-[74vw] max-w-200 md:h-[74vh]" 
            >
                {/* Notebook margin rule - the same red ruling used on the clip
                    detail page, so Settings still reads as a page from the
                    same notebook rather than a separate UI system. */}
                <div className="margin hidden sm:block opacity-30" style={{ left: "2.25rem" }} />

                {/*  Header  */} 
                <div className="relative z-1 flex items-center justify-between px-10 max-sm:px-6 pt-10 pb-2 shrink-0">
                    <h2 className="text-lg!">Settings</h2>
                    <button onClick={onClose} className="bg-[#F8F5F0] w-7 h-7 flex items-center justify-center hand-drawn-btn lined thin text-sm! font-bold hover:opacity-70">x</button>
                </div>

                {/*  Tab bar  */}
                <div className="relative z-1 px-10 max-sm:px-5 shrink-0">
                    <div className="flex gap-1.5 flex-wrap pb-1">
                        {tabs.map((id, i) => {
                            const dot = activeDot(id);
                            const isActive = activeTab === id;
                            return (
                                <button
                                    key={id}
                                    onClick={() => setActiveTab(id)}
                                    style={{ transform: isActive ? "translateY(-2px) rotate(0deg)" : `rotate(${tabTilt[i]})` }}
                                    className={`relative flex items-center gap-1 text-[11px]! px-3 py-1.5 capitalize transition-all hand-drawn-btn hover:rotate-0! ${
                                        isActive ? `font-bold opacity-100 lined thin ${tabAccent[id]}` : "opacity-45 hover:opacity-70"
                                    }`}
                                >
                                    {id}
                                    {dot && (
                                        <span className={`ml-0.5 min-w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px]! leading-none font-bold px-0.5 ${
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
                                <Toggle on={isMiniClip} toggle={toggleMiniClip} />
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
