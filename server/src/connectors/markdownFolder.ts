import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import type { Connector, SourceDocument, SyncPage } from "./types.ts";

interface FolderCursor {
    readonly files: Record<string, string>; // relative path -> mtime ISO
}

async function* walk(dir: string): AsyncGenerator<string> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) yield* walk(path);
        else if (entry.name.endsWith(".md")) yield path;
    }
}

function titleOf(markdown: string, fallback: string): string {
    return /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim() ?? fallback;
}

/** A folder of Markdown files (an exported wiki, a docs repo). Changes are found by comparing modification times. */
export class MarkdownFolderConnector implements Connector {
    readonly kind = "markdown-folder";
    readonly #root: string;
    readonly #baseUrl: string;

    constructor(root: string, baseUrl = "file://") {
        this.#root = root;
        this.#baseUrl = baseUrl;
    }

    async sync(cursor: string | null): Promise<SyncPage> {
        const previous: FolderCursor = cursor ? (JSON.parse(cursor) as FolderCursor) : { files: {} };
        const current: Record<string, string> = {};
        const upserts: SourceDocument[] = [];
        for await (const path of walk(this.#root)) {
            const id = relative(this.#root, path);
            const mtime = (await stat(path)).mtime.toISOString();
            current[id] = mtime;
            if (previous.files[id] === mtime) continue;
            const body = await readFile(path, "utf8");
            upserts.push({ externalId: id, title: titleOf(body, id), url: `${this.#baseUrl}${id}`, body, updatedAt: mtime });
        }
        const deletes = Object.keys(previous.files).filter((id) => !(id in current));
        return { upserts, deletes, nextCursor: JSON.stringify({ files: current }), hasMore: false };
    }
}
