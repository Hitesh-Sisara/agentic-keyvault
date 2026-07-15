import { Command } from "commander";
import { client } from "../client";
import { resolveRepoId, findSecretByName, type ScopeOpts } from "../resolve";
import { ok, info, fail, table, fmtDate } from "../output";

interface ScopeFlags {
  project: string;
  repo?: string;
  origin?: string;
  auto?: boolean;
  id?: string;
}

function scope(opts: ScopeFlags): ScopeOpts {
  return { project: opts.project, repo: opts.repo, origin: opts.origin, auto: opts.auto };
}

function addScopeFlags(cmd: Command): Command {
  return cmd
    .requiredOption("--project <id>", "project id")
    .option("--repo <id>", "repo id")
    .option("--origin <url>", "git origin bound to the project")
    .option("--auto", "use the current git repo's origin")
    .option("--id <secretId>", "target by secret id instead of name");
}

async function readValue(arg: string | undefined): Promise<string> {
  if (arg !== undefined) return arg;
  return (await Bun.stdin.text()).replace(/\n$/, "");
}

export function registerSecrets(program: Command): void {
  addScopeFlags(
    program
      .command("set <name> [value]")
      .description("create a secret or add a new version (value from stdin if omitted)")
      .option("--env", "mark as an environment variable for the bound repo")
      .option("--desc <text>", "description")
  ).action(
    async (
      name: string,
      value: string | undefined,
      opts: ScopeFlags & { env?: boolean; desc?: string }
    ) => {
      try {
        const c = client();
        const repoId = await resolveRepoId(c, scope(opts));
        const res = await c.setSecret({
          projectId: opts.project,
          repoId,
          name,
          value: await readValue(value),
          isEnv: opts.env,
          description: opts.desc
        });
        ok(`${name} saved (version ${res.version})`);
        info(`  id: ${res.id}`);
      } catch (err) {
        fail(err);
      }
    }
  );

  addScopeFlags(
    program.command("get [name]").description("print a secret value (pipeable)")
  ).action(async (name: string | undefined, opts: ScopeFlags) => {
    try {
      const c = client();
      const id = opts.id ?? (await resolveByName(c, opts, name)).id;
      const secret = await c.getSecret(id);
      process.stdout.write(secret.value + "\n");
    } catch (err) {
      fail(err);
    }
  });

  program
    .command("ls")
    .description("list secrets in a scope (metadata only)")
    .requiredOption("--project <id>", "project id")
    .option("--repo <id>", "repo id")
    .option("--general", "only general (repo-less) secrets")
    .option("--env", "only environment secrets")
    .action(async (opts: { project: string; repo?: string; general?: boolean; env?: boolean }) => {
      try {
        const repo = opts.general ? null : opts.repo;
        const list = await client().listSecrets(opts.project, { repo, env: opts.env });
        table(
          list.map((s) => ({
            name: s.name,
            v: String(s.current_version),
            env: s.is_env ? "yes" : "",
            id: s.id,
            updated: fmtDate(s.updated_at)
          })),
          ["name", "v", "env", "id", "updated"]
        );
      } catch (err) {
        fail(err);
      }
    });

  addScopeFlags(
    program.command("rotate <name> [value]").description("set a new value as the current version")
  ).action(async (name: string, value: string | undefined, opts: ScopeFlags) => {
    try {
      const c = client();
      const id = opts.id ?? (await resolveByName(c, opts, name)).id;
      const res = await c.rotate(id, await readValue(value), "rotate");
      ok(`${name} rotated (version ${res.version})`);
    } catch (err) {
      fail(err);
    }
  });

  addScopeFlags(
    program.command("versions <name>").description("show version history of a secret")
  ).action(async (name: string, opts: ScopeFlags) => {
    try {
      const c = client();
      const id = opts.id ?? (await resolveByName(c, opts, name)).id;
      const versions = await c.listVersions(id);
      table(
        versions.map((v) => ({
          version: String(v.version),
          comment: v.comment ?? "",
          created: fmtDate(v.created_at)
        })),
        ["version", "comment", "created"]
      );
    } catch (err) {
      fail(err);
    }
  });

  addScopeFlags(
    program.command("rm <name>").description("delete a secret (versions are retained)")
  ).action(async (name: string, opts: ScopeFlags) => {
    try {
      const c = client();
      const id = opts.id ?? (await resolveByName(c, opts, name)).id;
      await c.deleteSecret(id);
      ok(`${name} deleted`);
    } catch (err) {
      fail(err);
    }
  });
}

async function resolveByName(
  c: ReturnType<typeof client>,
  opts: ScopeFlags,
  name: string | undefined
) {
  if (!name) throw new Error("provide a secret name or --id");
  const repoId = await resolveRepoId(c, scope(opts));
  return findSecretByName(c, opts.project, repoId, name);
}
