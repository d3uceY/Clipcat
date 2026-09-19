// Clip ids travel to the frontend as DOM-style strings ("clip_007") because
// they double as element ids; the Go bindings take the numeric row id.
export const clipId = (id: string) => Number(id.replace("clip_", ""))
