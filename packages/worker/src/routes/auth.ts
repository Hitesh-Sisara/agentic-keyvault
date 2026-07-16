import { Hono } from "hono";
import type { AppEnv } from "../http";

export const authRoutes = new Hono<AppEnv>();

// GET /v1/auth/whoami — report the calling token's authority (no secret access).
authRoutes.get("/whoami", (c) => {
  const t = c.get("token");
  return c.json({
    token_type: t.scope,
    project: t.project_id ?? "",
    can_write: t.can_write === 1,
    expires_at: t.expires_at ?? 0
  });
});
