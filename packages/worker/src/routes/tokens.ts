import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../http";
import { ensureAdmin } from "../auth";
import { mintToken, listTokens, revokeToken } from "../store/tokens";
import { getProject } from "../store/projects";
import { writeAudit } from "../store/audit";
import type { TokenScope } from "../types";

export const tokens = new Hono<AppEnv>();

interface MintBody {
  name?: string;
  scope?: TokenScope;
  projectId?: string;
  canWrite?: boolean;
  expiresAt?: number;
}

tokens.post("/", async (c) => {
  ensureAdmin(c.get("token"));
  const body = await c.req.json<MintBody>().catch(() => ({}) as MintBody);
  if (!body.name?.trim()) throw new HTTPException(400, { message: "name is required" });

  const scope: TokenScope = body.scope === "project" ? "project" : "admin";
  if (scope === "project") {
    if (!body.projectId) throw new HTTPException(400, { message: "projectId required for project tokens" });
    if (!(await getProject(c.env.DB, body.projectId))) {
      throw new HTTPException(404, { message: "project not found" });
    }
  }

  const { token, row } = await mintToken(c.env.DB, {
    name: body.name.trim(),
    scope,
    projectId: scope === "project" ? body.projectId : null,
    canWrite: scope === "admin" ? true : Boolean(body.canWrite),
    expiresAt: body.expiresAt ?? null
  });
  await writeAudit(c.env.DB, {
    actorTokenId: c.get("token").id,
    action: "token.mint",
    targetType: "token",
    targetId: row.id,
    metadata: { name: row.name, scope: row.scope },
    ip: c.req.header("cf-connecting-ip") ?? null
  });
  // Plaintext token returned exactly once.
  return c.json({ token, id: row.id, name: row.name, scope: row.scope, can_write: row.can_write }, 201);
});

tokens.get("/", async (c) => {
  ensureAdmin(c.get("token"));
  return c.json({ tokens: await listTokens(c.env.DB) });
});

tokens.delete("/:id", async (c) => {
  ensureAdmin(c.get("token"));
  const id = c.req.param("id");
  await revokeToken(c.env.DB, id);
  await writeAudit(c.env.DB, {
    actorTokenId: c.get("token").id,
    action: "token.revoke",
    targetType: "token",
    targetId: id,
    ip: c.req.header("cf-connecting-ip") ?? null
  });
  return c.json({ ok: true, id });
});
