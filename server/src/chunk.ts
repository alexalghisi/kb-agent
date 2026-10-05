export interface Chunk {
    readonly heading: string;
    readonly body: string;
}

/**
 * Splits Markdown at headings, then packs paragraphs into chunks of about `maxChars`, so a search hit
 * points at a section rather than a whole document. Each chunk keeps the heading path it sits under.
 */
export function chunkMarkdown(title: string, markdown: string, maxChars = 800): Chunk[] {
    const chunks: Chunk[] = [];
    const path: string[] = [];
    let buffer: string[] = [];

    const flush = () => {
        const body = buffer.join("\n\n").trim();
        if (body) chunks.push({ heading: [title, ...path].filter((h, i, all) => h && all.indexOf(h) === i).join(" › "), body });
        buffer = [];
    };

    for (const block of markdown.split(/\n\s*\n/)) {
        const heading = /^(#{1,6})\s+(.+)$/.exec(block.trim());
        if (heading?.[1] && heading[2]) {
            flush();
            path.splice(heading[1].length - 1);
            path[heading[1].length - 1] = heading[2].trim();
            continue;
        }
        const text = block.trim();
        if (!text) continue;
        if (buffer.join("\n\n").length + text.length > maxChars && buffer.length > 0) flush();
        if (text.length > maxChars) {
            for (let i = 0; i < text.length; i += maxChars) {
                buffer.push(text.slice(i, i + maxChars));
                flush();
            }
            continue;
        }
        buffer.push(text);
    }
    flush();
    return chunks;
}
