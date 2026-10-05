import type pg from "pg";

export interface Hit {
    readonly chunkId: number;
    readonly sourceId: string;
    readonly title: string;
    readonly url: string;
    readonly heading: string;
    readonly body: string;
    readonly rank: number;
}

/**
 * Turns what people type into a forgiving tsquery: any term may match (ranking rewards matching more of them),
 * and every term is a prefix, so "mac" finds "macOS". Anything but letters and digits is dropped.
 */
export function toTsQuery(query: string): string {
    const terms = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    return [...new Set(terms)].slice(0, 12).map((t) => `${t}:*`).join(" | ");
}

/** Full-text search over chunks: headings weigh more than bodies, and every hit links back to its document. */
export async function search(pool: pg.Pool, query: string, limit = 8): Promise<Hit[]> {
    const tsquery = toTsQuery(query);
    if (tsquery === "") return [];
    const { rows } = await pool.query<{ id: string; source_id: string; title: string; url: string; heading: string; body: string; rank: number }>(
        `SELECT c.id, c.source_id, d.title, d.url, c.heading, c.body, ts_rank_cd(c.search, q) AS rank
         FROM chunks c
         JOIN documents d USING (source_id, external_id),
              to_tsquery('english', $1) q
         WHERE c.search @@ q
         ORDER BY rank DESC, c.id
         LIMIT $2`,
        [tsquery, limit],
    );
    return rows.map((r) => ({ chunkId: Number(r.id), sourceId: r.source_id, title: r.title, url: r.url, heading: r.heading, body: r.body, rank: r.rank }));
}
