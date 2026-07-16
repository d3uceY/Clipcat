import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { useEffect, useState } from "react";
import { Browser } from "@wailsio/runtime";
import { GetPlatform } from "../../bindings/Clipcat/app";
import HowToUseDialog from "./how-to-use-dialog";

export interface UpdateInfo {
    version: string;
    releaseUrl?: string;
    releaseDate?: string;
}

interface AboutDialogProps {
    version: string;
    updateAvailable?: UpdateInfo | null;
}


export default function AboutDialog({ version, updateAvailable }: AboutDialogProps) {
    const [isBirthday, setIsBirthday] = useState<boolean>(false);
    const [platform, setPlatform] = useState<string>("");
    const [hasSeenHowToUse, setHasSeenHowToUse] = useState<boolean>(
        () => localStorage.getItem("clipcat-how-to-use-seen") === "true"
    );

    useEffect(() => {
        const today = new Date();
        if (today.getDate() === 24 && today.getMonth() === 9) {
            setIsBirthday(true);
        }

        GetPlatform().then(setPlatform).catch(() => setPlatform(""));

    }, []);

    return (
        <Dialog>
            <DialogTrigger asChild>
                <button
                    className={`info min-[400px]:block hidden sm:text-2xl hover:opacity-70 transition-opacity cursor-pointer font-bold about-btn ${isBirthday || !hasSeenHowToUse || updateAvailable ? "indicator heartbeat" : ""}`}
                    title="About"
                >
                    ⓘ
                </button>
            </DialogTrigger>
            <DialogContent className="bg-transparent! shadow-none border-0 pt-9 max-h-[88vh]">
                <div className="absolute h-[calc(100%+2rem)] w-full -z-1">
                    <img src="/dialog-bg.png" alt="" className=" h-full w-full" />
                </div>
                <DialogHeader>
                    <DialogTitle className="text-2xl font-serif italic">About Clipcat</DialogTitle>
                    <DialogDescription className="text-base pt-4 space-y-3">
                        <p>
                            <strong>Clipcat</strong> is a creative clipboard manager that helps you keep track of your copied content with style.{' '}
                            <button
                                onClick={() => Browser.OpenURL('https://d3ucey.github.io/Clipcat/docs/intro')}
                                className="text-blue-600 hover:underline cursor-pointer"
                            >
                                Read the docs
                            </button>
                        </p>
                        <p>
                            Created with 💜 by <strong>Onyekwelu Jesse</strong> (
                            <button
                                onClick={() => Browser.OpenURL("https://github.com/d3uceY")}
                                className="text-blue-600 hover:underline cursor-pointer"
                            >
                                @d3uceY
                            </button>
                            )
                        </p>
                        {isBirthday && (
                            <div className="mt-4 p-3 bg-fuchsia-100 border border-fuchsia-200 rounded-md">
                                <p className="text-sm font-semibold text-fuchsia-800 mb-2">
                                    It's my Birthday!
                                </p>
                                <p className="text-sm text-fuchsia-700 mb-2">
                                    Today is October 24th!
                                </p>
                                <button
                                    onClick={() => Browser.OpenURL("https://www.linkedin.com/in/jesse-onyekwelu-4a8982275/")}
                                    className="inline-block mt-1 px-3 py-1.5 bg-fuchsia-600 text-white text-sm rounded hover:bg-fuchsia-700 transition-colors cursor-pointer"
                                >
                                    Visit my LinkedIn Profile
                                </button>
                            </div>
                        )}
                        {version && (
                            <p className="text-xs text-muted-foreground pt-1">
                                Version: {version}
                            </p>
                        )}

                        {/* How to Use */}
                        <div>
                            <HowToUseDialog
                                platform={platform}
                                hasSeenHowToUse={hasSeenHowToUse}
                                onOpen={() => {
                                    localStorage.setItem("clipcat-how-to-use-seen", "true");
                                    setHasSeenHowToUse(true);
                                }}
                            />
                        </div>
                    </DialogDescription>
                </DialogHeader>
            </DialogContent>
        </Dialog>
    );
}
