import { Command } from "commander";
import { client } from "../client";
import { detectOrigin } from "../git";
import { ok, info, fail, table, fmtDate } from "../output";

export function registerProjects(program: Command): void {
  const project = program.command("project").description("manage projects");

  project
    .command("create <name>")
    .description("create a project")
    .option("--desc <text>", "description")
    .action(async (name: string, opts: { desc?: string }) => {
      try {
        const p = await client().createProject(name, opts.desc);
        ok(`created project ${p.name}`);
        info(`  id:   ${p.id}`);
        info(`  slug: ${p.slug}`);
      } catch (err) {
        fail(err);
      }
    });

  project
    .command("ls")
    .description("list projects")
    .action(async () => {
      try {
        const projects = await client().listProjects();
        table(
          projects.map((p) => ({
            id: p.id,
            name: p.name,
            slug: p.slug,
            created: fmtDate(p.created_at)
          })),
          ["id", "name", "slug", "created"]
        );
      } catch (err) {
        fail(err);
      }
    });

  project
    .command("show <id>")
    .description("show a project and its bound repos")
    .action(async (id: string) => {
      try {
        const p = await client().getProject(id);
        info(`${p.name} (${p.slug})`);
        info(`  id: ${p.id}`);
        info("  repos:");
        table(
          p.repos.map((r) => ({ id: r.id, origin: r.origin, provider: r.provider ?? "" })),
          ["id", "origin", "provider"]
        );
      } catch (err) {
        fail(err);
      }
    });

  const repo = program.command("repo").description("manage repo bindings");

  repo
    .command("bind [origin]")
    .description("bind a git origin to a project (defaults to current repo's origin)")
    .requiredOption("--project <id>", "project id")
    .action(async (origin: string | undefined, opts: { project: string }) => {
      try {
        const target = origin ?? detectOrigin();
        if (!target) throw new Error("no origin given and not inside a git repo");
        const r = await client().bindRepo(opts.project, target);
        ok(`bound ${r.origin} → project ${opts.project}`);
        info(`  repo id: ${r.id}`);
      } catch (err) {
        fail(err);
      }
    });
}
