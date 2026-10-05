CREATE TABLE IF NOT EXISTS sources (
    id          text PRIMARY KEY,
    kind        text NOT NULL,
    cursor      text,
    synced_at   timestamptz
);

CREATE TABLE IF NOT EXISTS documents (
    source_id    text NOT NULL REFERENCES sources (id) ON DELETE CASCADE,
    external_id  text NOT NULL,
    title        text NOT NULL,
    url          text NOT NULL,
    content_hash text NOT NULL,
    updated_at   timestamptz NOT NULL,
    PRIMARY KEY (source_id, external_id)
);

CREATE TABLE IF NOT EXISTS chunks (
    id           bigserial PRIMARY KEY,
    source_id    text NOT NULL,
    external_id  text NOT NULL,
    position     integer NOT NULL,
    heading      text NOT NULL,
    body         text NOT NULL,
    search       tsvector GENERATED ALWAYS AS (
                     setweight(to_tsvector('english', heading), 'A') || setweight(to_tsvector('english', body), 'B')
                 ) STORED,
    FOREIGN KEY (source_id, external_id) REFERENCES documents (source_id, external_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS chunks_search ON chunks USING gin (search);
CREATE INDEX IF NOT EXISTS chunks_document ON chunks (source_id, external_id);
