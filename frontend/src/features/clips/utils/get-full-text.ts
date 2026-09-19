import { GetClipContent } from "../../../../bindings/Clipcat/app"
import { clipId } from "@/features/clips/utils/clip-id"

// Fetches the full, untruncated text of a clip. List/search payloads only
// carry a truncated preview, so copy/edit/view fetch the full text here.
// Returns null on failure so callers can fall back to the preview.
export const getFullText = async (id: string): Promise<string | null> => {
    try {
        return await GetClipContent(clipId(id))
    } catch {
        return null
    }
}
