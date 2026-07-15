import { Command } from "commander";
import { readFileSync, writeFileSync } from "node:fs";
import { client } from "../client";
import { resolveRepoId } from "../resolve";
import { ok, info, fail } from "../output";

function quote(value: string): string {
  return /[\s"'#=]/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;
}

function parseEnv(text: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim().replace(/^export\s+/, "");
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1).replace(/\\"/g, '"');
    }
    out.push([key, val]);
  }
  return out;
}

export function registerEnv(program: Command): void {
  const env = program.command("env").description("sync .env files with a repo scope");

  env
    .command("pull")
    .description("write env secrets for a scope into a .env file")
    .requiredOption("--project <id>", "project id")
    .option("--repo <id>", "repo id")
    .option("--origin <url>", "git origin bound to the project")
    .option("--no-auto", "do not auto-detect the current git origin")
    .option("--out <file>", "output file", ".env")
    .action(
      async (opts: { project: string; repo?: string; origin?: string; auto?: boolean; out: string }) => {
        try {
          const c = client();
          const repoId = await resolveRepoId(c, {
            project: opts.project,
            repo: opts.repo,
            origin: opts.origin,
            auto: opts.auto !== false
          });
          const metas = await c.listSecrets(opts.project, { repo: repoId, env: true });
          const lines: string[] = [];
          for (const m of metas) {
            const s = await c.getSecret(m.id);
            lines.push(`${m.name}=${quote(s.value)}`);
          }
          writeFileSync(opts.out, lines.join("\n") + (lines.length ? "\n" : ""), { mode: 0o600 });
          ok(`wrote ${lines.length} secret(s) to ${opts.out}`);
        } catch (err) {
          fail(err);
        }
      }
    );

  env
    .command("push [file]")
    .description("upload a .env file as env secrets for a scope")
    .requiredOption("--project <id>", "project id")
    .option("--repo <id>", "repo id")
    .option("--origin <url>", "git origin bound to the project")
    .option("--no-auto", "do not auto-detect the current git origin")
    .action(
      async (
        file: string | undefined,
        opts: { project: string; repo?: string; origin?: string; auto?: boolean }
      ) => {
        try {
          const c = client();
          const repoId = await resolveRepoId(c, {
            project: opts.project,
            repo: opts.repo,
            origin: opts.origin,
            auto: opts.auto !== false
          });
          const entries = parseEnv(readFileSync(file ?? ".env", "utf8"));
          for (const [name, value] of entries) {
            await c.setSecret({ projectId: opts.project, repoId, name, value, isEnv: true });
            info(`  ${name}`);
          }
          ok(`pushed ${entries.length} secret(s)`);
        } catch (err) {
          fail(err);
        }
      }
    );
}
