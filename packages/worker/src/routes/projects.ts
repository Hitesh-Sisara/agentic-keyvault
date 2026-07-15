import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../http";
import { ensureAdmin, ensureProjectAccess } from "../auth";
import { createProject, listProjects, getProject } from "../store/projects";
import { createRepo, listReposByProject } from "../store/repos";
import { writeAudit } from "../store/audit";

export const projects = new Hono<AppEnv>();

projects.post("/", async (c) => {
  ensureAdmin(c.get("token"));
  const body = await c.req
    .json<{ name?: string; description?: string }>()
    .catch(() => ({}) as { name?: string; description?: string });
  if (!body.name?.trim()) throw new HTTPException(400, { message: "name is required" });

  const project = await createProject(c.env.DB, body.name.trim(), body.description);
  await writeAudit(c.env.DB, {
    actorTokenId: c.get("token").id,
    action: "project.create",
    targetType: "project",
    targetId: project.id,
    ip: c.req.header("cf-connecting-ip") ?? null
  });
  return c.json(project, 201);
});

projects.get("/", async (c) => {
  const token = c.get("token");
  const all = await listProjects(c.env.DB);
  const visible = token.scope === "admin" ? all : all.filter((p) => p.id === token.project_id);
  return c.json({ projects: visible });
});

projects.get("/:id", async (c) => {
  const id = c.req.param("id");
  ensureProjectAccess(c.get("token"), id, false);
  const project = await getProject(c.env.DB, id);
  if (!project) throw new HTTPException(404, { message: "project not found" });
  const repos = await listReposByProject(c.env.DB, id);
  return c.json({ ...project, repos });
});

projects.post("/:id/repos", async (c) => {
  const id = c.req.param("id");
  ensureProjectAccess(c.get("token"), id, true);
  const project = await getProject(c.env.DB, id);
  if (!project) throw new HTTPException(404, { message: "project not found" });

  const body = await c.req
    .json<{ origin?: string }>()
    .catch(() => ({}) as { origin?: string });
  if (!body.origin?.trim()) throw new HTTPException(400, { message: "origin is required" });

  const repo = await createRepo(c.env.DB, id, body.origin.trim());
  await writeAudit(c.env.DB, {
    actorTokenId: c.get("token").id,
    action: "repo.bind",
    targetType: "repo",
    targetId: repo.id,
    metadata: { origin: repo.origin },
    ip: c.req.header("cf-connecting-ip") ?? null
  });
  return c.json(repo, 201);
});

projects.get("/:id/repos", async (c) => {
  const id = c.req.param("id");
  ensureProjectAccess(c.get("token"), id, false);
  return c.json({ repos: await listReposByProject(c.env.DB, id) });
});
