-- agentic-keyvault initial schema
-- See docs/ARCHITECTURE.md for the data model rationale.

PRAGMA foreign_keys = ON;

CREATE TABLE projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at  INTEGER NOT NULL
);

CREATE TABLE repos (
  id         TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  origin     TEXT NOT NULL UNIQUE,   -- normalized, e.g. github.com/owner/repo
  provider   TEXT,                   -- github | gitlab | bitbucket | other
  owner      TEXT,
  name       TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_repos_project ON repos(project_id);

CREATE TABLE secrets (
  id              TEXT PRIMARY KEY,
  project_id      TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  repo_id         TEXT REFERENCES repos(id) ON DELETE CASCADE,  -- NULL = general project secret
  name            TEXT NOT NULL,
  is_env          INTEGER NOT NULL DEFAULT 0,  -- 1 = belongs in a .env for the bound repo
  current_version INTEGER NOT NULL DEFAULT 0,
  description     TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  deleted_at      INTEGER
);
-- Uniqueness within (project, repo-or-general, name). COALESCE handles NULL repo_id,
-- since SQLite treats NULLs as distinct in a plain UNIQUE constraint.
CREATE UNIQUE INDEX idx_secrets_scope_name
  ON secrets(project_id, COALESCE(repo_id, ''), name);
CREATE INDEX idx_secrets_project ON secrets(project_id);
CREATE INDEX idx_secrets_repo ON secrets(repo_id);

CREATE TABLE secret_versions (
  id          TEXT PRIMARY KEY,
  secret_id   TEXT NOT NULL REFERENCES secrets(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  ciphertext  TEXT NOT NULL,
  iv_value    TEXT NOT NULL,
  wrapped_dek TEXT NOT NULL,
  iv_dek      TEXT NOT NULL,
  comment     TEXT,
  created_by  TEXT,        -- token id that created this version
  created_at  INTEGER NOT NULL,
  UNIQUE(secret_id, version)
);
CREATE INDEX idx_versions_secret ON secret_versions(secret_id);

CREATE TABLE tokens (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  token_hash   TEXT NOT NULL UNIQUE,   -- SHA-256 hex of the opaque token
  scope        TEXT NOT NULL,          -- 'admin' | 'project'
  project_id   TEXT REFERENCES projects(id) ON DELETE CASCADE,  -- NULL for admin
  can_write    INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  last_used_at INTEGER,
  expires_at   INTEGER,
  revoked      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_tokens_project ON tokens(project_id);

CREATE TABLE audit_log (
  id             TEXT PRIMARY KEY,
  actor_token_id TEXT,
  action         TEXT NOT NULL,
  target_type    TEXT,
  target_id      TEXT,
  metadata       TEXT,   -- JSON
  ip             TEXT,
  created_at     INTEGER NOT NULL
);
CREATE INDEX idx_audit_created ON audit_log(created_at);
