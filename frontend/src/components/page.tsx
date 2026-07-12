import { useState, useRef, useEffect, lazy, Suspense } from "react";
import type { FilteredClips } from "../workers/search.worker";
import { startTour, hasSeenTour } from "@/helpers/onboarding";
import { Search, ShieldAlert, Wifi } from "lucide-react";
import ClipCard from "./clip-card";
import ClipListItem from "./clip-list-item";
import LabelFilterBar from "./label-filter-bar";
import { useClips } from "../context/ClipContext";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { playSound } from "@/helpers/playSound";
import WindowControls from "./window-controls";
import { GetVersion } from "../../wailsjs/go/main/App";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  BrowserOpenURL,
  InitializeNotifications,
  IsNotificationAvailable,
  RequestNotificationAuthorization,
  SendNotification,
} from "../../wailsjs/runtime/runtime";
import type { UpdateInfo } from "./about-dialog";

const AboutDialog = lazy(() => import("./about-dialog"));
const AddClipDialog = lazy(() => import("./add-clip-dialog"));

function PageContent() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [version, setVersion] = useState("");
  const [curtainsDone, setCurtainsDone] = useState(false);
  const [showSensitive, setShowSensitive] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const {
    clips,
    soundOn,
    hideContent,
    clipsLoaded,
    activeLabels,
    autoHideSensitive,
    isMiniClip,
    syncSettings,
  } = useClips();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const checkForUpdates = async () => {
    if (!version) return;
    try {
      const response = await fetch(
        "https://api.github.com/repos/d3uceY/Clipcat/releases/latest",
      );
      if (!response.ok) return;
      const data = await response.json();
      const latestVersion = data.tag_name;
      const isStable =
        !version.endsWith("-dev") &&
        !version.endsWith("-beta") &&
        !version.endsWith("-alpha");
      if (latestVersion !== version && isStable) {
        setUpdateInfo({
          version: latestVersion,
          releaseUrl: data.html_url,
          releaseDate: data.published_at,
        });
      } else {
        setUpdateInfo(null);
      }
    } catch {
      /* silently ignore network errors */
    }
  };

  useGSAP(() => {
    if (!clipsLoaded) return;
    const tl = gsap.timeline({
      onComplete: () => {
        // Remove compositor layers: clear GSAP inline transforms from all
        // animated elements so the browser can de-promote them, and remove
        // the paper curtain images from the DOM entirely - they are full-
        // viewport fixed layers that inflate GPU memory for the app's lifetime.
        gsap.set(".pussy", { clearProps: "transform" });
        gsap.set("h1, .torn-input", { clearProps: "all" });
        setCurtainsDone(true);
      },
    });
    tl.to(".paper-curtain-1", {
      left: "-53vw",
      duration: 1.5,
      ease: "steps(12)",
      rotation: -2,
      onStart: () => playSound("paper-curtain-sound.mp3", soundOn, 1),
    })
      .to(
        ".paper-curtain-2",
        {
          right: "-53vw",
          duration: 1.5,
          ease: "steps(9)",
          rotation: 2,
        },
        "-=1.5",
      )
      .to(
        ".paper-curtain-1",
        {
          rotation: 0,
          duration: 0.3,
          ease: "power2.out",
        },
        "-=0.3",
      )
      .to(
        ".paper-curtain-2",
        {
          rotation: 0,
          duration: 0.3,
          ease: "power2.out",
        },
        "-=0.3",
      )
      .from(
        ".pussy",
        {
          y: "120%",
          x: "-20%",
          rotation: -15,
          scale: 0.8,
          ease: "steps(12)",
        },
        "-=0.7",
      )
      .to(
        ".pussy",
        {
          rotation: 0,
          scale: 1,
          x: "0%",
          duration: 0.4,
          ease: "elastic.out(1, 0.6)",
        },
        "-=0.2",
      )
      .from(
        "h1, .torn-input",
        {
          opacity: 0,
          y: 20,
          rotation: -1,
          duration: 0.5,
          stagger: 0.15,
          ease: "back.out(1.5)",
        },
        "-=0.5",
      )
      .to("h1, .torn-input", {
        rotation: 0,
        duration: 0.3,
        ease: "power2.out",
      });
  }, [clipsLoaded]);

  useEffect(() => {
    GetVersion()
      .then(setVersion)
      .catch((err) => console.error("Failed to get version:", err));
  }, []);

  // Initialize notifications once on mount
  useEffect(() => {
    InitializeNotifications()
      .then(() => RequestNotificationAuthorization())
      .catch(() => {});
  }, []);

  // Run the update check once version is loaded
  useEffect(() => {
    if (!version) return;
    const run = async () => {
      try {
        const response = await fetch(
          "https://api.github.com/repos/d3uceY/Clipcat/releases/latest",
        );
        if (!response.ok) return;
        const data = await response.json();
        const latestVersion = data.tag_name;
        const isStable =
          !version.endsWith("-dev") &&
          !version.endsWith("-beta") &&
          !version.endsWith("-alpha");
        if (latestVersion !== version && isStable) {
          const info: UpdateInfo = {
            version: latestVersion,
            releaseUrl: data.html_url,
            releaseDate: data.published_at,
          };
          setUpdateInfo(info);
          // Show first-load dialog once per available version
          const seenKey = `update-seen-${latestVersion}`;
          if (!localStorage.getItem(seenKey)) {
            localStorage.setItem(seenKey, "1");
            setShowUpdateDialog(true);
            // Fire a system notification
            IsNotificationAvailable()
              .then((available) => {
                if (!available) return;
                playSound(
                  "/sounds/notification.wav",
                  localStorage.getItem("soundOn") !== "false",
                  1,
                );
                SendNotification({
                  id: `clipcat-update-${latestVersion}`,
                  title: "Clipcat update available",
                  body: `Version ${latestVersion} is ready to download.`,
                }).catch(() => {});
              })
              .catch(() => {});
          }
        }
      } catch {
        /* silently ignore */
      }
    };
    run();
  }, [version]);

  useEffect(() => {
    if (!hasSeenTour()) {
      // Small delay so the page entrance animation has finished
      const t = setTimeout(startTour, 2200);
      return () => clearTimeout(t);
    }
  }, []);

  const [filteredClips, setFilteredClips] = useState<FilteredClips>({
    pinned: [],
    recent: [],
    hiddenPinned: [],
    hiddenRecent: [],
  });
  const searchWorkerRef = useRef<Worker | null>(null);

  // Spin up the search worker once and tear it down on unmount.
  useEffect(() => {
    const worker = new Worker(
      new URL("../workers/search.worker.ts", import.meta.url),
      { type: "module" },
    );
    searchWorkerRef.current = worker;
    worker.onmessage = (e: MessageEvent<FilteredClips>) =>
      setFilteredClips(e.data);
    return () => {
      worker.terminate();
      searchWorkerRef.current = null;
    };
  }, []);

  // Re-filter whenever clips, the search query, or label filters change.
  // Runs off the main thread so typing never blocks the UI.
  useEffect(() => {
    searchWorkerRef.current?.postMessage({ clips, searchQuery, activeLabels });
  }, [clips, searchQuery, activeLabels]);

  const hiddenCount =
    filteredClips.hiddenPinned.length + filteredClips.hiddenRecent.length;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "f") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <main className=" bg-background p-6 md:p-10">
      {/* First-load update notification dialog */}
      <Dialog open={showUpdateDialog} onOpenChange={setShowUpdateDialog}>
        <DialogContent
          showCloseButton={false}
          className="hand-drawn lined thin p-6 bg-[#F9F5E6] max-w-sm border-0 sm:rounded-none"
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <h2 className="text-lg font-bold">🎉 Update Available</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Version <strong>{updateInfo?.version}</strong> of Clipcat is
                ready to download.
              </p>
              {updateInfo?.releaseDate && (
                <p className="text-xs text-muted-foreground">
                  Released{" "}
                  {new Date(updateInfo.releaseDate).toLocaleDateString()}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setShowUpdateDialog(false)}
                className="rounded px-3 py-1 text-sm bg-foreground/5 hover:bg-foreground/10 transition-colors"
              >
                Later
              </button>
              <button
                onClick={() => {
                  setShowUpdateDialog(false);
                  BrowserOpenURL("https://d3ucey.github.io/Clipcat/download");
                }}
                className="rounded px-3 py-1 text-sm bg-foreground text-white hover:opacity-80 transition-opacity"
              >
                ⬇︎ Download
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Draggable title bar */}
      <div
        className="fixed z-10 top-1 left-0 right-0 h-10 cursor-grab"
        style={{ "--wails-draggable": "drag" } as React.CSSProperties}
      ></div>
      <WindowControls
        updateAvailable={updateInfo}
        onCheckUpdate={checkForUpdates}
      />
      {!curtainsDone && (
        <>
          <img
            src="/paper-curtain.png"
            className="paper-curtain-1 h-screen fixed w-[53vw] left-0 top-0 bottom-0 z-10 "
          />
          <img
            src="/paper-curtain.png"
            className="paper-curtain-2 h-screen fixed w-[53vw] -right-8 top-0 bottom-0 z-10 "
          />
        </>
      )}

      {/* // pussy cat image */}
      <div className="h-[20vh] min-h-25 max-h-50 pussy fixed bottom-0 -left-6 z-1">
        {(searchFocused && searchQuery.length > 0) ||
        (filteredClips.pinned.length === 0 &&
          filteredClips.recent.length === 0) ? (
          <img
            src="/pussy-nothing.png"
            alt="pussy"
            className="block h-full pussy-nothing"
          />
        ) : !hideContent ? (
          <img src="/pussy.png" alt="pussy" className="block h-full pussy-1" />
        ) : (
          <img
            src="/pussy-hide.png"
            alt="pussy"
            className="block h-full pussy-2"
          />
        )}
      </div>
      <div className="margin"></div>
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-10 sm:flex-row flex justify-center items-center gap-8 sm:justify-between">
          {!isMiniClip && (
            <div id="tour-about" className="items-center gap-2 sm:flex">
              {version && (
                <Suspense fallback={null}>
                  <AboutDialog version={version} updateAvailable={updateInfo} />
                </Suspense>
              )}
            </div>
          )}

          <div className="relative w-full max-w-md torn-input">
            <div className="tape-1 absolute -top-3 left-0 h-12 w-4 bg-yellow-200/40 rotate-45 rounded-sm shadow-sm"></div>
            <div className="tape-2 absolute -top-3 right-0 h-12 w-4 bg-yellow-200/40 -rotate-45 rounded-sm shadow-sm"></div>
            <input
              id="tour-search"
              ref={searchInputRef}
              type="text"
              placeholder="Search (Ctrl+F)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              className="w-full text-base sm:text-xl px-4 pt-2 text-foreground placeholder-gray-500 focus:outline-none shadow-xl"
            />
            <Search className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[#c0bdbd]" />
          </div>
        </div>

        {/* Label filter bar - only renders when at least one label exists */}
        <LabelFilterBar />

        {/* Sensitive clips indicator - only shown when auto-hide is on and there are hidden clips */}
        {autoHideSensitive && hiddenCount > 0 && (
          <div
            className={`${!isMiniClip ? "mb-6" : "-mb-6 -mt-4"} flex items-center gap-3 flex-wrap`}
          >
            {isMiniClip ? (
              <button
                onClick={() => setShowSensitive((v) => !v)}
                className={`relative inline-flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors ${
                  showSensitive
                    ? "bg-amber-200 text-amber-900 border-amber-500"
                    : "bg-amber-400 text-white border-amber-500 hover:bg-amber-500 animate-pulse"
                }`}
                title={`${hiddenCount} sensitive clip${hiddenCount !== 1 ? "s" : ""} hidden - click to ${showSensitive ? "hide" : "reveal"}`}
              >
                <ShieldAlert className="h-4 w-4" />
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white leading-none">
                  {hiddenCount}
                </span>
              </button>
            ) : (
              <button
                onClick={() => setShowSensitive((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-full border transition-colors shadow-md ${
                  showSensitive
                    ? "bg-amber-100 text-amber-800 border-amber-400/60"
                    : "bg-amber-50/80 text-amber-700/80 border-amber-300/50 hover:bg-amber-100 hover:text-amber-800"
                }`}
              >
                <ShieldAlert className="h-3 w-3" />
                {hiddenCount} sensitive clip{hiddenCount !== 1 ? "s" : ""}{" "}
                hidden
              </button>
            )}
          </div>
        )}

        {/* LAN Sync indicator */}
        {syncSettings.enabled && (
          <div className={`${!isMiniClip ? "mb-6" : "-mb-6 -mt-4"}`}>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-full border shadow-md
                            ${
                              syncSettings.peerCount > 0
                                ? "bg-green-50/80 text-green-700 border-green-300/50"
                                : "bg-gray-50/80 text-gray-500 border-gray-300/50"
                            }`}
              title={
                syncSettings.peerCount > 0
                  ? `${syncSettings.peerCount} device${syncSettings.peerCount !== 1 ? "s" : ""} connected`
                  : "No devices connected"
              }
            >
              <Wifi
                className={`h-3 w-3 ${syncSettings.peerCount > 0 ? "" : "opacity-40"}`}
              />
              {syncSettings.peerCount > 0
                ? `${syncSettings.peerCount} connected`
                : "No peers"}
            </span>
          </div>
        )}

        {/* Sensitive clips - miniclip/quickpaste list view */}
        {isMiniClip && showSensitive && hiddenCount > 0 && (
          <section className="mb-4 rounded border border-dashed border-amber-400/40 bg-amber-50/20 p-2">
            <div className="flex flex-col gap-2">
              {[
                ...filteredClips.hiddenPinned,
                ...filteredClips.hiddenRecent,
              ].map((clip) => (
                <ClipListItem key={clip.id} clip={clip} revealed />
              ))}
            </div>
          </section>
        )}

        {/* Sensitive clips section - only shown when user expands it */}
        {!isMiniClip && showSensitive && hiddenCount > 0 && (
          <section className="mb-10 p-4 rounded border border-dashed border-amber-400/40 bg-amber-50/20">
            <div className="flex items-center gap-2 mb-4">
              <ShieldAlert className="h-4 w-4 text-amber-700/60" />
              <h2 className="text-sm font-medium italic text-amber-800/70">
                Sensitive Clips ({hiddenCount})
              </h2>
              <span className="text-xs text-muted-foreground/50 ml-1">
                - use the shield button on each card to mark as safe
              </span>
            </div>
            <div className="free-form-grid-container">
              {[
                ...filteredClips.hiddenPinned,
                ...filteredClips.hiddenRecent,
              ].map((clip, i) => (
                <ClipCard
                  key={clip.id}
                  clip={clip}
                  type={clip.isPinned ? "pinned" : "recent"}
                  initialVisible={i < 25}
                />
              ))}
            </div>
          </section>
        )}

        {/* Pinned Section */}
        {filteredClips.pinned.length > 0 && (
          <section className="mb-12">
            <div className="flex items-center gap-8 mb-4">
              <h2 className="sm:flex hidden items-center gap-2 text-2xl font-bold text-foreground">
                <span className="text-2xl">📌</span>
                <span className="italic">
                  Pinned{" "}
                  <span className="text-xl">
                    {" "}
                    ({filteredClips.pinned.length}){" "}
                  </span>
                </span>
              </h2>
              {!isMiniClip && (
                <div id="tour-add-clip" className="sm:m-0 mx-auto mb-2">
                  <Suspense fallback={null}>
                    <AddClipDialog>
                      <button
                        className="hover:scale-95 sm:p-2 p-4 rounded-lg! h-auto bg-amber-100 transition-transform hand-drawn-btn dashed thin"
                        title="Add new clip"
                      >
                        <div className="flex items-center sm:gap-2 gap-1 font-bold">
                          <span className="text-xs leading-0.5">Add Clip</span>
                          <span className="text-base leading-0.5">+</span>
                        </div>
                      </button>
                    </AddClipDialog>
                  </Suspense>
                </div>
              )}
            </div>
            {isMiniClip ? (
              <div className="flex flex-col gap-3">
                {filteredClips.pinned.map((clip) => (
                  <ClipListItem key={clip.id} clip={clip} />
                ))}
              </div>
            ) : (
              <div className="free-form-grid-container">
                {filteredClips.pinned.map((clip, i) => (
                  <ClipCard
                    key={clip.id}
                    clip={clip}
                    type="pinned"
                    initialVisible={i < 25}
                    tourId={i === 0 ? "tour-clip-card" : undefined}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Recent Section */}
        {filteredClips.recent.length > 0 && (
          <section>
            <div className="flex items-center gap-8 mb-4">
              <h2 className=" sm:flex hidden items-center gap-2 text-2xl font-bold text-foreground">
                <span className="text-2xl">📝</span>
                <span className="italic">
                  Recent{" "}
                  <span className="text-xl">
                    {" "}
                    ({filteredClips.recent.length}){" "}
                  </span>
                </span>
              </h2>
              {!isMiniClip && (
                <div>
                  <Suspense fallback={null}>
                    <AddClipDialog triggerClassName="sm:block hidden">
                      <button
                        className="hover:scale-95 p-2 rounded-lg! h-auto bg-amber-100 transition-transform hand-drawn-btn dashed thin"
                        title="Add new clip"
                      >
                        <div className="flex items-center sm:gap-2 gap-1 font-bold">
                          <span className="text-xs leading-0.5">Add Clip</span>
                          <span className="text-base leading-0.5">+</span>
                        </div>
                      </button>
                    </AddClipDialog>
                  </Suspense>
                </div>
              )}
            </div>
            {isMiniClip ? (
              <div className="flex flex-col gap-3">
                {filteredClips.recent.map((clip) => (
                  <ClipListItem key={clip.id} clip={clip} />
                ))}
              </div>
            ) : (
              <div className="free-form-grid-container">
                {filteredClips.recent.map((clip, i) => (
                  <ClipCard
                    key={clip.id}
                    clip={clip}
                    type="recent"
                    initialVisible={i < 25}
                    tourId={
                      i === 0 && filteredClips.pinned.length === 0
                        ? "tour-clip-card"
                        : undefined
                    }
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Empty State */}
        {filteredClips.pinned.length === 0 &&
          filteredClips.recent.length === 0 && (
            <div className="flex-col h-64 text-black flex items-center justify-center gap-2">
              <p className="text-lg text-black text-center">
                {searchQuery
                  ? "No clips found matching your search"
                  : "No clips yet. Start copying!"}
              </p>

              <div className="text-lg text-black text-center">OR</div>
              <div className="w-full flex justify-center">
                <Suspense fallback={null}>
                  <AddClipDialog>
                    <button
                      className="hover:scale-95 p-1 bg-amber-100 transition-transform cursor-pointer hand-drawn-btn dashed thin"
                      title="Add new clip"
                    >
                      <div className="flex items-center sm:gap-2 gap-1">
                        <span className="sm:text-xl text-lg">Add Clip</span>
                        <span className="sm:text-4xl text-2xl">+</span>
                      </div>
                    </button>
                  </AddClipDialog>
                </Suspense>
              </div>
            </div>
          )}
      </div>
    </main>
  );
}

import { ClipProvider } from "../context/ClipContext";

export default function Page() {
  return (
    <ClipProvider>
      <PageContent />
    </ClipProvider>
  );
}
