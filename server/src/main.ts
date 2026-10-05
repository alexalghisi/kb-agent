import { Redis } from "ioredis";
import pg from "pg";
import type { Connector } from "./connectors/types.ts";
import { MarkdownFolderConnector } from "./connectors/markdownFolder.ts";
import { TicketsConnector } from "./connectors/tickets.ts";
import { migrate } from "./db.ts";
import { OpenAIChatModel } from "./model.ts";
import { OfflineModel } from "./offlineModel.ts";
import { createServer } from "./server.ts";

const env = process.env;
const pool = new pg.Pool({ connectionString: env.DATABASE_URL ?? "postgres://localhost/kb_agent" });
const redis = new Redis(env.REDIS_URL ?? "redis://localhost:6379");
await migrate(pool);

const sources: Record<string, Connector> = {
    handbook: new MarkdownFolderConnector(env.KB_FOLDER ?? new URL("../../examples/handbook", import.meta.url).pathname, "https://handbook.example/"),
};
if (env.TICKETS_URL && env.TICKETS_TOKEN) sources.tickets = new TicketsConnector({ baseUrl: env.TICKETS_URL, token: env.TICKETS_TOKEN });

const model = env.OPENAI_API_KEY ? new OpenAIChatModel(env.OPENAI_API_KEY, env.KB_MODEL ?? "gpt-4o-mini") : new OfflineModel();
const app = createServer({ pool, redis, sources, model, corsOrigin: env.CORS_ORIGIN ?? "http://localhost:5173" });
await app.listen({ port: Number(env.PORT ?? 3000), host: "0.0.0.0" });
console.log(`kb-agent API on :${env.PORT ?? 3000} (${env.OPENAI_API_KEY ? "OpenAI model" : "offline model"}; sources: ${Object.keys(sources).join(", ")})`);
