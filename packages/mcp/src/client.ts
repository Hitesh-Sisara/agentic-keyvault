import { KeyvaultClient } from "@agentic-keyvault/shared";

/**
 * Build the API client from environment. Agents configure the MCP server with:
 *   AKV_URL   — the worker base URL
 *   AKV_TOKEN — an access token (ideally a project-scoped, least-privilege token)
 */
export function buildClient(): KeyvaultClient {
  const baseUrl = process.env.AKV_URL;
  const token = process.env.AKV_TOKEN;
  if (!baseUrl) throw new Error("AKV_URL is not set");
  if (!token) throw new Error("AKV_TOKEN is not set");
  return new KeyvaultClient({ baseUrl, token });
}

export function text(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }]
  };
}
