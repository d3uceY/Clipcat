# Clipcat - Animations & Utility Modes (Mini Clip / Quick Paste)

This document explains how the app's entrance animations interact with Mini Clip and
Quick Paste mode, why opening the app from the tray used to freeze on first paint, and
why "Hide Content" was slow in those modes. It records both the fix and the false start
that was tried and reverted, so future work doesn't reintroduce the bug.

## Background

Clipcat has two "utility" modes:

- **Mini Clip** - a small (max 450x650), always-on-top window.
- **Quick Paste** - Mini Clip + the window hides to the tray after every paste; you
  re-summon it with the global hotkey (`Ctrl+Shift+V`).

In normal (full-screen) mode the window stays visible, so the paper-curtain entrance
animation plays once at startup and that's it. In utility modes the window can be
hidden to the tray while JavaScript is still running, which is where the problems start.

---

## 1. Freeze when opening the app via the hotkey

### Symptom

After enabling Mini Clip / Quick Paste, pressing the global hotkey to bring the window
back caused the app to **freeze briefly on the first paint** ("freezes at first").

### Root cause

The paper-curtain entrance is a GSAP timeline started once `clipsLoaded` becomes true:

```ts
useGSAP(() => {
    if (!clipsLoaded) return;
    const tl = gsap.timeline({ ... });
    tl.to('.paper-curtain-1', { left: "-53vw", duration: 1.5, ease: "steps(12)", ... })
      .to('.paper-curtain-2', { ... })
      .from('.pussy', { ... })
      .from('h1, .torn-input', { ... });
}, [clipsLoaded]);
```

GSAP drives all tweens off `requestAnimationFrame`. When the window is hidden to the
tray, the WebView stops ticking `rAF`, so any timeline that is **still running** when the
window hides **stalls mid-flight** - curtains half-open, pussy half-transformed. On the
next hotkey re-summon (`a.window.Show()` in `app.go`), `rAF` resumes and the stale
timeline picks up exactly where it froze, which reads as a frozen/janky first frame.

In utility modes this is especially wasteful because the entrance animates elements that
don't even render there (`.pussy` is `display:none` in mini mode, `.torn-input` /
`h1` don't exist in mini layout).

### Fix

Two parts, both in the frontend:

**1. A central "kill everything" helper** - [`frontend/src/utils/kill-animations.ts`](../frontend/src/utils/kill-animations.ts):

```ts
export function killAllAnimations(): void {
    // 1. Kill every GSAP tween/timeline (curtain entrance, settings
    //    choreography, tab magnets, delete-button hover, etc.)
    gsap.globalTimeline.clear();
    gsap.killTweensOf("*");

    // 2. Reset the inline styles GSAP left behind so elements snap back to
    //    their CSS baseline instead of a frozen mid-animation state.
    gsap.set([ ...animated selectors... ], { clearProps: "all" });
}
```

It kills all GSAP tweens/timelines and strips the inline styles GSAP wrote onto the
animated elements so they return to their CSS baseline. **It deliberately does NOT touch
CSS keyframe/transition effects** (e.g. the heartbeat) - only GSAP-owned animation is
cleaned up.

**2. Gate the entrance + kill on mode switch** - [`frontend/src/features/app-shell/components/page.tsx`](../frontend/src/features/app-shell/components/page.tsx):

```ts
// Latest "utility mode" flag, read inside the entrance effect without
// re-running it when the mode flips (so exiting Mini Clip never replays the curtain).
const utilityModeRef = useRef(false)
utilityModeRef.current = isMiniClip || isQuickPaste

// Entrance: skip entirely in utility modes - no curtain, no stall.
useGSAP(() => {
    if (!clipsLoaded) return;
    if (utilityModeRef.current) {
        setCurtainsDone(true)
        return
    }
    const tl = gsap.timeline({ ... });
    ...
}, [clipsLoaded])

// When Mini Clip / Quick Paste turns on, hard-stop all GSAP and finish the
// curtains immediately - before the window hides.
useEffect(() => {
    if (!isMiniClip && !isQuickPaste) return
    killAllAnimations()
    setCurtainsDone(true)
}, [isMiniClip, isQuickPaste])
```

Why the `useRef` instead of adding the flags to the effect's dependency array: the
entrance should only ever play **once** on first load. Adding `isMiniClip`/`isQuickPaste`
as dependencies would re-run it when you leave Mini mode back to full screen and
replay the curtain - the ref keeps the latest value without retriggering.

### Impact

- Enabling Mini Clip or Quick Paste kills every running GSAP animation **at the moment
  the mode switches on**, before the window can hide and stall them.
- The curtain entrance never runs in a utility mode, so there is no stale timeline to
  resume on the next hotkey summon.
- This covers every entry point: the settings toggle, the command palette, the Quick
  Paste confirm dialog, and the app restoring the mode on startup (all flow through the
  `isMiniClip`/`isQuickPaste` context flags).

---

## 2. "Hide Content" is slow in Mini Clip / Quick Paste but instant in full screen

### Symptom

Toggling **Hide Content** (blurs clip text/images with `.hard-to-read` →
`filter: blur(5px)`) applied quickly in full-screen mode but lagged noticeably in Mini
Clip / Quick Paste.

### Root cause

The two render paths virtualize completely differently:

- **Full screen** uses `ClipCard`, which is virtualized with an
  `IntersectionObserver`. Off-screen cards render as an empty placeholder:
  `if (!isVisible) return <div ref={cardRef} />`. So toggling Hide Content only has to
  blur the handful of cards actually on screen -> fast.
- **Mini / Quick Paste** uses `ClipListItem`, which renders **every** clip as a full row
  with no virtualization. Toggling Hide Content therefore applies `filter: blur(5px)`
  to every row in the scrollable list at once (up to the storage limit, 100-500 clips)
  -> the browser has to build hundreds of blur layers in one frame -> visible lag.

### Fix: `content-visibility` + an in-row pinned badge

To make mini mode skip off-screen rows like the cards do, `.clip-list-item` uses
`content-visibility: auto`:

```css
.clip-list-item {
  content-visibility: auto;
  contain-intrinsic-size: auto 96px;
}
```

`content-visibility: auto` applies **paint containment**, which clips anything painted
outside each row's box. That is exactly why the pinned indicator had to change:

- ❌ the old pin indicator was a `pin.png` image positioned at `-top-4`, i.e. **above**
  the row box - paint containment clipped it off.
- ✅ the pinned state is now shown by the **existing pin action button** itself: it
  turns red and stays visible (`opacity-0` is dropped) while the clip is pinned, and
  goes back to hover-only when unpinned. It sits inside the row (`top-2 right-2`), so
  it renders fully and still tells the user the clip is pinned (see `clip-list-item.tsx`).

Remaining caveats of paint containment:

- the hand-drawn `box-shadow` around each row is clipped to the row box,
- the hide-content blur is clipped at the row's edge.

These are accepted trade-offs: the shadow is subtle, and clipping the blur bleed keeps
each row's hidden content tidy. The important part is that nothing that matters visually
**overflows** the row anymore.

### Trade-off / future work

`content-visibility` reserves `contain-intrinsic-size: auto 96px` for off-screen rows. If
an image clip is taller than ~96px it briefly renders at that placeholder size while
scrolling into view (a minor pop). If that ever bothers you, the alternative is the same
**IntersectionObserver virtualization** the full-screen cards use - render empty
placeholder rows for off-screen items - but it needs a stable placeholder height, so it
trades the remembered-size smoothness for exact heights. Only change it if the pop is
noticeable.

---

## Files involved

| File | Role |
| --- | --- |
| [`frontend/src/utils/kill-animations.ts`](../frontend/src/utils/kill-animations.ts) | Central `killAllAnimations()` - kills all GSAP, resets inline styles, leaves CSS alone. |
| [`frontend/src/features/app-shell/components/page.tsx`](../frontend/src/features/app-shell/components/page.tsx) | Gates the curtain entrance in utility modes + `useEffect` that kills animations when Mini Clip / Quick Paste turns on. |
| [`frontend/src/features/clips/components/clip-list-item.tsx`](../frontend/src/features/clips/components/clip-list-item.tsx) | Mini/quick-paste list rows; carries the `clip-list-item` class; the pin action button turns red + stays visible while pinned (no overflowing `pin.png`). |
| [`frontend/src/index.css`](../frontend/src/index.css) | `.clip-list-item { content-visibility: auto; contain-intrinsic-size: auto 96px }` - skips off-screen rows so hide-content blur is cheap. |
| [`app.go`](../app.go) | Backend: `onHotkeyFired()` shows/focuses the window and emits `window:quickpaste-shown`; `makeMiniClip()` toggles window size/always-on-top. |

## Related

- [`performance-optimizations.md`](./performance-optimizations.md) - the masonry grid
  virtualization, batched layout reads, and shared ResizeObserver that the full-screen
  path relies on.
