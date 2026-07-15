import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../http";
import { mintToken, countTokens } from "../store/tokens";
import { writeAudit } from "../store/audit";

export const bootstrap = new Hono<AppEnv>();

/**
 * One-time creation of the first admin token. Only works when
 * ALLOW_BOOTSTRAP=true AND no tokens exist yet. Unauthenticated by design
 * (there is no token to authenticate with), then should be disabled.
 */
bootstrap.post("/", async (c) => {
  if (c.env.ALLOW_BOOTSTRAP !== "true") {
    throw new HTTPException(403, { message: "bootstrap disabled (set ALLOW_BOOTSTRAP=true)" });
  }
  if ((await countTokens(c.env.DB)) > 0) {
    throw new HTTPException(403, { message: "already bootstrapped" });
  }
  const { token, row } = await mintToken(c.env.DB, c.env.TOKEN_PEPPER, {
    name: "bootstrap-admin",
    scope: "admin",
    canWrite: true
  });
  await writeAudit(c.env.DB, {
    actorTokenId: row.id,
    action: "bootstrap",
    targetType: "token",
    targetId: row.id,
    ip: c.req.header("cf-connecting-ip") ?? null
  });
  return c.json({ token, id: row.id, scope: "admin" }, 201);
});
