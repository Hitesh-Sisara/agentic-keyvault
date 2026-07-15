/** Prefixed, URL-safe identifiers and small crypto helpers. */

function rand(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export const newProjectId = () => `proj_${rand()}`;
export const newRepoId = () => `repo_${rand()}`;
export const newSecretId = () => `sec_${rand()}`;
export const newVersionId = () => `ver_${rand()}`;
export const newTokenId = () => `tok_${rand()}`;
export const newAuditId = () => `aud_${rand()}`;

/** A slug from a display name: lowercase, alnum + hyphen, collapsed. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/** Mint an opaque bearer token: `akv_` + 32 random bytes (base64url). */
export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64url = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `akv_${b64url}`;
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** SHA-256 hex digest. */
export async function sha256Hex(input: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input)));
}

/**
 * Peppered token digest: HMAC-SHA256(pepper, token). Stored instead of the raw
 * token. Because the pepper is a Worker secret (not in D1), a database leak
 * yields hashes that cannot be recomputed or brute-forced offline.
 */
export async function hmacToken(token: string, pepper: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pepper),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token)));
}
