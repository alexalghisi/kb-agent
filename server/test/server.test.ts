import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Redis } from "ioredis";
import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MarkdownFolderConnector } from "../src/connectors/markdownFolder.ts";
import { OfflineModel } from "../src/offlineModel.ts";
import { createServer } from "../src/server.ts";
import { hasServices, services } from "./support.ts";

describe.skipIf(!hasServices)("HTTP API", () => {
    let pool: pg.Pool;
    let redis: Redis;
    let app: ReturnType<typeof createServer>;

    beforeAll(async () => {
        ({ pool, redis } = await services());
        const dir = await mkdtemp(join(tmpdir(), "kb-"));
        await writeFile(join(dir, "vpn.md"), "# VPN setup\n\n## macOS\n\nInstall the WireGuard client from Self Service and import the profile from IT.");
        await writeFile(join(dir, "leave.md"), "# Leave\n\nEveryone gets 25 days of paid leave, plus public holidays.");
        app = createServer({ pool, redis, sources: { wiki: new MarkdownFolderConnector(dir, "https://wiki/") }, model: new OfflineModel(), corsOrigin: "http://localhost:5173" });
    });

    afterAll(async () => {
        await app.close();
        await pool.end();
        redis.disconnect();
    });

    it("syncs a source, then answers with a citation", async () => {
        expect((await app.inject({ method: "POST", url: "/sources/wiki/sync" })).json()).toEqual({ pages: 1, upserted: 2, unchanged: 0, deleted: 0 });
        const answer = (await app.inject({ method: "POST", url: "/ask", payload: { question: "How do I install the VPN on macOS?" } })).json();
        expect(answer).toMatchObject({
            answer: "Install the WireGuard client from Self Service and import the profile from IT. [1]",
            citations: [{ n: 1, heading: "VPN setup › macOS", url: "https://wiki/vpn.md" }],
            grounded: true,
        });
    });

    it("searches, validates input and rejects unknown sources", async () => {
        expect((await app.inject({ url: "/search?q=leave" })).json().hits[0]).toMatchObject({ title: "Leave" });
        expect((await app.inject({ method: "POST", url: "/ask", payload: { question: "?" } })).statusCode).toBe(400);
        expect((await app.inject({ method: "POST", url: "/sources/nope/sync" })).statusCode).toBe(404);
    });

    it("answers CORS preflights from the console", async () => {
        const res = await app.inject({ method: "OPTIONS", url: "/ask", headers: { origin: "http://localhost:5173" } });
        expect(res.statusCode).toBe(204);
        expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    });
});
