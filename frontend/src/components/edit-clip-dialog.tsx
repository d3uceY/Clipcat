import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog"
import { useState } from "react"
import { Check, X } from "lucide-react"
import { UpdateClipContent } from "../../wailsjs/go/main/App"
// import TeaseDialog from "./tease-dialog"
import type { Clip } from '../../types/clip'

interface EditClipDialogProps {
    children: React.ReactNode;
    clip: Clip;
    triggerClassName?: string;
    className?: string;
}

export default function EditClipDialog({ children, clip, triggerClassName, className }: EditClipDialogProps) {
    const [open, setOpen] = useState(false)
    const [content, setContent] = useState(clip.content || "")


    const handleSave = async () => {
        if (!content.trim()) return;

        const clipId = Number(clip.id.replace('clip_', ''))
        await UpdateClipContent(clipId, content)

        setOpen(false)
    }

    const handleCancel = () => {
        setOpen(false)
        setContent(clip.content || "")
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild className={triggerClassName}>
                {children}
            </DialogTrigger>
            <DialogContent showCloseButton={false} className={`hand-drawn lined thin p-6 bg-[#F9F5E6] max-w-md border-0 sm:rounded-none ${className}`}>
                {/* Header - No pin option for edit */}
                <div className="flex justify-end mb-2 h-6">
                   {/* Spacer to keep layout similar if needed, or just empty */}
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
                        title="Save Changes"
                    >
                        <Check className="h-5 w-5" />
                    </button>
                </div>
            </DialogContent>
       </Dialog>
    )
}
