import Fastify, { type FastifyInstance } from "fastify";
import type { Redis } from "ioredis";
import type pg from "pg";
import { z } from "zod";
import { createAgent } from "./agent.ts";
import type { Connector } from "./connectors/types.ts";
import { Indexer, SyncInProgress } from "./indexer.ts";
import type { ChatModel } from "./model.ts";
import { search } from "./search.ts";

export interface ServerDeps {
    readonly pool: pg.Pool;
    readonly redis: Redis;
    readonly sources: Readonly<Record<string, Connector>>;
    readonly model: ChatModel;
    readonly corsOrigin?: string;
}

const Ask = z.object({ question: z.string().trim().min(3).max(500) });

export function createServer({ pool, redis, sources, model, corsOrigin }: ServerDeps): FastifyInstance {
    const app = Fastify({ logger: false });
    const indexer = new Indexer(pool, redis);
    const ask = createAgent(model, (q) => search(pool, q));

    if (corsOrigin) {
        app.addHook("onRequest", async (req, reply) => {
            if (req.headers.origin === corsOrigin) {
                reply.header("access-control-allow-origin", corsOrigin).header("access-control-allow-headers", "content-type");
            }
            if (req.method === "OPTIONS") return reply.code(204).send();
        });
    }

    app.get("/healthz", async () => ({ status: "ok" }));

    app.post<{ Params: { id: string } }>("/sources/:id/sync", async (req, reply) => {
        const connector = sources[req.params.id];
        if (!connector) return reply.code(404).send({ error: `unknown source ${req.params.id}` });
        try {
            return await indexer.sync(req.params.id, connector);
        } catch (error) {
            if (error instanceof SyncInProgress) return reply.code(409).send({ error: error.message });
            throw error;
        }
    });

    app.get<{ Querystring: { q?: string } }>("/search", async (req) => ({ hits: await search(pool, req.query.q ?? "") }));

    app.post("/ask", async (req, reply) => {
        const parsed = Ask.safeParse(req.body);
        if (!parsed.success) return reply.code(400).send({ error: "question must be 3-500 characters" });
        return ask(parsed.data.question);
    });

    return app;
}
