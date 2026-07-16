# Setup & Usage

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.1
- A Cloudflare account + [Wrangler](https://developers.cloudflare.com/workers/wrangler/) (`bunx wrangler login`)

## 1. Install

```bash
git clone https://github.com/Hitesh-Sisara/agentic-keyvault
cd agentic-keyvault
bun install
```

## 2. Create the D1 database

```bash
cd packages/worker
bunx wrangler d1 create agentic_keyvault
```

Copy the printed `database_id` into `packages/worker/wrangler.jsonc`
(replace `REPLACE_WITH_YOUR_D1_DATABASE_ID`), then apply migrations:

```bash
bunx wrangler d1 migrations apply agentic_keyvault --remote
```

## 3. Set the master key (KEK)

Generate a 32-byte key and store it as a Worker secret. **Back this up** — losing
it means losing the ability to decrypt every secret.

```bash
openssl rand -base64 32                       # copy the output
bunx wrangler secret put MASTER_KEK           # paste when prompted
```

## 4. Deploy

Deploy via your GitHub → Cloudflare Git integration, or directly:

```bash
bunx wrangler deploy
```

## 5. Bootstrap the first admin token

Temporarily allow bootstrap (set `ALLOW_BOOTSTRAP=true` in `wrangler.jsonc` `vars`,
deploy), then:

```bash
cd ../cli
bun run src/index.ts bootstrap --url https://agentic-keyvault.<you>.workers.dev
```

The admin token is printed once and saved to `~/.config/agentic-keyvault/config.json`.
Set `ALLOW_BOOTSTRAP` back to `false` and redeploy.

## CLI usage

```bash
# projects & repos
akv project create "Payments App"
akv repo bind git@github.com:acme/payments.git --project <projectId>

# secrets
akv set STRIPE_KEY sk_live_xxx --project <id> --origin git@github.com:acme/payments.git --env
akv set OPENAI_KEY sk-xxx --project <id>          # general (repo-less) secret
akv get STRIPE_KEY --project <id> --auto          # --auto uses the current git origin
akv ls --project <id>
akv rotate STRIPE_KEY sk_live_yyy --project <id> --auto
akv versions STRIPE_KEY --project <id> --auto

# .env sync
akv env pull --project <id> --auto                # writes .env from env secrets
akv env push .env --project <id> --auto

# least-privilege tokens for agents
akv token mint ci-agent --project <id> --write
```

Headless usage: set `AKV_API_URL` and `AKV_TOKEN` env vars instead of `akv login`.

### Go CLI (primary) — extra commands

```bash
akv run --auto -- node server.js        # inject env secrets into a subprocess (no shell)
akv run --auto --watch -- ./server      # restart on secret change
akv import .env --auto                  # bulk import (--on-conflict overwrite|skip|fail)
akv export --auto --format yaml         # dotenv|json|yaml (stdout or --out file, 0600)
akv search STRIPE                       # metadata search across projects/repos/secrets
akv secret diff API_KEY --auto          # diff two versions (--from N --to M)
akv token exchange --ttl 300            # short-lived least-privilege child token
akv upgrade                             # self-update from GitHub releases
akv completion zsh                      # shell completions
```

Global flags: `--json` (machine output), `--profile`, `--project`, `--repo`.
Token resolution: `AKV_TOKEN` env → token file → OS keychain.

### Rotate the master key (KEK)

```bash
openssl rand -base64 32                 # the new key
bunx wrangler secret put MASTER_KEK_V1  # save the CURRENT key as the retired one
bunx wrangler secret put MASTER_KEK     # set the new key as active
# set KEK_VERSION=2 in wrangler.jsonc vars, redeploy, then:
akv kek rotate                          # re-wraps all DEKs to v2
bunx wrangler secret delete MASTER_KEK_V1
```

### Sync to external platforms ("rotate once, sync everywhere")

Provider credentials stay in your environment — they are never stored in the vault.

```bash
akv sync targets                                            # list targets + required env
akv sync dotenv     --project <id> --auto --out .env
akv sync cloudflare --project <id> --auto --worker my-worker  # CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
akv sync github     --project <id> --auto --repo-slug acme/app  # GITHUB_TOKEN
```

## MCP server (for AI agents)

Configure your MCP client (Claude Desktop, Kiro, Claude Code, etc.):

```json
{
  "mcpServers": {
    "agentic-keyvault": {
      "command": "bun",
      "args": ["run", "/path/to/agentic-keyvault/packages/mcp/src/index.ts"],
      "env": {
        "AKV_URL": "https://agentic-keyvault.<you>.workers.dev",
        "AKV_TOKEN": "akv_your_project_scoped_token"
      }
    }
  }
}
```

Tools: `list_projects`, `get_project`, `list_secrets`, `get_secret`,
`get_secret_version`, `list_versions`, `set_secret`, `rotate_secret`.

Give agents a **project-scoped** token (read-only unless they must write).
