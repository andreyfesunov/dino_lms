CREATE TABLE IF NOT EXISTS _schema_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);

INSERT INTO _schema_meta (key, value)
VALUES ('bootstrap', '1')
ON CONFLICT(key) DO NOTHING;
