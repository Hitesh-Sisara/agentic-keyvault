import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../http";
import { mintToken } from "../store/tokens";
import { getProject } from "../store/projects";
import { writeAudit } from "../store/audit";
import { parseBody, exchangeSchema } from "../validation";

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

// POST /v1/auth/exchange — mint a short-lived, least-privilege child token.
// The child is always project-scoped; its project and write permission must be
// a subset of the caller's. Max TTL 15 minutes.
authRoutes.post("/exchange", async (c) => {
  const parent = c.get("token");
  const body = await parseBody(c, exchangeSchema);

  let projectId: string;
  if (parent.scope === "admin") {
    if (!body.project) throw new HTTPException(400, { message: "project is required for admin exchange" });
    projectId = body.project;
  } else {
    projectId = parent.project_id ?? "";
    if (body.project && body.project !== projectId) {
      throw new HTTPException(403, { message: "cannot exchange for a different project" });
    }
  }
  if (!(await getProject(c.env.DB, projectId))) {
    throw new HTTPException(404, { message: "project not found" });
  }

  // Write permission cannot exceed the parent's.
  const parentCanWrite = parent.scope === "admin" || parent.can_write === 1;
  const canWrite = Boolean(body.canWrite) && parentCanWrite;

  const ttl = body.ttlSeconds ?? 900;
  const expiresAt = Date.now() + ttl * 1000;

  const { token, row } = await mintToken(c.env.DB, c.env.TOKEN_PEPPER, {
    name: `exchanged from ${parent.id}`,
    scope: "project",
    projectId,
    canWrite,
    expiresAt
  });
  await writeAudit(c.env.DB, {
    actorTokenId: parent.id,
    action: "token.exchange",
    targetType: "token",
    targetId: row.id,
    metadata: { project: projectId, canWrite, ttl },
    ip: c.req.header("cf-connecting-ip") ?? null
  });
  return c.json({ token, token_type: "project", project: projectId, can_write: canWrite, expires_at: expiresAt }, 201);
});
