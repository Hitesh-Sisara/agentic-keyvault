import { KeyvaultClient } from "@agentic-keyvault/shared";
import { requireConfig, loadConfig } from "./config";

/** Client from stored/env config, requiring a token (for most commands). */
export function client(): KeyvaultClient {
  const cfg = requireConfig();
  return new KeyvaultClient({ baseUrl: cfg.baseUrl, token: cfg.token });
}

/** Client that only needs a base URL (for `bootstrap`, before a token exists). */
export function anonClient(baseUrl?: string): KeyvaultClient {
  const url = baseUrl ?? loadConfig().baseUrl;
  if (!url) throw new Error("provide --url or run `akv login --url <worker-url>` first");
  return new KeyvaultClient({ baseUrl: url });
}
