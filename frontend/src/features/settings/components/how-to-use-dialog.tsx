import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    ClipboardCopy,
    Zap,
    Pin,
    Tag,
    Search,
    EyeOff,
    Pencil,
    Ban,
    ShieldAlert,
    Minimize2,
    Pause,
    Database,
    Volume2,
    Rocket,
    Crosshair,
} from "lucide-react";

interface HowToUseDialogProps {
    platform: string;
    onOpen?: () => void;
    hasSeenHowToUse?: boolean;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
}

export default function HowToUseDialog({ platform, onOpen, hasSeenHowToUse = true, open: controlledOpen, onOpenChange: controlledOnOpenChange }: HowToUseDialogProps) {
    const isMac = platform === "darwin";
    const mod = isMac ? "⌘" : "Ctrl";

    const Kbd = ({ children }: { children: React.ReactNode }) => (
        <kbd className="inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-mono leading-none bg-foreground/10 border border-foreground/25 rounded">
            {children}
        </kbd>
    );

    const Plus = () => <span className="mx-0.5 text-[10px] opacity-40">+</span>;

    const shortcuts: { keys: string[]; label: string }[] = [
        { keys: [mod, "Shift", "V"], label: "Summon Clipcat (system-wide)" },
        { keys: [mod, "F"], label: "Focus search" },
        { keys: ["Alt", "M"], label: "Toggle Mini Clip" },
        { keys: ["Alt", "H"], label: "Toggle Privacy Mode" },
        { keys: ["Alt", "S"], label: "Toggle sound" },
    ];

    const features: { icon: React.ReactNode; title: string; desc: React.ReactNode }[] = [
        {
            icon: <ClipboardCopy size={14} />,
            title: "Auto-capture",
            desc: "Everything you copy is saved instantly - text and images - with no setup needed.",
        },
        {
            icon: <Zap size={14} />,
            title: "Quick Paste",
            desc: (
                <>
                    Enable in Settings, then press{" "}
                    <Kbd>{mod}</Kbd><Plus /><Kbd>Shift</Kbd><Plus /><Kbd>V</Kbd>{" "}
                    from any app to summon Clipcat, pick a clip, and it pastes straight in then vanishes.
                </>
            ),
        },
        {
            icon: <Pin size={14} />,
            title: "Pin Clips",
            desc: "Keep important clips at the top, protected from being pushed out when the storage limit is reached.",
        },
        {
            icon: <Tag size={14} />,
            title: "Labels",
            desc: "Tag any clip with a custom label to categorise and organise your history. Filter by label using the bar above your clips.",
        },
        {
            icon: <Search size={14} />,
            title: "Search",
            desc: (
                <>
                    <Kbd>{mod}</Kbd><Plus /><Kbd>F</Kbd> focuses the search bar instantly to filter your entire clipboard history.
                </>
            ),
        },
        {
            icon: <EyeOff size={14} />,
            title: "Privacy Mode",
            desc: (
                <>
                    <Kbd>Alt</Kbd><Plus /><Kbd>H</Kbd> blurs all clip content - handy for screen sharing or shoulder-surfing situations.
                </>
            ),
        },
        {
            icon: <Pencil size={14} />,
            title: "Edit Clips",
            desc: "Fix typos or update any saved clip without re-copying. Click the pencil icon on any clip card.",
        },
        {
            icon: <Ban size={14} />,
            title: "Blocked Apps",
            desc: "Add a process name (e.g. 1password.exe) in Settings -> Blocked Apps and Clipcat will never capture from that app.",
        },
        {
            icon: <ShieldAlert size={14} />,
            title: "Auto-hide Sensitive",
            desc: "Clipcat automatically detects and collapses clips that look like passwords, API keys, or tokens. Toggle in Settings.",
        },
        {
            icon: <Minimize2 size={14} />,
            title: "Mini Clip Mode",
            desc: (
                <>
                    A compact always-on-top window. Toggle with <Kbd>Alt</Kbd><Plus /><Kbd>M</Kbd>. State persists between sessions.
                </>
            ),
        },
        {
            icon: <Crosshair size={14} />,
            title: "Smart Position",
            desc: "When Quick Paste summons the window, it pops up right next to your cursor so you never have to hunt for it. Always stays fully on-screen. Toggle in Settings -> Window. On by default.",
        },
        {
            icon: <Pause size={14} />,
            title: "Pause Capture",
            desc: "Temporarily stop recording clipboard changes without closing the app. Toggle in Settings -> Clipboard.",
        },
        {
            icon: <Database size={14} />,
            title: "Clipboard Limit",
            desc: "Choose how many clips to keep (100-500). Pinned clips are always preserved regardless of the limit. Adjust in Settings -> Clipboard.",
        },
        {
            icon: <Volume2 size={14} />,
            title: "Sound Effects",
            desc: (
                <>
                    Satisfying audio feedback on every action. Toggle with <Kbd>Alt</Kbd><Plus /><Kbd>S</Kbd> or in Settings {'->'} System.
                </>
            ),
        },
        {
            icon: <Rocket size={14} />,
            title: "Load on Startup",
            desc: "Optionally launch Clipcat automatically when your system starts. Toggle in Settings -> System.",
        },
    ];

    return (
        <Dialog open={controlledOpen} onOpenChange={(open) => { if (controlledOnOpenChange) controlledOnOpenChange(open); if (open && onOpen) onOpen(); }}>
            <DialogTrigger asChild>
                <button className="relative flex items-center gap-1.5 hover:opacity-70 transition-opacity cursor-pointer">
                    <span className="text-sm font-bold">How to Use</span>
                    <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-current text-[10px] font-bold leading-none shrink-0">?</span>
                    {!hasSeenHowToUse && (
                        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 border border-white pointer-events-none" />
                    )}
                </button>
            </DialogTrigger>
            <DialogContent showCloseButton={false} className="bg-transparent! shadow-none border-0 p-0 w-[90vw] max-w-sm">
                <div className="setting-dialog relative w-full h-screen! sm:h-[90vh]! max-h-100 rounded-sm overflow-hidden">
                    <DialogClose className="absolute right-4 top-4 bg-[#F8F5F0] w-7 h-7 flex items-center justify-center hand-drawn-btn lined thin text-sm! font-bold hover:opacity-70 z-10">
                        x
                    </DialogClose>
                    <ScrollArea className="relative z-1 h-full pt-6 px-6 pb-4">
                        <DialogTitle className="text-lg text-center mb-4">How to Use Clipcat</DialogTitle>
                        <div className="space-y-4 pb-2">
                        {/* Features */}
                        <div className="space-y-3">
                            {features.map(({ icon, title, desc }) => (
                                <div key={title} className="flex gap-3 text-sm">
                                    <span className="shrink-0 leading-snug mt-0.5 opacity-70">{icon}</span>
                                    <div>
                                        <strong>{title}</strong>
                                        <span className="text-muted-foreground"> - </span>
                                        <span className="text-xs text-muted-foreground leading-relaxed">{desc}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Keyboard Shortcuts */}
                        <div>
                            <img src="/separator.svg" alt="" className="w-full my-3 opacity-70" />
                            <p className="text-sm font-bold mb-3">Keyboard Shortcuts</p>
                            <div className="space-y-2.5">
                                {shortcuts.map(({ keys, label }) => (
                                    <div key={label} className="flex items-center justify-between gap-2 text-xs">
                                        <span className="opacity-80">{label}</span>
                                        <div className="flex items-center shrink-0">
                                            {keys.map((k, i) => (
                                                <span key={i} className="flex items-center">
                                                    {i > 0 && <Plus />}
                                                    <Kbd>{k}</Kbd>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        </div>
                    </ScrollArea>
                    <img src="/menu-clean.png" alt="" className="settings-bg" />
                </div>
            </DialogContent>
        </Dialog>
    );
}
