import type { Connector, SourceDocument, SyncPage } from "./types.ts";

interface Ticket {
    id: string;
    title: string;
    description: string;
    status: string;
    url: string;
    updated_at: string;
    archived: boolean;
}

interface TicketPage {
    tickets: Ticket[];
    next_page: string | null;
}

interface TicketCursor {
    readonly updatedSince: string | null;
    readonly page: string | null;
    readonly newest: string | null;
}

export interface TicketsOptions {
    readonly baseUrl: string;
    readonly token: string;
    readonly pageSize?: number;
    readonly maxRetries?: number;
    readonly sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * An issue tracker's REST API: incremental by `updated_since`, paginated by an opaque token.
 * Archived tickets are reported as deletions. 429s are retried after Retry-After.
 */
export class TicketsConnector implements Connector {
    readonly kind = "tickets";
    readonly #o: Required<TicketsOptions>;

    constructor(options: TicketsOptions) {
        this.#o = { pageSize: 50, maxRetries: 5, sleep: wait, ...options };
    }

    async sync(cursor: string | null, signal?: AbortSignal): Promise<SyncPage> {
        const state: TicketCursor = cursor ? (JSON.parse(cursor) as TicketCursor) : { updatedSince: null, page: null, newest: null };
        const params = new URLSearchParams({ limit: String(this.#o.pageSize) });
        if (state.updatedSince) params.set("updated_since", state.updatedSince);
        if (state.page) params.set("page", state.page);
        const page = await this.#get(`/tickets?${params}`, signal);

        let newest = state.newest;
        const upserts: SourceDocument[] = [];
        const deletes: string[] = [];
        for (const t of page.tickets) {
            if (newest === null || t.updated_at > newest) newest = t.updated_at;
            if (t.archived) deletes.push(t.id);
            else upserts.push({ externalId: t.id, title: t.title, url: t.url, body: `Status: ${t.status}\n\n${t.description}`, updatedAt: t.updated_at });
        }
        // While paging, keep the window fixed; once done, the next sync starts from the newest change seen.
        const next: TicketCursor = page.next_page
            ? { updatedSince: state.updatedSince, page: page.next_page, newest }
            : { updatedSince: newest ?? state.updatedSince, page: null, newest: null };
        return { upserts, deletes, nextCursor: JSON.stringify(next), hasMore: page.next_page !== null };
    }

    async #get(path: string, signal?: AbortSignal): Promise<TicketPage> {
        for (let attempt = 0; ; attempt++) {
            const response = await fetch(`${this.#o.baseUrl}${path}`, {
                headers: { authorization: `Bearer ${this.#o.token}` },
                ...(signal ? { signal } : {}),
            });
            if (response.ok) return (await response.json()) as TicketPage;
            const retryable = response.status === 429 || response.status >= 500;
            if (!retryable || attempt >= this.#o.maxRetries) {
                throw new Error(`tickets API ${response.status} on ${path}: ${(await response.text()).slice(0, 200)}`);
            }
            const retryAfter = Number(response.headers.get("retry-after"));
            await this.#o.sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 200 * 2 ** attempt);
        }
    }
}
