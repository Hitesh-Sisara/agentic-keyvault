import { Command } from "commander";
import { KeyvaultClient } from "@agentic-keyvault/shared";
import { loadConfig, saveConfig, configPath } from "../config";
import { anonClient, client } from "../client";
import { ok, info, fail, fmtDate } from "../output";

export function registerAuth(program: Command): void {
  program
    .command("login")
    .description("save the worker URL and an access token")
    .requiredOption("--url <url>", "worker base URL, e.g. https://agentic-keyvault.you.workers.dev")
    .option("--token <token>", "access token (akv_...)")
    .action(async (opts: { url: string; token?: string }) => {
      try {
        const existing = loadConfig();
        const token = opts.token ?? existing.token;
        if (!token) throw new Error("no token given — pass --token or run `akv bootstrap` first");
        const c = new KeyvaultClient({ baseUrl: opts.url, token });
        await c.health();
        saveConfig({ baseUrl: opts.url, token });
        ok(`logged in — config saved to ${configPath()}`);
      } catch (err) {
        fail(err);
      }
    });

  program
    .command("bootstrap")
    .description("create the first admin token (one-time; needs ALLOW_BOOTSTRAP=true)")
    .requiredOption("--url <url>", "worker base URL")
    .action(async (opts: { url: string }) => {
      try {
        const minted = await anonClient(opts.url).bootstrap();
        saveConfig({ baseUrl: opts.url, token: minted.token });
        ok("admin token created and saved");
        info(`  token: ${minted.token}`);
        info("  store this somewhere safe — it is shown only once.");
      } catch (err) {
        fail(err);
      }
    });

  program
    .command("whoami")
    .description("show the current config and token scopes")
    .action(async () => {
      try {
        const cfg = loadConfig();
        info(`url:   ${cfg.baseUrl ?? "(unset)"}`);
        info(`token: ${cfg.token ? cfg.token.slice(0, 12) + "…" : "(unset)"}`);
        const tokens = await client().listTokens();
        const mine = tokens.find((t) => cfg.token && t.revoked === 0);
        if (mine) info(`scopes reachable: ${tokens.length} token(s) visible (admin)`);
      } catch {
        // whoami is best-effort; ignore errors listing tokens (e.g. project-scoped token)
      }
    });

  program
    .command("audit")
    .description("show recent audit log (admin)")
    .option("--limit <n>", "max entries", "50")
    .action(async (opts: { limit: string }) => {
      try {
        const entries = await client().audit(Number(opts.limit));
        for (const e of entries) {
          info(`${fmtDate(e.created_at)}  ${e.action.padEnd(16)} ${e.target_id ?? ""}`);
        }
      } catch (err) {
        fail(err);
      }
    });
}
