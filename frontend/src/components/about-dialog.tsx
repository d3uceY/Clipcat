import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { useEffect, useState } from "react";
import { BrowserOpenURL } from "../../wailsjs/runtime/runtime";

interface AboutDialogProps {
    version: string;
}

interface UpdateInfo {
    version: string;
    releaseUrl: string;
    releaseDate: string;
}

export default function AboutDialog({ version }: AboutDialogProps) {
    const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null);
    const [isBirthday, setIsBirthday] = useState<boolean>(false);
    const [_, setIsChecking] = useState<boolean>(false);

    useEffect(() => {
        const today = new Date();
        if (today.getDate() === 24 && today.getMonth() === 9) {
            setIsBirthday(true);
        }

        const checkVersion = async () => {
            setIsChecking(true);
            try {

                // Fetch latest release from GitHub
                const response = await fetch("https://api.github.com/repos/d3uceY/Clipcat/releases/latest");
                if (!response.ok) {
                    throw new Error("Failed to fetch latest release");
                }

                const data = await response.json();
                const latestVersion = data.tag_name;
                //  LogPrint(`Current version: ${version}, Latest version: ${latestVersion}`); 
                // Compare versions
                const isStable = !version.endsWith("-dev") && !version.endsWith("-beta") && !version.endsWith("-alpha");
                if (latestVersion !== version && isStable) {
                    setUpdateAvailable({
                        version: latestVersion,
                        releaseUrl: data.html_url,
                        releaseDate: data.published_at,
                    });
                }
            } catch (error) {
                console.error("Error checking for updates:", error);
            } finally {
                setIsChecking(false);
            }
        };

        checkVersion();
    }, []);

    return (
        <Dialog>
            <DialogTrigger asChild>
                <button
                    className={`heartbeat info min-[400px]:block hidden sm:text-2xl hover:opacity-70 transition-opacity cursor-pointer font-bold about-btn ${updateAvailable || isBirthday ? "indicator" : ""}`}
                    title="About"
                >
                    ⓘ
                </button>
            </DialogTrigger>
            <DialogContent className="bg-transparent! shadow-none border-0 pt-9">
                <div className="absolute h-[calc(100%+2rem)] w-full -z-1">
                    <img src="/dialog-bg.png" alt="" className=" h-full w-full" />
                </div>
                <DialogHeader>
                    <DialogTitle className="text-2xl font-serif italic">About Clipcat</DialogTitle>
                    <DialogDescription className="text-base pt-4 space-y-3">
                        <p>
                            <strong>Clipcat</strong> is a creative clipboard manager that helps you keep track of your copied content with style.
                        </p>
                        <p>
                            Created with 💜 by <strong>Onyekwelu Jesse</strong> (
                            <button
                                onClick={() => BrowserOpenURL("https://github.com/d3uceY")}
                                className="text-blue-600 hover:underline cursor-pointer"
                            >
                                @d3uceY
                            </button>
                            )
                        </p>
                        {isBirthday && (
                            <div className="mt-4 p-3 bg-fuchsia-100 border border-fuchsia-200 rounded-md">
                                <p className="text-sm font-semibold text-fuchsia-800 mb-2">
                                    🎂 It's my Birthday!
                                </p>
                                <p className="text-sm text-fuchsia-700 mb-2">
                                    Today is October 24th! 🥳
                                </p>
                                <button
                                    onClick={() => BrowserOpenURL("https://www.linkedin.com/in/jesse-onyekwelu-4a8982275/")}
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
                        {updateAvailable && (
                            <div className="mt-2 pt-1">
                                <img src="/seperator.png" alt="" className="w-full my-2 opacity-70" />
                                <p className="text-sm font-bold">🎉 Update Available</p>
                                <p className="text-sm mt-1">
                                    Version <strong>{updateAvailable.version}</strong> is ready to download
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Released {new Date(updateAvailable.releaseDate).toLocaleDateString()}
                                </p>
                                <button
                                    onClick={() => BrowserOpenURL(updateAvailable.releaseUrl)}
                                    className="heartbeat hand-drawn-btn lined thin mt-3 px-3 py-1 text-base! font-bold hover:opacity-70 transition-opacity cursor-pointer"
                                >
                                    ⬇︎ Download Update
                                </button>
                            </div>
                        )} 
                    </DialogDescription>
                </DialogHeader>
            </DialogContent>
        </Dialog>
    );
}
