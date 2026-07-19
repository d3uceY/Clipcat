import { memo, useState, useRef, useEffect } from "react"
import { ChevronDown, Check, Tag, X } from "lucide-react"
import { useClips } from "@/context/ClipContext"
import { ScrollArea } from "@/components/ui/scroll-area"

function LabelFilterBar() {
    const { distinctLabels, activeLabels, toggleLabelFilter, clearLabelFilters } = useClips()
    const [open, setOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    // Close on outside click
    useEffect(() => {
        if (!open) return
        const handler = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false)
            }
        }
        document.addEventListener("mousedown", handler)
        return () => document.removeEventListener("mousedown", handler)
    }, [open])

    if (distinctLabels.length === 0) return null

    const label =
        activeLabels.length === 0
            ? "Filter by label"
            : activeLabels.length === 1
            ? activeLabels[0]
            : `${activeLabels.length} labels`

    return (
        <div ref={containerRef} className="relative">
            {/* Trigger */}
            <button
                onClick={() => setOpen(v => !v)}
                className="hand-drawn-btn dashed thin flex items-center gap-2 px-3 py-1.5 text-xs bg-[#F9F5E6] text-amber-900 transition-all hover:bg-amber-50"
            >
                <Tag className="h-3.5 w-3.5 shrink-0 text-amber-700" />
                {/* Full label text on lg+, icon-only below lg */}
                <span className="hidden lg:inline font-medium text-sm">{label}</span>
                {activeLabels.length > 0 && (
                    <span className="flex items-center justify-center h-4 w-4 rounded-full bg-amber-300 text-amber-900 text-[10px] font-bold leading-none">
                        {activeLabels.length}
                    </span>
                )}
                <ChevronDown
                    className={`hidden lg:block h-3.5 w-3.5 text-amber-700/60 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                />
            </button>

            {/* Dropdown panel – aligned to right edge of trigger */}
            {open && (
                <div
                    className="absolute top-full right-0 z-50 mt-1.5 min-w-44 bg-[#F9F5E6]"
                    style={{
                        border: "dashed 2px #41403e",
                        borderRadius: "12px 4px 12px 4px / 4px 12px 4px 12px",
                        boxShadow: "4px 8px 16px -4px hsla(0,0%,0%,0.18)",
                    }}
                >
                    <ScrollArea className="max-h-52">
                    <ul className="py-1">
                        {distinctLabels.map(lbl => {
                            const active = activeLabels.includes(lbl)
                            return (
                                <li key={lbl}>
                                    <button
                                        onClick={() => toggleLabelFilter(lbl)}
                                        className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-amber-900 hover:bg-amber-100/70 transition-colors text-left"
                                    >
                                        <span
                                            className={`h-3.5 w-3.5 shrink-0 flex items-center justify-center rounded-sm border ${
                                                active
                                                    ? "bg-amber-300 border-amber-600/70"
                                                    : "border-amber-400/50 bg-transparent"
                                            }`}
                                            style={{ borderStyle: "dashed" }}
                                        >
                                            {active && <Check className="h-2.5 w-2.5 text-amber-900" />}
                                        </span>
                                        <span className={active ? "font-semibold" : ""}>{lbl}</span>
                                    </button>
                                </li>
                            )
                        })}
                    </ul>
                    </ScrollArea>

                    {activeLabels.length > 0 && (
                        <>
                            <div style={{ borderTop: "dashed 1px #41403e40", margin: "2px 8px" }} />
                            <button
                                onClick={() => { clearLabelFilters(); setOpen(false) }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-amber-700/60 hover:text-amber-900 hover:bg-amber-100/50 transition-colors"
                            >
                                <X className="h-3 w-3" />
                                <span>Clear filters</span>
                            </button>
                        </>
                    )}
                </div>
            )}
        </div>
    )
}

export default memo(LabelFilterBar)
