import type { KeyValue } from "./collect";

/**
 * Push secrets to a Cloudflare Worker's secrets via the Cloudflare API.
 * We never store Cloudflare credentials in the vault — they come from the
 * operator's environment: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID.
 */
export async function syncCloudflare(script: string, secrets: KeyValue[]): Promise<void> {
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token) throw new Error("CLOUDFLARE_API_TOKEN is not set");
  if (!account) throw new Error("CLOUDFLARE_ACCOUNT_ID is not set");

  const base = `https://api.cloudflare.com/client/v4/accounts/${account}/workers/scripts/${script}/secrets`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };

  for (const { name, value } of secrets) {
    const res = await fetch(base, {
      method: "PUT",
      headers,
      body: JSON.stringify({ name, text: value, type: "secret_text" })
    });
    if (!res.ok) {
      throw new Error(`Cloudflare secret "${name}" failed: ${res.status} ${await res.text()}`);
    }
  }
}
