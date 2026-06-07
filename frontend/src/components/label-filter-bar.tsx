import { memo } from "react"
import { X } from "lucide-react"
import { useClips } from "@/context/ClipContext"
import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area"

function LabelFilterBar() {
    const { distinctLabels, activeLabels, toggleLabelFilter, clearLabelFilters } = useClips()

    if (distinctLabels.length === 0) return null

    return (
        <div className="mb-6">
            <ScrollAreaPrimitive.Root className="w-full" type="hover">
                <ScrollAreaPrimitive.Viewport className="w-full">
                    <div className="flex items-center gap-2 pb-2">
                        {distinctLabels.map(label => {
                            const active = activeLabels.includes(label)
                            return (
                                <button
                                    key={label}
                                    onClick={() => toggleLabelFilter(label)}
                                    className={`inline-flex shrink-0 items-center px-3 py-1 text-xs rounded-full border transition-colors shadow-lg ${
                                        active
                                            ? "bg-amber-200 text-amber-900 border-amber-500/70 font-medium"
                                            : "bg-amber-50 text-amber-800/75 border-amber-400/50 hover:bg-amber-100 hover:text-amber-900 hover:border-amber-500/60"
                                    }`}
                                >
                                    {label}
                                </button>
                            )
                        })}
                        {activeLabels.length > 0 && (
                            <button
                                onClick={clearLabelFilters}
                                className="inline-flex shrink-0 items-center gap-1 px-2.5 py-1 text-xs rounded-full border border-transparent text-foreground/40 hover:text-foreground/65 transition-colors"
                                title="Clear label filters"
                            >
                                <X className="h-3 w-3" />
                                <span>clear</span>
                            </button>
                        )}
                    </div>
                </ScrollAreaPrimitive.Viewport>
                <ScrollAreaPrimitive.Scrollbar
                    orientation="horizontal"
                    className="flex h-1.5 touch-none select-none flex-col rounded-full"
                >
                    <ScrollAreaPrimitive.Thumb className="relative flex-1 rounded-full bg-amber-400/60 hover:bg-amber-500/70 transition-colors cursor-grab active:cursor-grabbing" />
                </ScrollAreaPrimitive.Scrollbar>
            </ScrollAreaPrimitive.Root>
        </div>
    )
}

export default memo(LabelFilterBar)
