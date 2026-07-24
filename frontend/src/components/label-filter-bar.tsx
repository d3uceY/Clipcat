import { memo, useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
import { ChevronDown, Check, Tag, X } from "lucide-react"
import { useClips } from "@/context/ClipContext"
import { ScrollArea } from "@/components/ui/scroll-area"

function LabelFilterBar() {
    const { distinctLabels, activeLabels, toggleLabelFilter, clearLabelFilters } = useClips()
    const [open, setOpen] = useState(false)
    const [dropdownStyle, setDropdownStyle] = useState<{ top: number; right: number }>()
    const containerRef = useRef<HTMLDivElement>(null)
    const btnRef = useRef<HTMLButtonElement>(null)
    const dropdownRef = useRef<HTMLDivElement>(null)

    // Close on outside click - checks both the trigger container AND the portal dropdown
    useEffect(() => {
        if (!open) return
        const handler = (e: MouseEvent) => {
            const target = e.target as Node
            const insideTrigger = containerRef.current?.contains(target)
            const insideDropdown = dropdownRef.current?.contains(target)
            if (!insideTrigger && !insideDropdown) {
                setOpen(false)
            }
        }
        document.addEventListener("mousedown", handler)
        return () => document.removeEventListener("mousedown", handler)
    }, [open])

    if (distinctLabels.length === 0) return null

    const label =
        activeLabels.length === 0
            ? "Labels"
            : activeLabels.length === 1
            ? activeLabels[0]
            : `${activeLabels.length} labels`

    const handleToggle = () => {
        if (!open && btnRef.current) {
            const rect = btnRef.current.getBoundingClientRect()
            setDropdownStyle({
                top: rect.bottom + 6,
                right: window.innerWidth - rect.right,
            })
        }
        setOpen(v => !v)
    }

    return (
        <div ref={containerRef} className="relative">
            {/* Trigger */}
            <button
                ref={btnRef}
                onClick={handleToggle}
                className="hand-drawn-btn lined thin flex items-center gap-2 px-3 py-1.5 text-xs bg-[#F9F5E6] text-amber-950 transition-all hover:bg-amber-100 relative top-2"
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

            {/* Dropdown panel - rendered in a portal so it's never clipped by overflow:hidden ancestors */}
            {open && dropdownStyle && createPortal(
                <div
                    ref={dropdownRef}
                    className="fixed z-9999 min-w-44 bg-[#F9F5E6]"
                    style={{
                        top: dropdownStyle.top,
                        right: dropdownStyle.right,
                        border: "solid 2px #41403e",
                        borderRadius: "12px 4px 12px 4px / 4px 12px 4px 12px",
                        boxShadow: "4px 8px 16px -4px hsla(0,0%,0%,0.18)",
                    }}
                >
                    <ScrollArea className="h-52">
                    <ul className="py-1 divide-y divide-amber-200/50">
                        {distinctLabels.map(lbl => {
                            const active = activeLabels.includes(lbl)
                            return (
                                <li key={lbl}>
                                    <button
                                        onClick={() => toggleLabelFilter(lbl)}
                                        className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors text-left ${
                                            active
                                                ? "bg-amber-200/60 text-amber-900 font-semibold"
                                                : "text-amber-950 hover:bg-amber-200/80 hover:text-amber-950"
                                        }`}
                                    >
                                        <span
                                            className={`h-3.5 w-3.5 shrink-0 flex items-center justify-center rounded-sm border ${
                                                active
                                                    ? "bg-amber-400 border-amber-700"
                                                    : "border-amber-400/60 bg-transparent"
                                            }`}
                                            style={{ borderStyle: "solid" }}
                                        >
                                            {active && <Check className="h-2.5 w-2.5 text-amber-950" />}
                                        </span>
                                        <span>{lbl}</span>
                                    </button>
                                </li>
                            )
                        })}
                    </ul>
                    </ScrollArea>

                    {activeLabels.length > 0 && (
                        <>
                            <div style={{ borderTop: "solid 1px #41403e20", margin: "2px 8px" }} />
                            <button
                                onClick={() => { clearLabelFilters(); setOpen(false) }}
                                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-amber-800/70 hover:text-amber-950 hover:bg-amber-100/60 transition-colors"
                            >
                                <X className="h-3 w-3" />
                                <span>Clear filters</span>
                            </button>
                        </>
                    )}
                </div>,
                document.body
            )}
        </div>
    )
}

export default memo(LabelFilterBar)
