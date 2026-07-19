import { useState, useEffect, forwardRef } from "react";
import { Browser } from "@wailsio/runtime";
import { useClips } from "@/context/ClipContext";
import { playSound } from "@/helpers/playSound";
import { UpdateStorageLimit, GetStorageLimit, GetClips, DeleteAllClips, DeletePinnedClips, DeleteUnpinnedClips } from "../../bindings/Clipcat/app";
import { ScrollArea } from "./ui/scroll-area";
import { RefreshCw, Download, Monitor, Clipboard, Wrench, ShieldCheck, Trash2 } from "lucide-react";
import type { UpdateInfo } from "./about-dialog";

type SettingsTab = "window" | "clipboard" | "system" | "privacy";

interface SettingsPanelProps {
    /** Animated close triggered by the parent's GSAP timeline */
    onClose: () => void;
    /** Forwarded to the Quick Paste switch — parent owns the confirm dialog */
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
            isAlwaysOnTop, toggleAlwaysOnTop,
            isCursorSnap, toggleCursorSnap,
            getClips,
        } = useClips();

        const [activeTab, setActiveTab] = useState<SettingsTab>("window");
        const [newIgnoreEntry, setNewIgnoreEntry] = useState("");
        const [limit, setLimit] = useState(100);
        const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);

        useEffect(() => {
            GetStorageLimit().then(setLimit).catch(() => { });
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
            await DeleteAllClips().then(() => getClips());
        };

        const handleDeletePinnedClips = async () => {
            await DeletePinnedClips().then(() => getClips());
        };

        const handleDeleteUnpinnedClips = async () => {
            await DeleteUnpinnedClips().then(() => getClips());
        };

        const handleAddIgnoreEntry = async () => {
            const name = newIgnoreEntry.trim();
            if (!name) return;
            await addIgnoreEntry(name);
            setNewIgnoreEntry("");
        };

        const hasClips = () => clips.recent.length > 0 || clips.pinned.length > 0;

        const MenuSwitch = (isOn: boolean, fn: () => void, disabled = false): React.JSX.Element => (
            <button
                onClick={() => {
                    playSound(isOn ? '/sounds/switch-on.mp3' : '/sounds/switch-off.mp3', soundOn, 1);
                    if (!disabled) fn();
                }}
                className="menu-switch-container block h-6 shrink-0 disabled:opacity-50"
                disabled={disabled}
            >
                {isOn
                    ? <img src="/on.png" alt="" className="block h-full" />
                    : <img src="/off.png" alt="" className="block h-full" />}
            </button>
        );

        const ClipStorageLimitSwitch = () => (
            <div className="flex flex-col items-center">
                <button className="block w-4 -rotate-90 disabled:opacity-50" onClick={incrementLimit} disabled={limit >= 500}>
                    <img src="/arrow.png" alt="increment" className="h-full block" />
                </button>
                <span className="text-sm text-center">{limit}</span>
                <button className="block w-4 rotate-90 disabled:opacity-50" onClick={decrementLimit} disabled={limit <= 100}>
                    <img src="/arrow.png" alt="decrement" className="h-full block" />
                </button>
            </div>
        );

        const Separator = ({className}: {className?: string}) => (
            <div className={`my-3 ${className ?? ""}`}>
                <img src="/seperator.png" alt="" className="w-full opacity-40" />
            </div>
        );

        const SettingRow = ({ children, title }: { children: React.ReactNode; title?: string }) => (
            <div className="flex items-center gap-3 justify-between py-2.5" title={title}>
                {children}
            </div>
        );

        const Dot = () => (
            <span className="flex-1 border-b border-dashed border-current opacity-20 mb-1 mx-1" />
        );

        const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
            { id: "window", label: "Window", icon: <Monitor size={11} /> },
            { id: "clipboard", label: "Clipboard", icon: <Clipboard size={11} /> },
            { id: "system", label: "System", icon: <Wrench size={11} /> },
            { id: "privacy", label: "Privacy", icon: <ShieldCheck size={11} /> },
        ];


        return (
            <div
                ref={ref}
                className="setting-dialog relative z-10 flex flex-col
                           w-full h-full
                           md:w-[74vw] max-w-200 md:h-[74vh]" 
            >
                {/* ── Header ── */} 
                <div className="relative z-1 flex items-center justify-between px-10 max-sm:px-6 pt-10 pb-2 shrink-0">
                    <h2 className="text-lg">Settings</h2>
                    <button
                        onClick={onClose}
                        className="bg-[#F8F5F0] w-7 h-7 flex items-center justify-center hand-drawn-btn lined thin text-sm font-bold hover:opacity-70"
                    >
                        ✕
                    </button>
                </div>

                {/* ── Tab bar ── */}
                <div className="relative z-1 px-10 max-sm:px-5 shrink-0">
                    <div className="flex gap-1 flex-wrap pb-1">
                        {tabs.map(({ id, label, icon }) => (
                            <button
                                key={id}
                                onClick={() => setActiveTab(id)}
                                className={`flex items-center gap-1.5 !text-[11px] px-3 py-1.5 transition-all hand-drawn-btn ${activeTab === id
                                    ? "font-bold opacity-100 lined thin"
                                    : "opacity-45 hover:opacity-70"
                                    }`}
                            >
                                {icon}
                                {label}
                                {id === "privacy" && ignoreList.length > 0 && (
                                    <span className="ml-0.5 w-3.5 h-3.5 rounded-full bg-current/25 text-[9px] flex items-center justify-center leading-none font-bold">
                                        {ignoreList.length}
                                    </span>
                                )}
                                {id === "system" && updateAvailable && (
                                    <span className="ml-0.5 w-2 h-2 rounded-full bg-red-500 inline-block shrink-0" />
                                )}
                            </button>
                        ))}
                    </div>
                    <Separator className = "w-[80%] mx-auto"/>
                </div>

                {/* ── Tab content ── */}
                <ScrollArea className="relative z-1 flex-1 min-h-0 px-12 max-sm:px-8 pb-6">

                    {/* ══════ WINDOW ══════ */}
                    {activeTab === "window" && (
                        <div className="pt-3">
                            <SettingRow title="alt + m to toggle">
                                <p className="sm:text-base text-sm">Mini Clip</p>
                                <Dot />
                                {MenuSwitch(isMiniClip, toggleMiniClip)}
                            </SettingRow>
                            <SettingRow title={isQuickPaste ? "Turn off Quick Paste to use Always on Top" : "Keep the Clipcat window always above other windows"}>
                                <div className="flex flex-col">
                                    <p className="sm:text-base text-sm">Always on Top</p>
                                    {isQuickPaste && <p className="text-[10px] opacity-50">Turn off Quick Paste first</p>}
                                </div>
                                <Dot />
                                {MenuSwitch(isAlwaysOnTop, toggleAlwaysOnTop, isQuickPaste)}
                            </SettingRow>
                            <SettingRow title="Move the window next to your cursor when Quick Paste summons it">
                                <div className="flex flex-col">
                                    <p className="sm:text-base text-sm">Smart Position</p>
                                    {!isQuickPaste && <p className="text-[10px] opacity-50">Requires Quick Paste</p>}
                                </div>
                                <Dot />
                                {MenuSwitch(isCursorSnap, toggleCursorSnap, !isQuickPaste)}
                            </SettingRow>
                        </div>
                    )}

                    {/* ══════ CLIPBOARD ══════ */}
                    {activeTab === "clipboard" && (
                        <div className="pt-3">
                            <SettingRow title="Pause clipboard capture temporarily">
                                <p className="sm:text-base text-sm">Pause Capture</p>
                                <Dot />
                                {MenuSwitch(isPaused, togglePause)}
                            </SettingRow>
                            <SettingRow title="alt + h to toggle">
                                <p className="sm:text-base text-sm">Hide Content</p>
                                <Dot />
                                {MenuSwitch(hideContent, toggleHideContent, !hasClips())}
                            </SettingRow>
                            <SettingRow title="Automatically hide clipboard items that look like passwords, API keys, or tokens">
                                <p className="sm:text-base text-sm">Auto-hide Sensitive</p>
                                <Dot />
                                {MenuSwitch(autoHideSensitive, toggleAutoHideSensitive)}
                            </SettingRow>
                            <SettingRow title="Limits the number of clipboard items stored">
                                <p className="sm:text-base text-sm">Clipboard Limit</p>
                                <Dot />
                                <ClipStorageLimitSwitch />
                            </SettingRow>
                        </div>
                    )}

                    {/* ══════ SYSTEM ══════ */}
                    {activeTab === "system" && (
                        <div className="pt-3">
                            <SettingRow title="alt + s to toggle">
                                <p className="sm:text-base text-sm">Sound</p>
                                <Dot />
                                {MenuSwitch(soundOn, toggleSound)}
                            </SettingRow>
                            <SettingRow title="Enables or disables loading the app on system startup">
                                <p className="sm:text-base text-sm">Load on Startup</p>
                                <Dot />
                                {MenuSwitch(isStartup, toggleStartup)}
                            </SettingRow>
                            <SettingRow title={`Quick Paste: hides to the tray, ${platform === "darwin" ? "Cmd" : "Ctrl"}+Shift+V summons it, paste any clip into the last window you used`}>
                                <p className="sm:text-base text-sm">Quick Paste</p>
                                <Dot />
                                {MenuSwitch(isQuickPaste, onQuickPasteToggle)}
                            </SettingRow>

                            <Separator className = "w-1/2 mx-auto"/>

                            <p className="text-[10px] uppercase tracking-widest opacity-40 mb-2">Updates</p>
                            {updateAvailable ? (
                                <div className="space-y-2 py-1">
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
                                        onClick={() => Browser.OpenURL('https://d3ucey.github.io/Clipcat/download')}
                                        className="inline-flex items-center gap-1.5 hand-drawn-btn lined thin text-xs! px-2 py-1 font-bold hover:opacity-70 transition-opacity"
                                    >
                                        <Download size={11} />
                                        Download Update
                                    </button>
                                </div>
                            ) : (
                                <SettingRow>
                                    <p className="sm:text-base text-sm">Check for Updates</p>
                                    <Dot />
                                    <button
                                        onClick={async () => {
                                            if (!onCheckUpdate) return;
                                            setIsCheckingUpdate(true);
                                            await onCheckUpdate();
                                            setIsCheckingUpdate(false);
                                        }}
                                        disabled={isCheckingUpdate || !onCheckUpdate}
                                        className="flex items-center gap-1 text-xs! px-2 py-1 hand-drawn-btn lined thin font-bold hover:opacity-70 transition-opacity disabled:opacity-40"
                                        title="Check for a new version"
                                    >
                                        <RefreshCw size={11} className={isCheckingUpdate ? "animate-spin" : ""} />
                                        {isCheckingUpdate ? "Checking…" : "Check"}
                                    </button>
                                </SettingRow>
                            )}
                        </div>
                    )}

                    {/* ══════ PRIVACY ══════ */}
                    {activeTab === "privacy" && (
                        <div className="pt-3">
                            {/* Clear History */}
                            <p className="text-[10px] uppercase tracking-widest opacity-40 mb-2">Clear History</p>
                            <SettingRow>
                                <p className="sm:text-base text-sm">Delete Recents</p>
                                <Dot />
                                <button
                                    onClick={handleDeleteUnpinnedClips}
                                    className="flex items-center gap-1 text-xs! px-2 py-1 hand-drawn-btn lined thin font-bold hover:opacity-70 transition-opacity"
                                >
                                    <Trash2 size={11} />
                                    Delete
                                </button>
                            </SettingRow>
                            <SettingRow>
                                <p className="sm:text-base text-sm">Delete Pinned</p>
                                <Dot />
                                <button
                                    onClick={handleDeletePinnedClips}
                                    className="flex items-center gap-1 text-xs! px-2 py-1 hand-drawn-btn lined thin font-bold hover:opacity-70 transition-opacity"
                                >
                                    <Trash2 size={11} />
                                    Delete
                                </button>
                            </SettingRow>
                            <SettingRow>
                                <p className="sm:text-base text-sm">Delete All</p>
                                <Dot />
                                <button
                                    onClick={handleDeleteAllClips}
                                    className="flex items-center gap-1 text-xs! px-2 py-1 hand-drawn-btn lined thin font-bold hover:opacity-70 transition-opacity"
                                >
                                    <Trash2 size={11} />
                                    Delete
                                </button>
                            </SettingRow>

                            <Separator className = "w-1/2 mx-auto" />

                            {/* Blocked Apps */}
                            <p className="text-[10px] uppercase tracking-widest opacity-40 mb-1">Blocked Apps</p>
                            <p className="text-xs text-foreground/55 mb-3">Clipboard won't capture from these apps.</p>
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
                                <ul className="space-y-1 mt-1">
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
                    )}
                </ScrollArea>

                {/* Paper texture */}
                <img src="/menu-clean.png" alt="" className="settings-bg"/>
            </div>
        );
    }
);

SettingsPanel.displayName = "SettingsPanel";
export default SettingsPanel;
