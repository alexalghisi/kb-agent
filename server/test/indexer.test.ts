import type { Redis } from "ioredis";
import type pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Connector, SourceDocument, SyncPage } from "../src/connectors/types.ts";
import { Indexer, SyncInProgress } from "../src/indexer.ts";
import { search, toTsQuery } from "../src/search.ts";
import { hasServices, services } from "./support.ts";

const doc = (id: string, title: string, body: string): SourceDocument => ({ externalId: id, title, url: `https://kb/${id}`, body, updatedAt: "2026-10-01T00:00:00Z" });

/** Serves scripted pages; cursors are page numbers. */
class Scripted implements Connector {
    readonly kind = "scripted";
    calls: (string | null)[] = [];
    failOn: number | null = null;
    pages: Omit<SyncPage, "nextCursor" | "hasMore">[];

    constructor(pages: Omit<SyncPage, "nextCursor" | "hasMore">[]) {
        this.pages = pages;
    }

    async sync(cursor: string | null): Promise<SyncPage> {
        this.calls.push(cursor);
        const index = cursor === null ? 0 : Number(cursor);
        if (this.failOn === index) throw new Error("source unavailable");
        const page = this.pages[index] ?? { upserts: [], deletes: [] };
        return { ...page, nextCursor: String(index + 1), hasMore: index + 1 < this.pages.length };
    }
}

describe("toTsQuery", () => {
    it("makes every term an optional prefix and drops punctuation", () => {
        expect(toTsQuery("VPN on mac?")).toBe("vpn:* | on:* | mac:*");
        expect(toTsQuery("a & b | !c")).toBe("a:* | b:* | c:*");
        expect(toTsQuery("  ")).toBe("");
    });
});

describe.skipIf(!hasServices)("Indexer and search", () => {
    let pool: pg.Pool;
    let redis: Redis;

    beforeAll(async () => {
        ({ pool, redis } = await services());
    });

    beforeEach(async () => {
        await pool.query("TRUNCATE sources, documents, chunks");
        await redis.flushdb();
    });

    afterAll(async () => {
        await pool.end();
        redis.disconnect();
    });

    it("indexes pages, skips unchanged documents and removes deleted ones", async () => {
        const indexer = new Indexer(pool, redis);
        const connector = new Scripted([
            { upserts: [doc("vpn", "VPN setup", "## macOS\n\nInstall the WireGuard client."), doc("sso", "SSO", "Use Okta.")], deletes: [] },
            { upserts: [doc("expenses", "Expenses", "Receipts within 30 days.")], deletes: [] },
        ]);
        expect(await indexer.sync("wiki", connector)).toEqual({ pages: 2, upserted: 3, unchanged: 0, deleted: 0 });

        connector.pages.push({ upserts: [doc("sso", "SSO", "Use Okta.")], deletes: ["vpn"] });
        expect(await indexer.sync("wiki", connector)).toEqual({ pages: 1, upserted: 0, unchanged: 1, deleted: 1 });
        expect(connector.calls.at(-1)).toBe("2");
        const { rows } = await pool.query("SELECT count(*)::int AS n FROM chunks WHERE external_id = 'vpn'");
        expect(rows[0].n).toBe(0);
    });

    it("commits each page with its cursor, so a failure resumes where it stopped", async () => {
        const indexer = new Indexer(pool, redis);
        const connector = new Scripted([{ upserts: [doc("a", "A", "alpha")], deletes: [] }, { upserts: [doc("b", "B", "bravo")], deletes: [] }]);
        connector.failOn = 1;
        await expect(indexer.sync("wiki", connector)).rejects.toThrow("source unavailable");
        connector.failOn = null;
        connector.calls = [];
        await indexer.sync("wiki", connector);
        expect(connector.calls).toEqual(["1"]);
        expect((await pool.query("SELECT external_id FROM documents ORDER BY 1")).rows.map((r) => r.external_id)).toEqual(["a", "b"]);
    });

    it("refuses to sync a source that is already being synced", async () => {
        const indexer = new Indexer(pool, redis);
        let release!: () => void;
        const slow: Connector = { kind: "slow", sync: () => new Promise((resolve) => (release = () => resolve({ upserts: [], deletes: [], nextCursor: "x", hasMore: false }))) };
        const first = indexer.sync("wiki", slow);
        await new Promise((r) => setTimeout(r, 50));
        await expect(indexer.sync("wiki", slow)).rejects.toBeInstanceOf(SyncInProgress);
        release();
        await first;
        await expect(indexer.sync("wiki", new Scripted([]))).resolves.toBeDefined();
    });

    it("finds sections, ranking heading matches first", async () => {
        await new Indexer(pool, redis).sync(
            "wiki",
            new Scripted([
                {
                    upserts: [
                        doc("vpn", "VPN setup", "## macOS\n\nInstall the WireGuard client and import your profile.\n\n## Windows\n\nUse the company portal."),
                        doc("travel", "Travel", "Book trains when the trip is under four hours. The VPN works abroad."),
                    ],
                    deletes: [],
                },
            ]),
        );
        const hits = await search(pool, "vpn mac");
        expect(hits[0]).toMatchObject({ title: "VPN setup", heading: "VPN setup › macOS", url: "https://kb/vpn" });
        expect(hits.map((h) => h.title)).toContain("Travel");
        expect(await search(pool, "  ")).toEqual([]);
        expect(await search(pool, "');DROP TABLE chunks;--")).toEqual([]);
    });
});
