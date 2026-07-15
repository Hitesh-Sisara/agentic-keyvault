import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { findTokenByPlaintext, touchToken } from "./store/tokens";
import type { AppEnv } from "./http";
import type { Token } from "./types";

/** Authenticate the request via `Authorization: Bearer akv_...` and attach the token. */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new HTTPException(401, { message: "missing bearer token" });

  const token = await findTokenByPlaintext(c.env.DB, c.env.TOKEN_PEPPER, match[1]!.trim());
  if (!token || token.revoked) throw new HTTPException(401, { message: "invalid token" });
  if (token.expires_at && token.expires_at < Date.now()) {
    throw new HTTPException(401, { message: "token expired" });
  }

  c.set("token", token);
  c.executionCtx.waitUntil(touchToken(c.env.DB, token.id));
  await next();
});

export function ensureAdmin(token: Token): void {
  if (token.scope !== "admin") {
    throw new HTTPException(403, { message: "admin token required" });
  }
}

/** Admin tokens pass for any project. Project tokens must match and have write when needed. */
export function ensureProjectAccess(token: Token, projectId: string, write: boolean): void {
  if (token.scope === "admin") return;
  if (token.scope === "project" && token.project_id === projectId) {
    if (write && !token.can_write) {
      throw new HTTPException(403, { message: "read-only token" });
    }
    return;
  }
  throw new HTTPException(403, { message: "token not authorized for this project" });
}
