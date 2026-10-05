import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MarkdownFolderConnector } from "../src/connectors/markdownFolder.ts";
import { TicketsConnector } from "../src/connectors/tickets.ts";

describe("MarkdownFolderConnector", () => {
    it("returns changed files and detects deletions between syncs", async () => {
        const dir = await mkdtemp(join(tmpdir(), "kb-"));
        await writeFile(join(dir, "onboarding.md"), "# Onboarding\n\nWelcome!");
        await writeFile(join(dir, "oncall.md"), "# On-call\n\nPage the SRE.");
        const connector = new MarkdownFolderConnector(dir, "https://wiki.example/");

        const first = await connector.sync(null);
        expect(first.upserts.map((d) => [d.externalId, d.title])).toEqual([
            ["onboarding.md", "Onboarding"],
            ["oncall.md", "On-call"],
        ]);

        const later = new Date(Date.now() + 5_000);
        await writeFile(join(dir, "oncall.md"), "# On-call\n\nPage the platform team.");
        await utimes(join(dir, "oncall.md"), later, later);
        await rm(join(dir, "onboarding.md"));
        const second = await connector.sync(first.nextCursor);
        expect(second.upserts.map((d) => d.externalId)).toEqual(["oncall.md"]);
        expect(second.deletes).toEqual(["onboarding.md"]);
        await rm(dir, { recursive: true });
    });
});

describe("TicketsConnector", () => {
    const app = Fastify();
    let baseUrl = "";
    let calls: string[] = [];
    let throttled = true;
    const tickets = [
        { id: "T-1", title: "SSO login loops", description: "Users bounce back to the login page", status: "open", url: "https://t/T-1", updated_at: "2026-10-01T10:00:00Z", archived: false },
        { id: "T-2", title: "Export to PDF", description: "Feature request", status: "done", url: "https://t/T-2", updated_at: "2026-10-02T10:00:00Z", archived: false },
        { id: "T-3", title: "Old spam", description: "", status: "closed", url: "https://t/T-3", updated_at: "2026-10-03T10:00:00Z", archived: true },
    ];

    beforeAll(async () => {
        app.get<{ Querystring: { updated_since?: string; page?: string; limit: string } }>("/tickets", async (req, reply) => {
            calls.push(req.url);
            if (req.headers.authorization !== "Bearer secret") return reply.code(401).send({ error: "unauthorized" });
            if (throttled) {
                throttled = false;
                return reply.code(429).header("retry-after", "1").send({ error: "slow down" });
            }
            const since = req.query.updated_since ?? "";
            const matching = tickets.filter((t) => t.updated_at > since);
            const start = Number(req.query.page ?? 0);
            const limit = Number(req.query.limit);
            const slice = matching.slice(start, start + limit);
            return { tickets: slice, next_page: start + limit < matching.length ? String(start + limit) : null };
        });
        await app.listen({ port: 0 });
        baseUrl = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    });

    afterAll(() => app.close());

    it("pages through changes, retries 429s, turns archived tickets into deletions and resumes incrementally", async () => {
        const slept: number[] = [];
        const connector = new TicketsConnector({ baseUrl, token: "secret", pageSize: 2, sleep: async (ms) => void slept.push(ms) });
        const first = await connector.sync(null);
        expect(slept).toEqual([1_000]);
        expect(first.upserts.map((d) => d.externalId)).toEqual(["T-1", "T-2"]);
        expect(first.hasMore).toBe(true);
        const second = await connector.sync(first.nextCursor);
        expect(second.deletes).toEqual(["T-3"]);
        expect(second.hasMore).toBe(false);

        calls = [];
        tickets.push({ id: "T-4", title: "Dark mode", description: "", status: "open", url: "https://t/T-4", updated_at: "2026-10-04T09:00:00Z", archived: false });
        const third = await connector.sync(second.nextCursor);
        expect(third.upserts.map((d) => d.externalId)).toEqual(["T-4"]);
        expect(calls[0]).toContain("updated_since=2026-10-03T10%3A00%3A00Z");
    });

    it("fails clearly on errors that retrying won't fix", async () => {
        const connector = new TicketsConnector({ baseUrl, token: "wrong" });
        await expect(connector.sync(null)).rejects.toThrow(/tickets API 401/);
    });
});
