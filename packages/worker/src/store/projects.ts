import type { Project } from "../types";
import { newProjectId, slugify } from "../ids";

export async function createProject(
  db: D1Database,
  name: string,
  description?: string
): Promise<Project> {
  const project: Project = {
    id: newProjectId(),
    name,
    slug: slugify(name),
    description: description ?? null,
    created_at: Date.now()
  };
  await db
    .prepare(
      "INSERT INTO projects (id, name, slug, description, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(project.id, project.name, project.slug, project.description, project.created_at)
    .run();
  return project;
}

export async function listProjects(db: D1Database): Promise<Project[]> {
  const { results } = await db
    .prepare("SELECT * FROM projects ORDER BY created_at DESC")
    .all<Project>();
  return results;
}

export async function getProject(db: D1Database, id: string): Promise<Project | null> {
  return db.prepare("SELECT * FROM projects WHERE id = ?").bind(id).first<Project>();
}

export async function getProjectBySlug(db: D1Database, slug: string): Promise<Project | null> {
  return db.prepare("SELECT * FROM projects WHERE slug = ?").bind(slug).first<Project>();
}
