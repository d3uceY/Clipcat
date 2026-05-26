import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";
import {
  GetClips,
  AddClip,
  MakeMiniClip,
  IsMiniClip,
  IsStartupEnabled,
  EnableStartup,
  DisableStartup,
  IsPaused,
  PauseCapture,
  ResumeCapture,
  GetIgnoreList,
  AddIgnoreEntry,
  RemoveIgnoreEntry,
  GetGhostMode,
  SetGhostMode,
} from "../../wailsjs/go/main/App";
import { EventsOn } from "../../wailsjs/runtime";
import type { Clip } from "../../types/clip";

interface ClipContextType {
  clips: { pinned: Clip[]; recent: Clip[] };
  getClips: () => Promise<void>;
  addClip: (content: string, pinned: boolean) => Promise<void>;
  soundOn: boolean;
  toggleSound: () => void;
  hideContent: boolean;
  toggleMiniClip: () => Promise<void>;
  isMiniClip: boolean;
  isStartup: boolean;
  toggleStartup: () => Promise<void>;
  toggleHideContent: () => void;
  // Capture pause
  isPaused: boolean;
  togglePause: () => Promise<void>;
  // Ignore list
  ignoreList: string[];
  addIgnoreEntry: (name: string) => Promise<void>;
  removeIgnoreEntry: (name: string) => Promise<void>;
  // Ghost Mode
  isGhostMode: boolean;
  toggleGhostMode: () => Promise<void>;
}

const ClipContext = createContext<ClipContextType | undefined>(undefined);

export function ClipProvider({ children }: { children: ReactNode }) {
  const [clips, setClips] = useState<{ pinned: Clip[]; recent: Clip[] }>({
    pinned: [],
    recent: [],
  });
  const [soundOn, setSoundOn] = useState<boolean>(
    localStorage.getItem("soundOn") !== "false",
  );
  const [hideContent, setHideContent] = useState<boolean>(
    localStorage.getItem("hideContent") === "true" || false,
  );
  const [isMiniClip, setIsMiniClip] = useState(false);
  const [isStartup, setIsStartup] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [ignoreList, setIgnoreList] = useState<string[]>([]);
  const [isGhostMode, setIsGhostMode] = useState(false);

  /* ===============================
        GHOST MODE FUNCTIONS
       ===============================
    */
  const toggleGhostMode = async () => {
    const next = !isGhostMode;
    await SetGhostMode(next);
    setIsGhostMode(next);
  };

  /* ===============================
        CAPTURE PAUSE FUNCTIONS
       ===============================
    */
  const togglePause = async () => {
    if (isPaused) {
      await ResumeCapture();
      setIsPaused(false);
    } else {
      await PauseCapture();
      setIsPaused(true);
    }
  };

  /* ===============================
        IGNORE LIST FUNCTIONS
       ===============================
    */
  const loadIgnoreList = async () => {
    const list = await GetIgnoreList();
    setIgnoreList(list ?? []);
  };

  const addToIgnoreList = async (name: string) => {
    await AddIgnoreEntry(name);
    await loadIgnoreList();
  };

  const removeFromIgnoreList = async (name: string) => {
    await RemoveIgnoreEntry(name);
    await loadIgnoreList();
  };

  /* ===============================
        STARTUP FUNCTIONS     
       ===============================
    */
  const checkStartup = async () => {
    await IsStartupEnabled().then((res) => {
      setIsStartup(res);
    });
  };

  const toggleStartup = async () => {
    if (isStartup) {
      await DisableStartup().then(() => {
        setIsStartup(false);
      });
    } else {
      await EnableStartup().then(() => {
        setIsStartup(true);
      });
    }
  };

  /* ===============================
        MINI CLIP FUNCTIONS     
       ===============================
    */
  const toggleMiniClip = async () => {
    await MakeMiniClip(!isMiniClip).then(() => {
      setIsMiniClip((prev) => !prev);
    });

    await IsMiniClip().then((res) => {
      setIsMiniClip(res);
    });
  };

  /* ===============================
        CLIP OPS FUNCTIONS     
       ===============================
    */

  const getClips = async () => {
    return GetClips().then((data) => {
      if (data != null) {
        const pinned = data.filter((clip) => clip.isPinned);
        const recent = data.filter((clip) => !clip.isPinned);
        setClips({ pinned, recent });
      } else {
        setClips({ pinned: [], recent: [] });
      }
    });
  };

  const addClip = async (content: string, pinned: boolean) => {
    await AddClip(content, pinned);
    // getClips() is triggered by the clipboard:changed event emitted from Go.
  };

  /* ===============================
       HIDE CONTENT OPS FUNCTIONS
      ===============================
   */
  const toggleHideContent = () => {
    setHideContent((prev) => {
      localStorage.setItem("hideContent", (!prev).toString());
      return !prev;
    });
  };

  /* ===============================
       SOUND OPS FUNCTIONS
      ===============================
   */
  const toggleSound = () => {
    setSoundOn((prev) => {
      localStorage.setItem("soundOn", (!prev).toString());
      return !prev;
    });
  };

  /* ===============================
        RUN FUNCTIONS ON APP LOAD 
       ===============================
    */
  useEffect(() => {
    checkStartup();
    getClips();
    IsPaused().then(setIsPaused);
    loadIgnoreList();
    GetGhostMode()
      .then((v) => setIsGhostMode(v ?? false))
      .catch(() => {});
    EventsOn("clipboard:changed", () => {
      getClips();
    });
  }, []);

  /* ===============================
        SHORTCUT KEYS LISTENER
       ===============================
    */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey) {
        switch (e.key.toLowerCase()) {
          case "m":
            toggleMiniClip();
            break;
          case "s":
            toggleSound();
            break;
          case "h":
            toggleHideContent();
            break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [toggleMiniClip, toggleSound, toggleHideContent]);

  return (
    <ClipContext.Provider
      value={{
        // CLIP OPERATIONS
        clips,
        getClips,
        addClip,
        // SOUND OPERATIONS
        soundOn,
        toggleSound,
        // PRIVACY OPERATIONS
        hideContent,
        toggleHideContent,
        // MINI CLIP OPERATIONS
        isMiniClip,
        toggleMiniClip,
        // STARTUP OPERATIONS
        isStartup,
        toggleStartup,
        // CAPTURE PAUSE
        isPaused,
        togglePause,
        // IGNORE LIST
        ignoreList,
        addIgnoreEntry: addToIgnoreList,
        removeIgnoreEntry: removeFromIgnoreList,
        // GHOST MODE
        isGhostMode,
        toggleGhostMode,
      }}
    >
      {children}
    </ClipContext.Provider>
  );
}

export function useClips() {
  const context = useContext(ClipContext);
  if (context === undefined) {
    throw new Error("useClips must be used within a ClipProvider");
  }
  return context;
}
