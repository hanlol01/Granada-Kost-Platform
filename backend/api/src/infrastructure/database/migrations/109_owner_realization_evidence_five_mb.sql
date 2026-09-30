BEGIN;

-- Owner realization evidence is intentionally capped at 5 MiB per file.
ALTER TABLE files DROP CONSTRAINT IF EXISTS files_size_check;
ALTER TABLE files ADD CONSTRAINT files_size_check CHECK (
  file_size_bytes > 0 AND file_size_bytes <= 5242880
);

COMMIT;
