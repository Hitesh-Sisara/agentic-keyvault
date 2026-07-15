import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  clean: true,
  noExternal: ["@agentic-keyvault/shared"],
  banner: { js: "#!/usr/bin/env node" },
  outDir: "dist"
});
