import gsap from "gsap";

/**
 * Hard-stop every animation in the app and reset animated elements back to
 * their CSS baseline.
 *
 * Used when entering Mini Clip / Quick Paste. Those are "utility" modes where
 * the paper-curtain choreography is unnecessary, and once the window is hidden
 * to the tray the WebView stops ticking requestAnimationFrame, so any GSAP
 * timeline left running stalls mid-flight. Killing everything at the mode
 * switch prevents that frozen timeline from resuming on the next hotkey
 * re-summon (the "freezes at first" jank when opening from the tray).
 */
export function killAllAnimations(): void {
    // 1. Kill every GSAP tween/timeline: curtain entrance, settings
    //    choreography, tab magnets, delete-button hover, etc.
    gsap.globalTimeline.clear();
    gsap.killTweensOf("*");

    // 2. Reset the inline styles GSAP left behind so elements snap back to
    //    their CSS baseline instead of a frozen mid-animation state.
    //    Note: CSS keyframe/transition effects (e.g. the heartbeat) are left
    //    alone on purpose - only GSAP tweens/timelines are killed here.
    gsap.set(
        [
            ".paper-curtain-1",
            ".paper-curtain-2",
            ".pussy",
            "h1",
            ".torn-input",
            ".settings-title-char",
            ".settings-tagline",
            ".settings-stamp",
            ".settings-tape",
            ".settings-label",
            ".settings-row",
            "[data-tab]",
        ],
        { clearProps: "all" }
    );
}
