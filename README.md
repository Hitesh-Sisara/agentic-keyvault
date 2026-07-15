# agentic-keyvault

**A Cloudflare-native secrets manager with a CLI and an MCP server. Never lose an API key again.**

`agentic-keyvault` is a small, self-hostable secrets store that runs entirely on
Cloudflare Workers + D1. It gives you **one source of truth** for your API keys,
tokens, and environment variables — one that you (and your AI coding agents) can
**read back**, version, and rotate in a single place.

## Why

AI coding agents increasingly generate and set secrets for you — random API
keys, internal tokens, signing secrets — and push them straight into write-only
encrypted stores (Cloudflare Worker secrets, Vercel env, etc.). Those stores
never let you read the value back, so:

- The value is **lost the moment it's set** — you never saw it, you can't reuse it.
- Rotating a provider key (shown only once) means updating it in *many* places.
  Miss one and production breaks.

`agentic-keyvault` fixes this by being a store you **own** and can **read from**,
designed for both humans (CLI) and agents (MCP):

- **Projects** group your secrets. A project can optionally bind to a **GitHub
  repo origin**, so `akv env pull` inside a repo just works.
- **General (repo-less) secrets** live under a project too.
- **Every write is versioned and never deleted** — nothing is ever lost.
- **Rotate once**, read everywhere.

## Architecture

```
          ┌──────────────┐        ┌──────────────┐
  human → │   CLI (akv)  │        │  MCP server  │ ← AI agent
          └──────┬───────┘        └──────┬───────┘
                 │  bearer token (HTTPS)  │
                 └───────────┬────────────┘
                             ▼
                 ┌───────────────────────┐
                 │  Cloudflare Worker     │  REST API + envelope crypto
                 │  (Hono)                │
                 └───────────┬───────────┘
                             ▼
                 ┌───────────────────────┐
                 │  Cloudflare D1 (SQLite)│  encrypted secret versions + metadata
                 └───────────────────────┘
```

- **Storage:** Cloudflare **D1**. Queryable, transactional, versioned. Secret
  *values* are stored only as ciphertext.
- **Encryption:** **envelope encryption** with `AES-256-GCM`. A master key (KEK)
  lives as a Worker secret; each secret version has its own random data key (DEK)
  that is wrapped by the KEK. A D1/backup leak alone reveals nothing.
- **Auth:** opaque **bearer tokens**, stored SHA-256 hashed. Admin token plus
  project-scoped read-only / read-write tokens for agents.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the full design and threat model.

## Packages

| Package | Description |
|---|---|
| [`packages/worker`](packages/worker) | Cloudflare Worker — REST API, envelope crypto, D1 access |
| [`packages/cli`](packages/cli) | `akv` command-line client |
| [`packages/mcp`](packages/mcp) | stdio MCP server for AI agents |
| [`packages/shared`](packages/shared) | shared API client + types |

## Status

Early development. Built in phases — see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## License

MIT © Hitesh Sisara
