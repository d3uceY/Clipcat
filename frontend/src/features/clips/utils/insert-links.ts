
export const insertLinks = (text: string | any) => {
    if (!text) return text;
    
    // escape all HTML entities to prevent arbitrary HTML injection
    const escapeHtml = (str: string) => {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    };
    
    // Escape the original text
    let modifiedText = escapeHtml(text);
    
    // Now find URLs and convert them to links
    // Stop at: whitespace, quotes, brackets, ampersands (&), commas, backslashes
    const urlRegex = /(?<!["\w:])https?:\/\/(?:www\.)?[^\s"'<>&,\\]+/g;
    const matches = modifiedText.match(urlRegex);

    if (matches) {
        for (let i = 0; i < matches.length; i++) {
            const url = matches[i];
            const link = `<span class="inserted-link" data-url="${url}">${url}</span>`;
            modifiedText = modifiedText.replace(url, link);
        }
    }

    return modifiedText;
}