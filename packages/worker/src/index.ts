/**
 * agentic-keyvault Worker entrypoint.
 *
 * Phase 1 placeholder — the REST API (Hono app, D1 access, auth) lands in
 * Phase 3. For now this exposes a health check so the module loads cleanly.
 */

export interface Env {
  DB: D1Database;
  MASTER_KEK: string;
  ALLOW_BOOTSTRAP: string;
}

export default {
  async fetch(request: Request, _env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "agentic-keyvault" });
    }
    return new Response("Not found", { status: 404 });
  }
} satisfies ExportedHandler<Env>;
