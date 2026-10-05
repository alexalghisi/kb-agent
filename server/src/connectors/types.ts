/** A document as a source system describes it. Bodies are Markdown or plain text. */
export interface SourceDocument {
    readonly externalId: string;
    readonly title: string;
    readonly url: string;
    readonly body: string;
    readonly updatedAt: string;
}

/**
 * One page of changes since `cursor`. The indexer stores `nextCursor` only after the page is
 * committed, so a crash re-reads a page rather than skipping one.
 */
export interface SyncPage {
    readonly upserts: readonly SourceDocument[];
    readonly deletes: readonly string[];
    readonly nextCursor: string;
    readonly hasMore: boolean;
}

export interface Connector {
    readonly kind: string;
    sync(cursor: string | null, signal?: AbortSignal): Promise<SyncPage>;
}
