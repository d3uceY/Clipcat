import { useState, useEffect } from "react"
import type { UpdateInfo } from "@/features/settings/components/about-dialog"
import { GetVersion } from "../../../../bindings/Clipcat/app"
import { playSound } from "@/utils/play-sound"

const GITHUB_API = "https://api.github.com/repos/d3uceY/Clipcat/releases/latest"

function isStable(version: string) {
    return !version.endsWith("-dev") && !version.endsWith("-beta") && !version.endsWith("-alpha")
}

async function fetchLatest(version: string): Promise<UpdateInfo | null> {
    try {
        const response = await fetch(GITHUB_API)
        if (!response.ok) return null
        const data = await response.json()
        const latest = data.tag_name
        if (latest !== version && isStable(version)) {
            return { version: latest, releaseUrl: data.html_url, releaseDate: data.published_at }
        }
        return null
    } catch {
        return null
    }
}

export function useUpdateCheck() {
    const [version, setVersion] = useState("")
    const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null)
    const [showUpdateDialog, setShowUpdateDialog] = useState(false)

    // Fetch current app version on mount
    useEffect(() => {
        GetVersion().then(setVersion).catch(err => console.error("Failed to get version:", err))
    }, [])

    // Initialize browser notifications
    useEffect(() => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().catch(() => { })
        }
    }, [])

    // Check for updates once version is loaded
    useEffect(() => {
        if (!version) return
        const run = async () => {
            const info = await fetchLatest(version)
            if (!info) return
            setUpdateInfo(info)
            const seenKey = `update-seen-${info.version}`
            if (!localStorage.getItem(seenKey)) {
                localStorage.setItem(seenKey, "1")
                setShowUpdateDialog(true)
                if ('Notification' in window && Notification.permission === 'granted') {
                    playSound("/sounds/notification.wav", localStorage.getItem("soundOn") !== "false", 1)
                    new Notification('Clipcat update available', {
                        body: `Version ${info.version} is ready to download.`,
                    })
                }
            }
        }
        run()
    }, [version])

    const checkForUpdates = async () => {
        if (!version) return
        setUpdateInfo(await fetchLatest(version))
    }

    return { version, updateInfo, showUpdateDialog, setShowUpdateDialog, checkForUpdates }
}
