import { Command } from "commander";
import { client } from "../client";
import { ok, info, fail } from "../output";

export function registerKek(program: Command): void {
  const kek = program.command("kek").description("master key (KEK) management (admin)");

  kek
    .command("rotate")
    .description("re-wrap all data keys to the active KEK version")
    .action(async () => {
      try {
        const res = await client().rotateKek();
        ok(`re-wrapped ${res.rotated} secret version(s) to KEK v${res.activeVersion}`);
        if (res.rotated === 0) info("  everything was already at the active version.");
        else info("  the retired KEK can now be removed from the Worker.");
      } catch (err) {
        fail(err);
      }
    });
}
