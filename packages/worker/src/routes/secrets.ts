import { Hono, type Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../http";
import { ensureProjectAccess } from "../auth";
import { loadKeyring } from "../crypto";
import { getProject } from "../store/projects";
import { getRepoByOrigin } from "../store/repos";
import {
  getSecret,
  listSecrets,
  listVersions,
  softDeleteSecret
} from "../store/secrets";
import { setSecret, setSecretsBulk, getSecretValue, getVersionValue, exportSecrets } from "../secret-service";
import { writeAudit } from "../store/audit";
import { parseBody, upsertSecretSchema, rotateSchema, bulkSecretsSchema } from "../validation";

export const secrets = new Hono<AppEnv>();

async function resolveRepoId(
  db: D1Database,
  body: { repoId?: string | null; origin?: string }
): Promise<string | null> {
  if (body.repoId) return body.repoId;
  if (body.origin) {
    const repo = await getRepoByOrigin(db, body.origin);
    if (!repo) throw new HTTPException(400, { message: "repo origin not bound to any project" });
    return repo.id;
  }
  return null;
}

// PUT /v1/secrets — create or add a new version.
secrets.put("/", async (c) => {
  const body = await parseBody(c, upsertSecretSchema);
  ensureProjectAccess(c.get("token"), body.projectId, true);
  if (!(await getProject(c.env.DB, body.projectId))) {
    throw new HTTPException(404, { message: "project not found" });
  }
  const repoId = await resolveRepoId(c.env.DB, body);
  const keyring = await loadKeyring(c.env);

  const result = await setSecret(c.env.DB, keyring, {
    projectId: body.projectId,
    repoId,
    name: body.name.trim(),
    value: body.value,
    isEnv: body.isEnv,
    description: body.description ?? null,
    comment: body.comment ?? null,
    createdBy: c.get("token").id
  });
  await writeAudit(c.env.DB, {
    actorTokenId: c.get("token").id,
    action: result.created ? "secret.create" : "secret.version",
    targetType: "secret",
    targetId: result.secret.id,
    metadata: { name: result.secret.name, version: result.version },
    ip: c.req.header("cf-connecting-ip") ?? null
  });
  return c.json({ ...result.secret, version: result.version }, result.created ? 201 : 200);
});

// POST /v1/secrets/bulk — atomically create/version many secrets in one scope.
secrets.post("/bulk", async (c) => {
  const body = await parseBody(c, bulkSecretsSchema);
  ensureProjectAccess(c.get("token"), body.projectId, true);
  if (!(await getProject(c.env.DB, body.projectId))) {
    throw new HTTPException(404, { message: "project not found" });
  }
  const repoId = await resolveRepoId(c.env.DB, body);
  const keyring = await loadKeyring(c.env);
  const results = await setSecretsBulk(c.env.DB, keyring, {
    projectId: body.projectId,
    repoId,
    items: body.items,
    createdBy: c.get("token").id
  });
  await writeAudit(c.env.DB, {
    actorTokenId: c.get("token").id,
    action: "secret.bulk",
    targetType: "project",
    targetId: body.projectId,
    metadata: { count: results.length },
    ip: c.req.header("cf-connecting-ip") ?? null
  });
  return c.json({ results }, 201);
});

// GET /v1/secrets?project=&repo=&env=1 — metadata only, no values.
secrets.get("/", async (c) => {
  const projectId = c.req.query("project");
  if (!projectId) throw new HTTPException(400, { message: "project query param is required" });
  ensureProjectAccess(c.get("token"), projectId, false);

  const repo = c.req.query("repo");
  const list = await listSecrets(c.env.DB, {
    projectId,
    repoId: repo === undefined ? undefined : repo === "" || repo === "none" ? null : repo,
    envOnly: c.req.query("env") === "1"
  });
  return c.json({ secrets: list });
});

// GET /v1/secrets/export?project=&repo=&env=1 — decrypted values for a whole
// scope in ONE call (avoids N+1). Registered before /:id so it isn't shadowed.
secrets.get("/export", async (c) => {
  const projectId = c.req.query("project");
  if (!projectId) throw new HTTPException(400, { message: "project query param is required" });
  ensureProjectAccess(c.get("token"), projectId, false);

  const repo = c.req.query("repo");
  const keyring = await loadKeyring(c.env);
  const items = await exportSecrets(c.env.DB, keyring, {
    projectId,
    repoId: repo === undefined ? undefined : repo === "" || repo === "none" ? null : repo,
    envOnly: c.req.query("env") === "1"
  });
  await writeAudit(c.env.DB, {
    actorTokenId: c.get("token").id,
    action: "secret.export",
    targetType: "project",
    targetId: projectId,
    metadata: { count: items.length },
    ip: c.req.header("cf-connecting-ip") ?? null
  });
  return c.json({ secrets: items });
});

async function loadOwnedSecret(c: Context<AppEnv>, write: boolean) {
  const id = c.req.param("id")!;
  const secret = await getSecret(c.env.DB, id);
  if (!secret) throw new HTTPException(404, { message: "secret not found" });
  ensureProjectAccess(c.get("token"), secret.project_id, write);
  return secret;
}

// GET /v1/secrets/:id — current decrypted value.
secrets.get("/:id", async (c) => {
  const secret = await loadOwnedSecret(c, false);
  const keyring = await loadKeyring(c.env);
  const result = await getSecretValue(c.env.DB, keyring, secret.id);
  if (!result) throw new HTTPException(404, { message: "secret has no value" });
  await writeAudit(c.env.DB, {
    actorTokenId: c.get("token").id,
    action: "secret.read",
    targetType: "secret",
    targetId: secret.id,
    metadata: { version: result.version },
    ip: c.req.header("cf-connecting-ip") ?? null
  });
  return c.json({ ...result.secret, value: result.value, version: result.version });
});

// GET /v1/secrets/:id/versions — history (metadata only).
secrets.get("/:id/versions", async (c) => {
  const secret = await loadOwnedSecret(c, false);
  return c.json({ versions: await listVersions(c.env.DB, secret.id) });
});

// GET /v1/secrets/:id/versions/:n — a specific historical value.
secrets.get("/:id/versions/:n", async (c) => {
  const secret = await loadOwnedSecret(c, false);
  const n = Number(c.req.param("n"));
  if (!Number.isInteger(n) || n < 1) throw new HTTPException(400, { message: "invalid version" });
  const keyring = await loadKeyring(c.env);
  const result = await getVersionValue(c.env.DB, keyring, secret.id, n);
  if (!result) throw new HTTPException(404, { message: "version not found" });
  return c.json({ value: result.value, version: result.version });
});

// POST /v1/secrets/:id/rotate — set a new value as the current version.
secrets.post("/:id/rotate", async (c) => {
  const secret = await loadOwnedSecret(c, true);
  const body = await parseBody(c, rotateSchema);

  const keyring = await loadKeyring(c.env);
  const result = await setSecret(c.env.DB, keyring, {
    projectId: secret.project_id,
    repoId: secret.repo_id,
    name: secret.name,
    value: body.value,
    comment: body.comment ?? "rotate",
    createdBy: c.get("token").id
  });
  await writeAudit(c.env.DB, {
    actorTokenId: c.get("token").id,
    action: "secret.rotate",
    targetType: "secret",
    targetId: secret.id,
    metadata: { version: result.version },
    ip: c.req.header("cf-connecting-ip") ?? null
  });
  return c.json({ ...result.secret, version: result.version });
});

// DELETE /v1/secrets/:id — soft delete (versions retained).
secrets.delete("/:id", async (c) => {
  const secret = await loadOwnedSecret(c, true);
  await softDeleteSecret(c.env.DB, secret.id);
  await writeAudit(c.env.DB, {
    actorTokenId: c.get("token").id,
    action: "secret.delete",
    targetType: "secret",
    targetId: secret.id,
    ip: c.req.header("cf-connecting-ip") ?? null
  });
  return c.json({ ok: true, id: secret.id });
});
