import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"
import { useState } from "react"
import { Check, X, Pin } from "lucide-react"
import { useClips } from "@/contexts/ClipContext"

interface AddClipDialogProps {
    children: React.ReactNode;
    triggerClassName?: string;
    className?: string;
}

export default function AddClipDialog({ children, triggerClassName, className }: AddClipDialogProps) {
    const [open, setOpen] = useState(false)
    const [content, setContent] = useState("")
    const [isPinned, setIsPinned] = useState(false)
    const { addClip } = useClips()

    const handleSave = async () => {
        if (!content.trim()) return;

        await addClip(content, isPinned)

        setOpen(false)
        setContent("")
        setIsPinned(false)
    }

    const handleCancel = () => {
        setOpen(false)
        setContent("")
        setIsPinned(false)
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild className={triggerClassName}>
                {children}
            </DialogTrigger>
            <DialogContent showCloseButton={false} className={`hand-drawn lined thin p-6 bg-[#F9F5E6] max-w-md border-0 sm:rounded-none ${className}`}>
                {/* Header/Pin option */}
                <div className="flex justify-end mb-2">
                    <button
                        onClick={() => setIsPinned(!isPinned)}
                        className={`rounded p-1.5 transition-colors ${isPinned
                            ? "bg-yellow-100 text-yellow-700 hover:bg-red-100 hover:text-red-700"
                            : "bg-foreground/5 text-foreground hover:bg-yellow-100 hover:text-yellow-700"
                            }`}
                        title={isPinned ? "Unpin upon creation" : "Pin upon creation"}
                    >
                        <Pin className={`h-4 w-4 ${isPinned ? "fill-current" : ""}`} />
                    </button>
                </div>

                {/* Content Input */}
                <textarea
                    className="w-full min-h-37.5 bg-transparent resize-none outline-none text-foreground placeholder:text-muted-foreground/50 border-b border-dashed border-gray-400"
                    placeholder="Type your clip content here..."
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    autoFocus
                />

                {/* Actions */}
                <div className="flex justify-end gap-2 mt-4">
                    <button
                        onClick={handleCancel}
                        className="rounded-full p-2 hover:bg-red-100 text-red-500 transition-colors"
                        title="Cancel"
                    >
                        <X className="h-5 w-5" />
                    </button>
                    <button
                        onClick={handleSave}
                        className="rounded-full p-2 hover:bg-green-100 text-green-600 transition-colors"
                        title="Save Clip"
                    >
                        <Check className="h-5 w-5" />
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
