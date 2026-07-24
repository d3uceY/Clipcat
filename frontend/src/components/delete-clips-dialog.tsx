import { useState, useRef } from "react";
import { createPortal } from "react-dom";
import DeleteButton from "./delete-button";
import { DeleteAllClips, DeletePinnedClips, DeleteUnpinnedClips, ConfirmDelete } from "../../bindings/Clipcat/app";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { useClips } from "@/contexts/ClipContext";
import { playSound } from "@/utils/play-sound";


export default function DeleteClipsDialog({ children }: { children: React.ReactNode }) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const { getClips } = useClips();

    useGSAP(() => {
        if (!isOpen) return;

        const tl = gsap.timeline();

        tl.from(containerRef.current, {
            scale: 0,
            duration: 0.3,
            ease: "back.out(1.7)",
            onStart: () => {
                playSound('/sounds/paper-rise.mp3', true, 1.3);
            }
        })
            .from('.delete-container', {
                opacity: 0,
                scale: 0,
                stagger: 0.1,
                duration: 0.4,
                ease: "power1.out"
            })
            .fromTo('.delete-text', {
                opacity: 0,
            }, {
                stagger: 0.1,
                opacity: 1,
                duration: 0.4,
                ease: "power1.out",
            })

    }, { dependencies: [isOpen], scope: containerRef });

    const handleDeleteAllClips = async () => {
        const confirmed = await ConfirmDelete("Are you sure you want to delete ALL clips? This cannot be undone.")
        if (!confirmed) return
        setIsOpen(false)
        await DeleteAllClips()
        getClips()
    };

    const handleDeletePinnedClips = async () => {
        const confirmed = await ConfirmDelete("Are you sure you want to delete all pinned clips? This cannot be undone.")
        if (!confirmed) return
        setIsOpen(false)
        await DeletePinnedClips()
        getClips()
    };

    const handleDeleteUnpinnedClips = async () => {
        const confirmed = await ConfirmDelete("Are you sure you want to delete all recent clips? This cannot be undone.")
        if (!confirmed) return
        setIsOpen(false)
        await DeleteUnpinnedClips()
        getClips()
    };



    return (
        <>
            <div onClick={() => setIsOpen(true)} className="w-full">
                {children}
            </div>
            {isOpen && createPortal(
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setIsOpen(false)}>
                    <div className="relative pt-9 max-w-lg " onClick={(e) => e.stopPropagation()} ref={containerRef}>
                        <div className="absolute h-[calc(100%+4rem)] sm:h-[calc(100%+2rem)] sm:w-[110%] w-full -z-1 sm:-left-6 sm:top-4 top-0">
                            <img src="/dialog-bg.png" alt="" className=" h-full object-cover w-full md:object-fill" />
                        </div>

                        <div className="flex sm:flex-row flex-col sm:items-center justify-between gap-4 px-6 relative z-10 mt-4 ">
                            <div className="flex flex-col items-center gap-1 w-24  delete-container">
                                <DeleteButton onClick={handleDeleteUnpinnedClips} />
                                <span className="text-xs font-semibold text-center whitespace-nowrap delete-text">Delete Recents</span>
                            </div>
                            <div className="flex flex-col items-center gap-1 w-24  delete-container">
                                <DeleteButton onClick={handleDeletePinnedClips} />
                                <span className="text-xs font-semibold text-center whitespace-nowrap delete-text">Delete Pinned</span>
                            </div>
                            <div className="flex flex-col items-center gap-1 w-24  delete-container">
                                <DeleteButton onClick={handleDeleteAllClips} />
                                <span className="text-xs font-semibold text-center whitespace-nowrap delete-text">Delete All</span>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}