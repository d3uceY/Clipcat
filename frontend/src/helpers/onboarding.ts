import { driver } from "driver.js"
import "driver.js/dist/driver.css"

const STORAGE_KEY = "clipcat_tour_done"

export function hasSeenTour(): boolean {
    return localStorage.getItem(STORAGE_KEY) === "true"
}

export function startTour() {
    const tour = driver({
        showProgress: true,
        animate: true,
        overlayColor: "rgba(0,0,0,0.45)",
        popoverClass: "clipcat-tour",
        nextBtnText: "Next →",
        prevBtnText: "← Back",
        doneBtnText: "Got it!",
        onDestroyed: () => {
            localStorage.setItem(STORAGE_KEY, "true")
        },
        steps: [
            {
                popover: {
                    title: "Welcome to Clipcat!",
                    description:
                        "Clipcat keeps everything you copy ( text, images, and more ) just a glance away. Let's take a quick tour.",
                },
            },
            {
                element: "#tour-search",
                popover: {
                    title: "Search your clips",
                    description:
                        "Type here to instantly filter through all your clips. You can also hit <strong>Ctrl+F</strong> from anywhere to jump straight to this box.",
                    side: "bottom",
                },
            },
            {
                element: "#tour-add-clip",
                popover: {
                    title: "Add a clip manually",
                    description:
                        "You can paste or type anything here to save it as a new clip - handy for snippets you want to keep on hand.",
                    side: "bottom",
                },
            },
            {
                element: "#tour-clip-card",
                popover: {
                    title: "Your clips",
                    description:
                        "Each card is a saved clip. Hover over a card to reveal the action buttons: copy, paste-back, edit, pin, and delete.",
                    side: "right",
                },
            },
            {
                element: "#tour-settings",
                popover: {
                    title: "Settings",
                    description:
                        "Tweak the app here - toggle Mini Clip mode, hide content for privacy, adjust your clipboard limit, manage blocked apps, and more.",
                    side: "left",
                },
            },
            {
                element: "#tour-about",
                popover: {
                    title: "About",
                    description:
                        "See version info and check for updates here. That's all - you're ready to go!",
                    side: "bottom",
                },
            },
        ],
    })

    tour.drive()
}
