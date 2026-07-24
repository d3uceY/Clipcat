import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

export default function HelpDialog() {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <button
                    className="text-xl hover:opacity-70 transition-opacity cursor-pointer font-bold border-2 border-current rounded-full w-8 h-8 flex items-center justify-center !p-0"
                    title="Help"
                >
                    ?
                </button>
            </DialogTrigger>
            <DialogContent showCloseButton={false} className="max-w-md bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm border-zinc-200 dark:border-zinc-800">
                <DialogClose className="absolute right-4 top-4 bg-[#F8F5F0]/80 w-7 h-7 flex items-center justify-center hand-drawn-btn lined thin text-sm! font-bold hover:opacity-70 z-10">
                    x
                </DialogClose>
                <DialogHeader>
                    <DialogTitle className="text-2xl font-serif italic text-purple-600 dark:text-purple-400">How to use Clipcat</DialogTitle>
                    <DialogDescription>
                        Master your clipboard workflow with these tips.
                    </DialogDescription>
                </DialogHeader>
                <ScrollArea className="h-[300px] w-full rounded-md border p-4">
                    <div className="space-y-4">
                        <section>
                            <h3 className="font-semibold text-lg mb-2">Basic Usage</h3>
                            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                                <li><strong>Copy</strong> text or images to automatically add them to Clipcat.</li>
                                <li><strong>Click</strong> on a clip to copy it back to your clipboard.</li>
                                <li><strong>Pin</strong> important clips to keep them at the top.</li>
                            </ul>
                        </section>

                        <section>
                            <h3 className="font-semibold text-lg mb-2">Shortcuts</h3>
                            <div className="grid grid-cols-[1fr_auto] gap-2 text-sm text-muted-foreground">
                                <span className="font-medium">Alt + M</span>
                                <span>Toggle Mini Clip Mode</span>
                                <span className="font-medium">Alt + S</span>
                                <span>Toggle Sound</span>
                                <span className="font-medium">Alt + H</span>
                                <span>Toggle Hide Content</span>
                            </div>
                        </section>

                        <section>
                            <h3 className="font-semibold text-lg mb-2">Tips</h3>
                            <ul className="list-disc pl-5 space-y-1 text-sm text-muted-foreground">
                                <li>Use Mini Clip mode to keep a small window always on top.</li>
                                <li>Hide content when you're in a public place or sharing your screen.</li>
                            </ul>
                        </section>
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
