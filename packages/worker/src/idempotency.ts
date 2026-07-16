import { createMiddleware } from "hono/factory";
import type { AppEnv } from "./http";
import { idempotencyId, getIdempotent, putIdempotent } from "./store/idempotency";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Idempotency-Key middleware for mutations. On the first request with a given
 * key (per token) the response is cached; retries return the cached response
 * instead of re-applying the operation. Must run after auth (needs the token).
 */
export const idempotency = createMiddleware<AppEnv>(async (c, next) => {
  const key = c.req.header("Idempotency-Key");
  if (!key || !MUTATING.has(c.req.method)) {
    await next();
    return;
  }

  const token = c.get("token");
  const id = await idempotencyId(token.id, key);

  const hit = await getIdempotent(c.env.DB, id);
  if (hit) {
    return new Response(hit.response, {
      status: hit.status,
      headers: { "Content-Type": "application/json", "Idempotent-Replay": "true" }
    });
  }

  await next();

  // Only cache deterministic outcomes (not transient 5xx).
  if (c.res.status < 500) {
    const text = await c.res.clone().text();
    c.executionCtx.waitUntil(putIdempotent(c.env.DB, id, token.id, c.res.status, text));
  }
});
