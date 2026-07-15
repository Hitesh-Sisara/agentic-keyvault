import path from "node:path";
import { defineWorkersConfig, readD1Migrations } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, "migrations"));
  return {
    test: {
      setupFiles: ["./test/apply-migrations.ts"],
      poolOptions: {
        workers: {
          wrangler: { configPath: "./wrangler.jsonc" },
          miniflare: {
            bindings: {
              // Deterministic 32-byte KEK for tests.
              MASTER_KEK: "Z6r1Qw9mVc0mJH2kR8xT5aP3nB7yD4uL1gS0eW6iH8k=",
              ALLOW_BOOTSTRAP: "true",
              TEST_MIGRATIONS: migrations
            }
          }
        }
      }
    }
  };
});
