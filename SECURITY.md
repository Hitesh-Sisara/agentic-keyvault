# Security

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Email the maintainer
or use GitHub's private vulnerability reporting
(**Security → Report a vulnerability**) on this repository. We aim to acknowledge
within 72 hours.

## Cryptography

- **Envelope encryption**, `AES-256-GCM` throughout, via the Workers WebCrypto
  (`SubtleCrypto`) runtime — no third-party crypto libraries.
- Each secret **version** gets a fresh 256-bit **data key (DEK)**; the value is
  `AES-256-GCM(DEK, iv, plaintext, aad = secretName)`. Binding the secret name as
  AAD prevents a swapped/relocated ciphertext from decrypting.
- The DEK is wrapped with a 256-bit **key-encryption key (KEK)**:
  `AES-256-GCM(KEK, iv, DEK, aad = "akv:dek:v1")`. D1 stores only ciphertext, IVs,
  the wrapped DEK, and the KEK version — never plaintext, never the raw DEK.
- All randomness uses `crypto.getRandomValues` / `crypto.randomUUID` (never
  `Math.random`). GCM nonces are 96-bit and freshly random per encryption.

## Key management

- The **KEK** is a Worker secret (`MASTER_KEK`), set with `wrangler secret put`.
  It is never stored in D1 or source.
- **KEK rotation** is supported without re-encrypting values: set a new
  `MASTER_KEK`, bump `KEK_VERSION`, keep the old key as `MASTER_KEK_V<old>`, then
  `POST /v1/kek/rotate` (or `akv kek rotate`) to re-wrap every DEK. Remove the old
  key afterwards.
- **Back up the KEK.** Losing it makes every stored secret unrecoverable — by design.

## Tokens

- Access tokens are opaque, 256-bit, cryptographically random (`akv_` prefix).
- Only a **peppered hash** is stored: `HMAC-SHA256(token, TOKEN_PEPPER)`. The
  pepper is a Worker secret, so a D1 leak yields hashes that cannot be recomputed
  or brute-forced offline.
- Tokens are **scoped** (admin vs per-project) with explicit read/write
  permission and optional expiry, and can be revoked.

## Threat model

**Protected against**
- **D1 / backup compromise:** ciphertext + peppered token hashes only. Without the
  Worker's `MASTER_KEK` and `TOKEN_PEPPER`, neither secrets nor tokens are usable.
- **Ciphertext tampering / relocation:** GCM auth tags + secret-name AAD.
- **Oversized/malformed input:** 256 KB body limit and `zod` validation on writes.

**Not protected against (accepted for a small self-hosted tool)**
- **Full Worker runtime compromise:** the KEK and pepper are in memory during
  request handling. This is not zero-knowledge — the server can decrypt, because
  the CLI/MCP must be able to read values back on any machine with just a token.
- A holder of a valid, unexpired token has the access that token grants.

## Operational recommendations

- Keep `ALLOW_BOOTSTRAP=false` except during first-time setup.
- Give AI agents a **project-scoped, least-privilege** token (read-only unless
  writes are required).
- Put a **Cloudflare WAF / Rate Limiting rule** in front of the Worker — edge rate
  limiting is preferred over in-Worker limiting.
- Rotate the KEK and provider keys periodically; audit with `akv audit`.
