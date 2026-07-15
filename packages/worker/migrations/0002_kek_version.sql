-- Track which KEK version wrapped each secret version's DEK, so the master key
-- can be rotated (DEKs re-wrapped) without re-encrypting values.
ALTER TABLE secret_versions ADD COLUMN kek_version INTEGER NOT NULL DEFAULT 1;
CREATE INDEX idx_versions_kek ON secret_versions(kek_version);
