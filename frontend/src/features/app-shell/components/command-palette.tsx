import { useState, useEffect, useRef, useMemo } from "react"
import { createPortal } from "react-dom"
import { Search, Eye, EyeOff, Volume2, VolumeX, Minimize2, Maximize2, BookOpen } from "lucide-react"
import {
    Dialog,
    DialogContent,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useClips } from "@/contexts/ClipContext"
import { GetPlatform } from "../../../../bindings/Clipcat/app"
import HowToUseDialog from "@/features/settings/components/how-to-use-dialog"

interface Command {
    id: string
    label: string
    shortcut?: string
    category: "clipboard" | "display" | "settings"
    icon: React.ReactNode
    action: () => void
}

export default function CommandPalette() {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState("")
    const [showHowToUse, setShowHowToUse] = useState(false)
    const [platform, setPlatform] = useState("")
    const inputRef = useRef<HTMLInputElement>(null)
    const {
        soundOn, toggleSound,
        hideContent, toggleHideContent,
        isMiniClip, toggleMiniClip,
        isQuickPaste, requestQuickPaste,
    } = useClips()

    // Close palette when HowToUseDialog opens so it doesn't cover it
    useEffect(() => {
        if (showHowToUse) setOpen(false)
    }, [showHowToUse])

    useEffect(() => { GetPlatform().then(setPlatform).catch(() => {}) }, [])

    // Ctrl+K or Ctrl+Shift+P toggles the palette - Escape is handled by Dialog
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            const isOpenCmd =
                ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") ||
                ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "p")
            if (isOpenCmd) {
                e.preventDefault()
                e.stopPropagation()
                setOpen(v => !v)
                setQuery("")
            }
        }
        window.addEventListener("keydown", handler, true)
        return () => window.removeEventListener("keydown", handler, true)
    }, [])

    const commands: Command[] = useMemo(() => [
        {
            id: "search",
            label: "Focus Search",
            shortcut: "Ctrl+F",
            category: "clipboard",
            icon: <Search className="h-4 w-4" />,
            action: () => {
                setOpen(false);
                // Dispatch Ctrl+F so page.tsx's handler shows the search bar if hidden
                window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true, key: 'f', bubbles: true }));
            },
        },
        {
            id: "quickpaste",
            label: isQuickPaste ? "Disable Quick Paste" : "Enable Quick Paste",
            shortcut: "Ctrl+Shift+V",
            category: "display",
            icon: isQuickPaste ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />,
            action: () => { setOpen(false); requestQuickPaste() },
        },
        {
            id: "miniclip",
            label: isMiniClip ? "Exit Mini Mode" : "Enter Mini Mode",
            category: "display",
            icon: isMiniClip ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />,
            action: () => { setOpen(false); toggleMiniClip() },
        },
        {
            id: "hidecontent",
            label: hideContent ? "Show Content" : "Hide Content",
            category: "display",
            icon: hideContent ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />,
            action: () => { setOpen(false); toggleHideContent() },
        },
        {
            id: "sound",
            label: soundOn ? "Mute Sounds" : "Unmute Sounds",
            category: "settings",
            icon: soundOn ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />,
            action: () => { setOpen(false); toggleSound() },
        },
        {
            id: "howtouse",
            label: "How to Use Clipcat",
            shortcut: "?",
            category: "settings",
            icon: <BookOpen className="h-4 w-4" />,
            action: () => { setShowHowToUse(true) },
        },
    ], [isQuickPaste, isMiniClip, hideContent, soundOn, requestQuickPaste, toggleMiniClip, toggleHideContent, toggleSound])

    const filtered = useMemo(() => {
        if (!query.trim()) return commands
        const q = query.toLowerCase()
        return commands.filter(c => c.label.toLowerCase().includes(q))
    }, [commands, query])

    const categoryLabels: Record<string, string> = {
        clipboard: "Clipboard",
        display: "Display",
        settings: "Settings",
    }

    return (
        <>
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="bg-transparent! shadow-none border-0 p-0 w-[90vw] max-w-sm">
                <div className="setting-dialog relative w-full h-screen! sm:h-[90vh]! max-h-100 rounded-sm overflow-hidden">
                    <ScrollArea className="relative z-1 h-full pt-6 px-6 pb-4">
                        {/* Search input */}
                        <div className="flex items-center gap-2 pb-3 border-b border-amber-600/20">
                            <Search className="h-4 w-4 text-amber-700/50 shrink-0" />
                            <input
                                ref={inputRef}
                                type="text"
                                placeholder="Type a command..."
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none"
                            />
                            <kbd className="text-[10px] text-muted-foreground ml-auto opacity-50 shrink-0">esc</kbd>
                        </div>

                        {/* Command list */}
                        <div className="py-2">
                            {["clipboard", "display", "settings"].map(cat => {
                                const items = filtered.filter(c => c.category === cat)
                                if (items.length === 0) return null
                                return (
                                    <div key={cat} className="mb-2 last:mb-0">
                                        <div className="px-2 py-1 text-[10px] font-semibold text-amber-800/50 uppercase tracking-wider">
                                            {categoryLabels[cat]}
                                        </div>
                                        {items.map(cmd => (
                                            <button
                                                key={cmd.id}
                                                onClick={cmd.action}
                                                className="w-full flex items-center gap-3 px-3 py-2 text-sm text-amber-950 hover:bg-amber-100/70 rounded transition-colors text-left"
                                            >
                                                <span className="text-amber-700/50 shrink-0">{cmd.icon}</span>
                                                <span className="flex-1">{cmd.label}</span>
                                                {cmd.shortcut && (
                                                    <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-amber-200/50 text-amber-700/50 font-mono leading-none shrink-0">
                                                        {cmd.shortcut}
                                                    </kbd>
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )
                            })}
                            {filtered.length === 0 && (
                                <p className="text-center text-xs text-muted-foreground py-4">No commands found</p>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="flex items-center gap-4 pt-2 border-t border-amber-600/20 text-[10px] text-muted-foreground">
                            <span>â†‘â†“ navigate</span>
                            <span>â†µ select</span>
                            <span>esc close</span>
                        </div>
                    </ScrollArea>
                    <img src="/menu-clean.png" alt="" className="settings-bg" />
                </div>
            </DialogContent>
        </Dialog>
        <HowToUsePortal platform={platform} show={showHowToUse} onClose={setShowHowToUse} />
        </>)
}

// Render HowToUseDialog in a portal so it survives palette unmount
const HowToUsePortal = ({ platform, show, onClose }: { platform: string; show: boolean; onClose: (v: boolean) => void }) => {
    if (!show) return null
    return createPortal(
        <div className="" onClick={() => onClose(false)}>
          
            <div className="" onClick={e => e.stopPropagation()}>
                <HowToUseDialog platform={platform} open={show} onOpenChange={onClose} />
            </div>
        </div>,
        document.body
    )
}
