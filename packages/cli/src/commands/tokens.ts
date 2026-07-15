import { Command } from "commander";
import { client } from "../client";
import { ok, info, fail, table, fmtDate } from "../output";

export function registerTokens(program: Command): void {
  const token = program.command("token").description("manage access tokens (admin)");

  token
    .command("mint <name>")
    .description("mint a token; project-scoped unless --admin")
    .option("--admin", "mint an admin token (full access)")
    .option("--project <id>", "restrict to a project")
    .option("--write", "allow writes (project tokens are read-only by default)")
    .action(async (name: string, opts: { admin?: boolean; project?: string; write?: boolean }) => {
      try {
        if (!opts.admin && !opts.project) {
          throw new Error("specify --admin or --project <id>");
        }
        const minted = await client().mintToken({
          name,
          scope: opts.admin ? "admin" : "project",
          projectId: opts.project,
          canWrite: opts.write
        });
        ok(`minted ${minted.scope} token "${name}"`);
        info(`  token: ${minted.token}`);
        info("  shown only once — copy it now.");
      } catch (err) {
        fail(err);
      }
    });

  token
    .command("ls")
    .description("list tokens")
    .action(async () => {
      try {
        const tokens = await client().listTokens();
        table(
          tokens.map((t) => ({
            id: t.id,
            name: t.name,
            scope: t.scope,
            write: t.can_write ? "yes" : "",
            revoked: t.revoked ? "yes" : "",
            used: t.last_used_at ? fmtDate(t.last_used_at) : ""
          })),
          ["id", "name", "scope", "write", "revoked", "used"]
        );
      } catch (err) {
        fail(err);
      }
    });

  token
    .command("revoke <id>")
    .description("revoke a token")
    .action(async (id: string) => {
      try {
        await client().revokeToken(id);
        ok(`revoked ${id}`);
      } catch (err) {
        fail(err);
      }
    });
}
