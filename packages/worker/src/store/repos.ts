import type { Repo } from "../types";
import { newRepoId } from "../ids";

/**
 * Normalize a git remote URL to `host/owner/repo` (no scheme, no `.git`,
 * no credentials). Both SSH and HTTPS forms collapse to the same key.
 */
export function normalizeOrigin(raw: string): {
  origin: string;
  provider: string;
  owner: string | null;
  name: string | null;
} {
  let s = raw.trim();
  s = s.replace(/\.git$/, "");
  // git@github.com:owner/repo  ->  github.com/owner/repo
  s = s.replace(/^[^@]+@([^:]+):/, "$1/");
  // https://user:tok@github.com/owner/repo -> github.com/owner/repo
  s = s.replace(/^[a-z]+:\/\//i, "").replace(/^[^@/]+@/, "");
  s = s.replace(/\/+$/, "").toLowerCase();

  const parts = s.split("/");
  const host = parts[0] ?? "";
  const owner = parts.length >= 3 ? parts[parts.length - 2]! : null;
  const name = parts.length >= 2 ? parts[parts.length - 1]! : null;
  const provider = host.includes("github")
    ? "github"
    : host.includes("gitlab")
      ? "gitlab"
      : host.includes("bitbucket")
        ? "bitbucket"
        : "other";
  return { origin: s, provider, owner, name };
}

export async function createRepo(
  db: D1Database,
  projectId: string,
  rawOrigin: string
): Promise<Repo> {
  const { origin, provider, owner, name } = normalizeOrigin(rawOrigin);
  const repo: Repo = {
    id: newRepoId(),
    project_id: projectId,
    origin,
    provider,
    owner,
    name,
    created_at: Date.now()
  };
  await db
    .prepare(
      "INSERT INTO repos (id, project_id, origin, provider, owner, name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(repo.id, repo.project_id, repo.origin, repo.provider, repo.owner, repo.name, repo.created_at)
    .run();
  return repo;
}

export async function listReposByProject(db: D1Database, projectId: string): Promise<Repo[]> {
  const { results } = await db
    .prepare("SELECT * FROM repos WHERE project_id = ? ORDER BY created_at DESC")
    .bind(projectId)
    .all<Repo>();
  return results;
}

export async function getRepo(db: D1Database, id: string): Promise<Repo | null> {
  return db.prepare("SELECT * FROM repos WHERE id = ?").bind(id).first<Repo>();
}

export async function getRepoByOrigin(db: D1Database, rawOrigin: string): Promise<Repo | null> {
  const { origin } = normalizeOrigin(rawOrigin);
  return db.prepare("SELECT * FROM repos WHERE origin = ?").bind(origin).first<Repo>();
}
