-- Idempotency keys: cache the response for a (token, key) mutation so retries
-- don't double-apply. Scoped by token id to prevent cross-tenant reuse.
CREATE TABLE idempotency_keys (
  id         TEXT PRIMARY KEY,  -- sha256(token_id + ':' + key)
  token_id   TEXT NOT NULL,
  status     INTEGER NOT NULL,
  response   TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_idempotency_created ON idempotency_keys(created_at);
