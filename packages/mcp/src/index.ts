import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { buildClient, text } from "./client";

const server = new McpServer({
  name: "agentic-keyvault",
  version: "0.1.0"
});

server.tool(
  "list_projects",
  "List all projects the token can access.",
  {},
  async () => text(await buildClient().listProjects())
);

server.tool(
  "get_project",
  "Get a project and its bound git repos by project id.",
  { projectId: z.string().describe("project id (proj_...)") },
  async ({ projectId }) => text(await buildClient().getProject(projectId))
);

server.tool(
  "list_secrets",
  "List secret metadata (names, ids, versions) in a project. Values are NOT returned.",
  {
    projectId: z.string().describe("project id"),
    repoId: z.string().optional().describe("restrict to a repo; omit for all scopes"),
    generalOnly: z.boolean().optional().describe("only general (repo-less) secrets"),
    envOnly: z.boolean().optional().describe("only environment-variable secrets")
  },
  async ({ projectId, repoId, generalOnly, envOnly }) =>
    text(
      await buildClient().listSecrets(projectId, {
        repo: generalOnly ? null : repoId,
        env: envOnly
      })
    )
);

server.tool(
  "get_secret",
  "Get the current decrypted value of a secret by its id.",
  { secretId: z.string().describe("secret id (sec_...)") },
  async ({ secretId }) => text(await buildClient().getSecret(secretId))
);

server.tool(
  "get_secret_version",
  "Get the decrypted value of a specific historical version of a secret.",
  {
    secretId: z.string().describe("secret id"),
    version: z.number().int().min(1).describe("version number")
  },
  async ({ secretId, version }) => text(await buildClient().getVersion(secretId, version))
);

server.tool(
  "list_versions",
  "List the version history of a secret (metadata only).",
  { secretId: z.string().describe("secret id") },
  async ({ secretId }) => text(await buildClient().listVersions(secretId))
);

server.tool(
  "set_secret",
  "Create a secret or add a new version. Requires a write-capable token.",
  {
    projectId: z.string().describe("project id"),
    name: z.string().describe("secret name, e.g. STRIPE_KEY"),
    value: z.string().describe("the secret value to store"),
    repoId: z.string().optional().describe("bind to a repo scope"),
    origin: z.string().optional().describe("git origin bound to the project (alternative to repoId)"),
    isEnv: z.boolean().optional().describe("mark as an environment variable"),
    description: z.string().optional()
  },
  async (args) =>
    text(
      await buildClient().setSecret({
        projectId: args.projectId,
        name: args.name,
        value: args.value,
        repoId: args.repoId,
        origin: args.origin,
        isEnv: args.isEnv,
        description: args.description
      })
    )
);

server.tool(
  "rotate_secret",
  "Set a new value as the current version of an existing secret. Requires a write-capable token.",
  {
    secretId: z.string().describe("secret id"),
    value: z.string().describe("the new secret value"),
    comment: z.string().optional()
  },
  async ({ secretId, value, comment }) =>
    text(await buildClient().rotate(secretId, value, comment))
);

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
  // stderr is safe; stdout is reserved for the MCP protocol stream.
  console.error("agentic-keyvault MCP server ready (stdio)");
}

main().catch((err) => {
  console.error("fatal:", err);
  process.exit(1);
});
