import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { useEffect, useState } from "react"


interface TeaseDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    detectedWord: 'Mena' | 'Jesse' | null
    onClose: () => void
}

const menaTeases = [
    "Mena? Really?",
    "typing about Mena again?",
    "I knew you'd type that! I told you not to!",
    "Can't get Mena out of your head?",
    "Mena, Mena, Mena...",
    "Caught in 4k!",
    "Why are you clipping Mena?",
    "Look at you typing Mena..."
]

const jesseTeases = [
    "I knew you would try to type my name too lmao",
    "Nice try, but I'm watching.",
    "Fan behavior detected.",
    "You can't just clip the developer.",
    "Jesse is strictly off limits.",
    "Trying to clip the creator?",
    "I know Walter White too!",
    "Breaking Bad vibes..."
]

export default function TeaseDialog({ open, onOpenChange, detectedWord, onClose }: TeaseDialogProps) {
    const [message, setMessage] = useState("")

    useEffect(() => {
        if (open && detectedWord) {
            const list = detectedWord === 'Mena' ? menaTeases : jesseTeases
            const randomMsg = list[Math.floor(Math.random() * list.length)]
            setMessage(randomMsg)
        }
    }, [open, detectedWord])

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-transparent! shadow-none border-0 pt-9 sm:max-w-106.25">
                <div className="absolute top-0 left-0 h-[calc(100%+2rem)] w-full -z-1">
                    <img src="/dialog-bg.png" alt="" className="h-full w-full object-fill" />
                </div>

                <button
                    onClick={onClose}
                    className="absolute right-8 top-8 bg-[#F8F5F0] w-7 h-7 flex items-center justify-center hand-drawn-btn lined thin text-sm! font-bold hover:opacity-70 z-10"
                    title="Close"
                >
                    x
                </button>

                <DialogHeader className="flex flex-col items-center justify-center text-center pt-8 pb-8 px-4">
                    <DialogTitle className="text-2xl font-serif italic mb-4">
                        {detectedWord === 'Mena' ? "Caught You!" : "Nice Try!"}
                    </DialogTitle>
                    <DialogDescription className="text-lg font-handwriting text-foreground font-bold">
                        {message}
                    </DialogDescription>
                </DialogHeader>
            </DialogContent>
        </Dialog>
    )
}
