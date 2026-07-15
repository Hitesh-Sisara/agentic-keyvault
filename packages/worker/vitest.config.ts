import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          // Provide a deterministic KEK for tests (32 random bytes, base64).
          bindings: {
            MASTER_KEK: "Z6r1Qw9mVc0mJH2kR8xT5aP3nB7yD4uL1gS0eW6iH8k="
          }
        }
      }
    }
  }
});
