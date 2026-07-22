import { useState, useEffect, useRef, useMemo } from "react"
import { Search, Eye, EyeOff, Volume2, VolumeX, Minimize2, Maximize2, Keyboard } from "lucide-react"
import { useClips } from "@/context/ClipContext"

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
    const inputRef = useRef<HTMLInputElement>(null)
    const {
        soundOn, toggleSound,
        hideContent, toggleHideContent,
        isMiniClip, toggleMiniClip,
        isQuickPaste, toggleQuickPaste,
    } = useClips()

    // Ctrl+K or Ctrl+Shift+P opens, Escape closes
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
                return
            }
            if (e.key === "Escape" && open) {
                e.preventDefault()
                setOpen(false)
            }
        }
        // Also open when search input is focused and user hasn't typed yet
        window.addEventListener("keydown", handler, true)
        return () => window.removeEventListener("keydown", handler, true)
    }, [open])

    // Focus input when opened
    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 50)
        }
    }, [open])

    const commands: Command[] = useMemo(() => [
        {
            id: "search",
            label: "Focus Search",
            shortcut: "Ctrl+F",
            category: "clipboard",
            icon: <Search className="h-4 w-4" />,
            action: () => { setOpen(false); document.getElementById("tour-search")?.focus() },
        },
        {
            id: "quickpaste",
            label: isQuickPaste ? "Disable Quick Paste" : "Enable Quick Paste",
            shortcut: "Ctrl+Shift+V",
            category: "display",
            icon: isQuickPaste ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />,
            action: () => { setOpen(false); toggleQuickPaste() },
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
            id: "shortcuts",
            label: "Keyboard Shortcuts Reference",
            shortcut: "?",
            category: "settings",
            icon: <Keyboard className="h-4 w-4" />,
            action: () => { setOpen(false); document.dispatchEvent(new CustomEvent("show:shortcuts")) },
        },
    ], [isQuickPaste, isMiniClip, hideContent, soundOn, toggleQuickPaste, toggleMiniClip, toggleHideContent, toggleSound])

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

    if (!open) return null

    return (
        <div className="fixed inset-0 z-100 flex items-start justify-center pt-[15vh]" onClick={() => setOpen(false)}>
            <div className="absolute inset-0 bg-black/30" />
            <div
                className="relative z-10 w-full max-w-lg bg-[#F9F5E6] hand-drawn lined thin overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Search input */}
                <div className="flex items-center gap-2 px-4 pt-3 pb-2 border-b border-dashed border-amber-600/40">
                    <Search className="h-4 w-4 text-amber-700/50 shrink-0" />
                    <input
                        ref={inputRef}
                        type="text"
                        placeholder="Type a command..."
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 outline-none"
                    />
                    <kbd className="text-[10px] text-muted-foreground ml-auto">esc to close</kbd>
                </div>

                {/* Command list grouped by category */}
                <div className="max-h-72 overflow-y-auto p-2">
                    {["clipboard", "display", "settings"].map(cat => {
                        const items = filtered.filter(c => c.category === cat)
                        if (items.length === 0) return null
                        return (
                            <div key={cat} className="mb-2 last:mb-0">
                                <div className="px-2 py-1 text-[10px] font-semibold text-amber-800/60 uppercase tracking-wider">
                                    {categoryLabels[cat]}
                                </div>
                                {items.map(cmd => (
                                    <button
                                        key={cmd.id}
                                        onClick={cmd.action}
                                        className="w-full flex items-center gap-3 px-3 py-2 text-sm text-amber-950 hover:bg-amber-100/70 rounded transition-colors text-left"
                                    >
                                        <span className="text-amber-700/60 shrink-0">{cmd.icon}</span>
                                        <span className="flex-1">{cmd.label}</span>
                                        {cmd.shortcut && (
                                            <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-amber-200/60 text-amber-700/60 font-mono">
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
                <div className="flex items-center gap-4 px-4 py-2 border-t border-dashed border-amber-600/40 text-[10px] text-muted-foreground">
                    <span>↑↓ navigate</span>
                    <span>↵ select</span>
                    <span>esc close</span>
                </div>
            </div>
        </div>
    )
}
