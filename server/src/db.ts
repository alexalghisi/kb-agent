import { readFile } from "node:fs/promises";
import type pg from "pg";

export async function migrate(pool: pg.Pool): Promise<void> {
    await pool.query(await readFile(new URL("./schema.sql", import.meta.url), "utf8"));
}
