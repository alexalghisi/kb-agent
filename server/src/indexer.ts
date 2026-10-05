import { createHash } from "node:crypto";
import type { Redis } from "ioredis";
import type pg from "pg";
import { chunkMarkdown } from "./chunk.ts";
import type { Connector } from "./connectors/types.ts";

export interface SyncResult {
    readonly pages: number;
    readonly upserted: number;
    readonly unchanged: number;
    readonly deleted: number;
}

export class SyncInProgress extends Error {
    constructor(sourceId: string) {
        super(`A sync of ${sourceId} is already running`);
        this.name = "SyncInProgress";
    }
}

const hash = (text: string) => createHash("sha256").update(text).digest("hex");

/**
 * Pulls changes from a connector page by page and keeps documents and their chunks current.
 * Each page and its cursor are committed together. A Redis lock keeps two workers from syncing
 * the same source at once.
 */
export class Indexer {
    readonly #pool: pg.Pool;
    readonly #redis: Redis;

    constructor(pool: pg.Pool, redis: Redis) {
        this.#pool = pool;
        this.#redis = redis;
    }

    async sync(sourceId: string, connector: Connector, lockMs = 10 * 60_000): Promise<SyncResult> {
        const lockKey = `kb:sync-lock:${sourceId}`;
        const owner = `${process.pid}-${Math.random()}`;
        if ((await this.#redis.set(lockKey, owner, "PX", lockMs, "NX")) !== "OK") throw new SyncInProgress(sourceId);
        try {
            return await this.#run(sourceId, connector);
        } finally {
            // Only release the lock if it is still ours.
            await this.#redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0", 1, lockKey, owner);
        }
    }

    async #run(sourceId: string, connector: Connector): Promise<SyncResult> {
        await this.#pool.query("INSERT INTO sources (id, kind) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING", [sourceId, connector.kind]);
        const { rows } = await this.#pool.query<{ cursor: string | null }>("SELECT cursor FROM sources WHERE id = $1", [sourceId]);
        let cursor = rows[0]?.cursor ?? null;
        let pages = 0;
        let upserted = 0;
        let unchanged = 0;
        let deleted = 0;

        for (;;) {
            const page = await connector.sync(cursor);
            const client = await this.#pool.connect();
            try {
                await client.query("BEGIN");
                for (const doc of page.upserts) {
                    const contentHash = hash(`${doc.title}\n${doc.body}`);
                    const existing = await client.query<{ content_hash: string }>(
                        "SELECT content_hash FROM documents WHERE source_id = $1 AND external_id = $2",
                        [sourceId, doc.externalId],
                    );
                    if (existing.rows[0]?.content_hash === contentHash) {
                        unchanged++;
                        continue;
                    }
                    await client.query(
                        `INSERT INTO documents (source_id, external_id, title, url, content_hash, updated_at)
                         VALUES ($1, $2, $3, $4, $5, $6)
                         ON CONFLICT (source_id, external_id) DO UPDATE
                         SET title = EXCLUDED.title, url = EXCLUDED.url, content_hash = EXCLUDED.content_hash, updated_at = EXCLUDED.updated_at`,
                        [sourceId, doc.externalId, doc.title, doc.url, contentHash, doc.updatedAt],
                    );
                    await client.query("DELETE FROM chunks WHERE source_id = $1 AND external_id = $2", [sourceId, doc.externalId]);
                    for (const [position, chunk] of chunkMarkdown(doc.title, doc.body).entries()) {
                        await client.query(
                            "INSERT INTO chunks (source_id, external_id, position, heading, body) VALUES ($1, $2, $3, $4, $5)",
                            [sourceId, doc.externalId, position, chunk.heading, chunk.body],
                        );
                    }
                    upserted++;
                }
                if (page.deletes.length > 0) {
                    const result = await client.query("DELETE FROM documents WHERE source_id = $1 AND external_id = ANY($2)", [sourceId, page.deletes]);
                    deleted += result.rowCount ?? 0;
                }
                await client.query("UPDATE sources SET cursor = $2, synced_at = now() WHERE id = $1", [sourceId, page.nextCursor]);
                await client.query("COMMIT");
            } catch (error) {
                await client.query("ROLLBACK");
                throw error;
            } finally {
                client.release();
            }
            cursor = page.nextCursor;
            pages++;
            if (!page.hasMore) return { pages, upserted, unchanged, deleted };
        }
    }
}
