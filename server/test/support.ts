import { Redis } from "ioredis";
import pg from "pg";
import { migrate } from "../src/db.ts";

export const DATABASE_URL = process.env.KB_TEST_DATABASE_URL;
export const REDIS_URL = process.env.KB_TEST_REDIS_URL;
export const hasServices = DATABASE_URL !== undefined && REDIS_URL !== undefined;

export async function services(): Promise<{ pool: pg.Pool; redis: Redis }> {
    const pool = new pg.Pool({ connectionString: DATABASE_URL });
    await pool.query("DROP TABLE IF EXISTS chunks, documents, sources");
    await migrate(pool);
    const redis = new Redis(REDIS_URL ?? "");
    await redis.flushdb();
    return { pool, redis };
}
