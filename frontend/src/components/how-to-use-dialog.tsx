import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "./ui/scroll-area";

interface HowToUseDialogProps {
    platform: string;
}

export default function HowToUseDialog({ platform }: HowToUseDialogProps) {
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

    const features: { emoji: string; title: string; desc: React.ReactNode }[] = [
        {
            emoji: "📋",
            title: "Auto-capture",
            desc: "Everything you copy is saved instantly — text and images — with no setup needed.",
        },
        {
            emoji: "⚡",
            title: "Quick Paste",
            desc: (
                <>
                    Enable in Settings, then press{" "}
                    <strong>
                        {mod}+Shift+V
                    </strong>{" "}
                    from any app to summon Clipcat, pick a clip, and it pastes straight in then vanishes.
                </>
            ),
        },
        {
            emoji: "📌",
            title: "Pin Clips",
            desc: "Keep important clips at the top, protected from being pushed out when the storage limit is reached.",
        },
        {
            emoji: "🏷️",
            title: "Labels",
            desc: "Tag any clip with a custom label to categorise and organise your history. Filter by label using the bar above your clips.",
        },
        {
            emoji: "🔍",
            title: "Search",
            desc: (
                <>
                    <strong>{mod}+F</strong> focuses the search bar instantly to filter your entire clipboard history.
                </>
            ),
        },
        {
            emoji: "🙈",
            title: "Privacy Mode",
            desc: (
                <>
                    <strong>Alt+H</strong> blurs all clip content — handy for screen sharing or shoulder-surfing situations.
                </>
            ),
        },
        {
            emoji: "✏️",
            title: "Edit Clips",
            desc: "Fix typos or update any saved clip without re-copying. Click the pencil icon on any clip card.",
        },
        {
            emoji: "🚫",
            title: "Blocked Apps",
            desc: "Add a process name (e.g. 1password.exe) in Settings → Blocked Apps and Clipcat will never capture from that app.",
        },
        {
            emoji: "🔒",
            title: "Auto-hide Sensitive",
            desc: "Clipcat automatically detects and collapses clips that look like passwords, API keys, or tokens. Toggle in Settings.",
        },
        {
            emoji: "📦",
            title: "Mini Clip Mode",
            desc: (
                <>
                    A compact always-on-top window. Toggle with <strong>Alt+M</strong>. State persists between sessions.
                </>
            ),
        },
    ];

    return (
        <Dialog>
            <DialogTrigger asChild>
                <button className="hand-drawn-btn lined thin px-3 py-1 text-xs! font-bold hover:opacity-70 transition-opacity cursor-pointer w-full text-left">
                    📖 How to Use
                </button>
            </DialogTrigger>
            <DialogContent className="bg-transparent! shadow-none border-0 pt-9 max-h-[88vh]">
                <div className="absolute h-[calc(100%+2rem)] w-full -z-1">
                    <img src="/dialog-bg.png" alt="" className="h-full w-full" />
                </div>
                <DialogHeader>
                    <DialogTitle className="text-2xl font-serif italic">How to Use Clipcat</DialogTitle>
                </DialogHeader>
                <ScrollArea className="max-h-[65vh] pr-2">
                    <div className="space-y-4 pb-2">
                        {/* Features */}
                        <div className="space-y-3">
                            {features.map(({ emoji, title, desc }) => (
                                <div key={title} className="flex gap-3 text-sm">
                                    <span className="text-base shrink-0 leading-snug">{emoji}</span>
                                    <div>
                                        <strong>{title}</strong>
                                        <span className="text-muted-foreground"> — </span>
                                        <span className="text-xs text-muted-foreground leading-relaxed">{desc}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Keyboard Shortcuts */}
                        <div>
                            <img src="/seperator.png" alt="" className="w-full my-3 opacity-70" />
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
            </DialogContent>
        </Dialog>
    );
}
