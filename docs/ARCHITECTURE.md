# Architecture & Design

## Problem

AI coding agents generate and set secrets into write-only encrypted stores
(Cloudflare Worker secrets, Vercel env). The plaintext can never be read back,
so values are lost the moment they're set. Provider keys shown only once must be
rotated across many places; missing one causes outages. We need **one readable,
versioned, rotatable source of truth** usable by both humans (CLI) and agents
(MCP).

## Decisions

### Storage — Cloudflare D1 (only)

D1 (serverless SQLite) is queryable, transactional, and holds 10 GB/db — far more
than a secrets store needs. It supports the queries we care about ("list all
secrets for repo X"), versioning (append-only rows), and atomic rotation
(transactions).

**Rejected:** Cloudflare **Secrets Store** — account-level, beta, one-per-account,
and *write-only* (values can't be read back). That's the exact limitation we're
solving. KV/Durable Objects/R2 aren't needed at 1–10 user scale (R2 may host
encrypted exports later).

### Encryption — server-side envelope, AES-256-GCM

Server-side (not zero-knowledge) because a fresh agent on a brand-new machine
must decrypt with only a token, and the MCP server needs plaintext to hand to the
agent. Zero-knowledge would make "readable everywhere" impossible.

- **KEK** (key-encryption key): 256-bit, stored as a Worker secret `MASTER_KEK`
  (base64). Optionally sourced from a Secrets Store binding.
- **DEK** (data-encryption key): fresh random 256-bit key per secret *version*.
- Value is encrypted `AES-256-GCM(DEK, iv_value, plaintext, aad=secretName)`.
- DEK is wrapped `AES-256-GCM(KEK, iv_dek, dek_raw, aad="akv:dek:v1")`.
- D1 stores only: `ciphertext`, `iv_value`, `wrapped_dek`, `iv_dek` (all base64).

**Threat model.** A leak of the D1 database or its backups reveals **no
plaintext** (no KEK). This does *not* defend against a full Worker runtime
compromise (KEK is in memory during requests) — an accepted tradeoff for a small
self-hosted tool. KEK rotation re-wraps DEKs without re-encrypting values.

### Auth — opaque bearer tokens

Random 256-bit tokens (`akv_` prefix), stored as a **peppered hash**
`HMAC-SHA256(token, TOKEN_PEPPER)` in D1 (the pepper is a Worker secret, so a DB
leak yields unusable hashes). A bootstrap **admin** token; plus **project-scoped**
tokens with read-only or read-write permission and optional expiry for agents.
CLI stores its token at `~/.config/agentic-keyvault/config.json` (chmod 600).
OAuth 2.1 for remote MCP is a later enhancement.

### KEK rotation

The KEK is versioned. The active key is `MASTER_KEK` at version `KEK_VERSION`;
retired keys stay available as `MASTER_KEK_V<n>` for decryption. `POST /v1/kek/rotate`
re-wraps every DEK to the active version (values are never re-encrypted), after
which the retired key can be removed. See `SECURITY.md`.

### Request hardening

`hono/secure-headers`, a 256 KB body limit, and `zod` validation on all write
endpoints. Rate limiting is expected at the Cloudflare edge (WAF / Rate Limiting
rules).

### Recoverability & rotation

`secret_versions` is **append-only** — versions are never deleted. `set` and
`rotate` insert a new version and move the `current_version` pointer. History
(and therefore recoverability) is preserved by construction. Sync to external
platforms is **pull-based** (`akv env pull`, MCP `get_secret`); push adapters are
a later phase.

## Data model (D1)

```sql
projects        (id, name, slug UNIQUE, description, created_at)
repos           (id, project_id, origin UNIQUE, provider, owner, name, created_at)
secrets         (id, project_id, repo_id NULL, name, is_env, current_version,
                 description, created_at, updated_at)   -- UNIQUE(project_id, repo_id, name)
secret_versions (id, secret_id, version, ciphertext, iv_value, wrapped_dek,
                 iv_dek, kek_version, comment, created_by, created_at)  -- append-only
tokens          (id, name, token_hash UNIQUE, scope, project_id NULL, can_write,
                 created_at, last_used_at, expires_at, revoked)
audit_log       (id, actor_token_id, action, target_type, target_id,
                 metadata, ip, created_at)
```

`repo_id NULL` = a general (repo-less) project secret. `is_env` marks secrets that
belong in a `.env` file for the bound repo.

## REST API (Worker)

```
POST   /v1/projects                      create project
GET    /v1/projects                      list projects
GET    /v1/projects/:id                  get project (+ repos)
POST   /v1/projects/:id/repos            bind a repo origin
GET    /v1/projects/:id/repos            list repos

PUT    /v1/secrets                       upsert secret -> new version
GET    /v1/secrets?project=&repo=&env=   list secrets (metadata, no values)
GET    /v1/secrets/:id                   get current value (decrypted)
GET    /v1/secrets/:id/versions          list version history
GET    /v1/secrets/:id/versions/:n       get a specific historical value
POST   /v1/secrets/:id/rotate            set a new value as current version
DELETE /v1/secrets/:id                   soft-delete (metadata only; versions kept)

POST   /v1/tokens                        mint a token (admin only)
GET    /v1/tokens                        list tokens (admin only)
DELETE /v1/tokens/:id                    revoke a token (admin only)

GET    /v1/audit                         audit log (admin only)
POST   /v1/kek/rotate                    re-wrap all DEKs to the active KEK (admin)
GET    /v1/secrets/export?project=&repo=&env=  decrypt a whole scope in one call
POST   /v1/secrets/bulk                  atomic bulk create/version (single D1 batch)
GET    /v1/search?q=&type=               metadata search (projects/repos/secret names)
GET    /v1/auth/whoami                   report the calling token's authority
POST   /v1/auth/exchange                 mint a short-lived, least-privilege child token
POST   /v1/bootstrap                     one-time admin token creation

Mutations honour an `Idempotency-Key` header: the first response per (token, key)
is cached and replayed on retry, so a network retry never double-applies.
```

## Phased build

- **P1** Envelope crypto module + property tests. ← *start here*
- **P2** D1 schema/migrations + data-access layer.
- **P3** REST API (Hono) + bearer-token auth middleware + audit.
- **P4** CLI (`akv`): login, project, repo bind, secret set/get/ls, env pull/push, rotate, versions.
- **P5** stdio MCP server: list_projects, list_secrets, get_secret, set_secret, rotate_secret.
- **P6** (optional) push-sync adapters to external platforms.

Deploy via GitHub → Cloudflare Git integration.
