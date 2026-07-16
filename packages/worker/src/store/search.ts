export interface SearchResults {
  projects: Array<{ id: string; name: string; slug: string }>;
  repos: Array<{ id: string; project_id: string; origin: string }>;
  secrets: Array<{ id: string; project_id: string; repo_id: string | null; name: string }>;
}

export interface SearchOpts {
  query: string;
  types: Set<string>; // "project" | "repo" | "secret"
  projectScope?: string; // restrict to one project (for project-scoped tokens)
}

// Escape LIKE wildcards so a query of "50%" is literal.
function likeTerm(q: string): string {
  return "%" + q.replace(/[\\%_]/g, (m) => "\\" + m) + "%";
}

/** Metadata-only search across project names, repo origins, and secret names. */
export async function search(db: D1Database, opts: SearchOpts): Promise<SearchResults> {
  const like = likeTerm(opts.query);
  const out: SearchResults = { projects: [], repos: [], secrets: [] };

  if (opts.types.has("project")) {
    const clauses = ["(name LIKE ?1 ESCAPE '\\' OR slug LIKE ?1 ESCAPE '\\')"];
    const binds: unknown[] = [like];
    if (opts.projectScope) {
      clauses.push("id = ?2");
      binds.push(opts.projectScope);
    }
    const { results } = await db
      .prepare(`SELECT id, name, slug FROM projects WHERE ${clauses.join(" AND ")} ORDER BY name LIMIT 50`)
      .bind(...binds)
      .all<{ id: string; name: string; slug: string }>();
    out.projects = results;
  }

  if (opts.types.has("repo")) {
    const clauses = ["origin LIKE ?1 ESCAPE '\\'"];
    const binds: unknown[] = [like];
    if (opts.projectScope) {
      clauses.push("project_id = ?2");
      binds.push(opts.projectScope);
    }
    const { results } = await db
      .prepare(`SELECT id, project_id, origin FROM repos WHERE ${clauses.join(" AND ")} ORDER BY origin LIMIT 50`)
      .bind(...binds)
      .all<{ id: string; project_id: string; origin: string }>();
    out.repos = results;
  }

  if (opts.types.has("secret")) {
    const clauses = ["name LIKE ?1 ESCAPE '\\'", "deleted_at IS NULL"];
    const binds: unknown[] = [like];
    if (opts.projectScope) {
      clauses.push("project_id = ?2");
      binds.push(opts.projectScope);
    }
    const { results } = await db
      .prepare(
        `SELECT id, project_id, repo_id, name FROM secrets WHERE ${clauses.join(" AND ")} ORDER BY name LIMIT 100`
      )
      .bind(...binds)
      .all<{ id: string; project_id: string; repo_id: string | null; name: string }>();
    out.secrets = results;
  }

  return out;
}
