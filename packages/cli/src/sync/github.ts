import sealedbox from "tweetnacl-sealedbox-js";
import type { KeyValue } from "./collect";

interface PublicKey {
  key_id: string;
  key: string; // base64
}

function b64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/**
 * Push secrets to a GitHub repository's Actions secrets. Values are encrypted
 * client-side with the repo's public key (X25519 sealed box), matching GitHub's
 * libsodium scheme. We never store the GITHUB_TOKEN.
 *
 * Requires env GITHUB_TOKEN with Actions secrets write scope.
 */
export async function syncGithub(repo: string, secrets: KeyValue[]): Promise<void> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN is not set");
  const [owner, name] = repo.split("/");
  if (!owner || !name) throw new Error(`invalid --repo-slug "${repo}" (expected owner/name)`);

  const api = `https://api.github.com/repos/${owner}/${name}/actions/secrets`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };

  const keyRes = await fetch(`${api}/public-key`, { headers });
  if (!keyRes.ok) throw new Error(`GitHub public-key fetch failed: ${keyRes.status}`);
  const pk = (await keyRes.json()) as PublicKey;
  const publicKey = b64ToBytes(pk.key);

  for (const { name: secretName, value } of secrets) {
    const sealed = sealedbox.seal(new TextEncoder().encode(value), publicKey);
    const res = await fetch(`${api}/${encodeURIComponent(secretName)}`, {
      method: "PUT",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ encrypted_value: bytesToB64(sealed), key_id: pk.key_id })
    });
    if (!res.ok) {
      throw new Error(`GitHub secret "${secretName}" failed: ${res.status} ${await res.text()}`);
    }
  }
}
