import { applyD1Migrations, env } from "cloudflare:test";

// Applied once before the test suite: brings the isolated D1 up to schema.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
