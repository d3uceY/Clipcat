export const formatTime = (dateString: string) => {
        const date = new Date(dateString)
        const now = new Date()
        const diffMs = now.getTime() - date.getTime()
        const diffMins = Math.floor(diffMs / 60000)

        if (diffMins < 1) return "just now"
        if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? "s" : ""} ago`

        const diffHours = Math.floor(diffMins / 60)
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`

        const diffDays = Math.floor(diffHours / 24)
        return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`
    }
