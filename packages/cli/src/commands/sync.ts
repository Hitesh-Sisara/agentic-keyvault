import { Command } from "commander";
import { client } from "../client";
import { collectEnvSecrets } from "../sync/collect";
import { syncGithub } from "../sync/github";
import { syncCloudflare } from "../sync/cloudflare";
import { syncDotenv } from "../sync/dotenv";
import { ok, info, fail } from "../output";
import type { ScopeOpts } from "../resolve";

interface ScopeFlags {
  project: string;
  repo?: string;
  origin?: string;
  auto?: boolean;
}

function scope(opts: ScopeFlags): ScopeOpts {
  // Default to auto-detecting the current git origin unless --no-auto is passed.
  return { project: opts.project, repo: opts.repo, origin: opts.origin, auto: opts.auto !== false };
}

function addScope(cmd: Command): Command {
  return cmd
    .requiredOption("--project <id>", "project id")
    .option("--repo <id>", "repo id")
    .option("--origin <url>", "git origin bound to the project")
    .option("--no-auto", "do not auto-detect the current git origin");
}

export function registerSync(program: Command): void {
  const sync = program
    .command("sync")
    .description("push env secrets from a scope to an external target (rotate once, sync everywhere)");

  addScope(
    sync.command("dotenv").description("write env secrets to a local .env file").option("--out <file>", "output file", ".env")
  ).action(async (opts: ScopeFlags & { out: string }) => {
    try {
      const secrets = await collectEnvSecrets(client(), scope(opts));
      syncDotenv(secrets, opts.out);
      ok(`wrote ${secrets.length} secret(s) to ${opts.out}`);
    } catch (err) {
      fail(err);
    }
  });

  addScope(
    sync
      .command("cloudflare")
      .description("push env secrets to a Cloudflare Worker's secrets")
      .requiredOption("--worker <name>", "Worker script name")
  ).action(async (opts: ScopeFlags & { worker: string }) => {
    try {
      const secrets = await collectEnvSecrets(client(), scope(opts));
      await syncCloudflare(opts.worker, secrets);
      ok(`pushed ${secrets.length} secret(s) to Cloudflare Worker "${opts.worker}"`);
    } catch (err) {
      fail(err);
    }
  });

  addScope(
    sync
      .command("github")
      .description("push env secrets to a GitHub repo's Actions secrets")
      .requiredOption("--repo-slug <owner/name>", "GitHub repository, e.g. acme/app")
  ).action(async (opts: ScopeFlags & { repoSlug: string }) => {
    try {
      const secrets = await collectEnvSecrets(client(), scope(opts));
      await syncGithub(opts.repoSlug, secrets);
      ok(`pushed ${secrets.length} secret(s) to GitHub repo "${opts.repoSlug}"`);
    } catch (err) {
      fail(err);
    }
  });

  sync
    .command("targets")
    .description("list available sync targets and their required credentials")
    .action(() => {
      info("dotenv      → local .env file (no credentials)");
      info("cloudflare  → Worker secrets (env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID)");
      info("github      → Actions secrets (env: GITHUB_TOKEN)");
    });
}
