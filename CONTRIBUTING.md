# Contributing

Thanks for your interest in improving agentic-keyvault!

## Development setup

```bash
bun install
cp packages/worker/.dev.vars.example packages/worker/.dev.vars   # fill in values
```

Generate the local secrets:

```bash
openssl rand -base64 32   # MASTER_KEK
openssl rand -base64 32   # TOKEN_PEPPER
```

## Common tasks

| Task | Command |
|------|---------|
| Typecheck a package | `cd packages/<pkg> && bunx tsc --noEmit` |
| Run worker tests | `cd packages/worker && bunx vitest --run` |
| Local worker | `cd packages/worker && bunx wrangler dev` |
| Run the CLI (dev) | `cd packages/cli && bun run start -- <args>` |
| Build everything | `bun run build` |
| Regenerate binding types | `cd packages/worker && bun run types` |

## Guidelines

- **Tests first for the worker.** Crypto, storage, and API changes need coverage
  in `packages/worker/test` (property tests via `fast-check` where it fits).
- **Security-sensitive code** (crypto, auth, key management) gets extra review.
  Never log secret values; never weaken the envelope scheme without discussion.
- **Follow Cloudflare Workers best practices**: WebCrypto for randomness, no
  module-level request state, no floating promises, structured error responses.
- Keep files focused (~300 lines max) and typecheck clean before opening a PR.
- CI (typecheck + worker tests + build) must pass.

## Reporting security issues

See [SECURITY.md](SECURITY.md) — please use private disclosure, not public issues.
