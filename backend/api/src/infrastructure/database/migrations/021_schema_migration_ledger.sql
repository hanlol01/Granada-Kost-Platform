CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  checksum_sha256 CHAR(64) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  execution_ms INTEGER NOT NULL CHECK (execution_ms >= 0),
  applied_by TEXT NOT NULL CHECK (char_length(applied_by) BETWEEN 1 AND 80),
  CONSTRAINT schema_migrations_checksum_format_check
    CHECK (checksum_sha256 ~ '^[0-9a-f]{64}$')
);
