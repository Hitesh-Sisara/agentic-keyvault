import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  clean: true,
  // Inline the workspace client so the published CLI is self-contained.
  noExternal: ["@agentic-keyvault/shared"],
  banner: { js: "#!/usr/bin/env node" },
  outDir: "dist"
});
