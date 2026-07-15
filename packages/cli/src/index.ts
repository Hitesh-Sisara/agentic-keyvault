import { Command } from "commander";
import { registerAuth } from "./commands/auth";
import { registerProjects } from "./commands/projects";
import { registerSecrets } from "./commands/secrets";
import { registerEnv } from "./commands/env";
import { registerTokens } from "./commands/tokens";
import { registerKek } from "./commands/kek";
import { registerSync } from "./commands/sync";

const program = new Command();

program
  .name("akv")
  .description("agentic-keyvault — a secrets store your CLI and AI agents can read back")
  .version("0.1.0");

registerAuth(program);
registerProjects(program);
registerSecrets(program);
registerEnv(program);
registerTokens(program);
registerKek(program);
registerSync(program);

program.parseAsync(process.argv);
