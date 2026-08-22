import { GetClipContent } from "../../../../bindings/Clipcat/app"

// Fetches the full, untruncated text of a clip. List/search payloads only
// carry a truncated preview, so copy/edit/view fetch the full text here.
// Returns null on failure so callers can fall back to the preview.
export const getFullText = async (id: string): Promise<string | null> => {
    const clipId = Number(id.replace("clip_", ""))
    try {
        return await GetClipContent(clipId)
    } catch {
        return null
    }
}
