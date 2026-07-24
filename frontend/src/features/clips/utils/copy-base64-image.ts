export async function copyBase64ImageToClipboard(base64String: string) {
    try {
        const response = await fetch(base64String);
        const blob = await response.blob();
        const item = new ClipboardItem({ [blob.type]: blob });
        await navigator.clipboard.write([item]);
    } catch (err) {
        console.error("Failed to copy image: ", err);
    }
}
