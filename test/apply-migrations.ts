import { applyD1Migrations, env } from "cloudflare:test";

// `TEST_MIGRATIONS` is injected as a test-only Miniflare binding from
// vitest.config.ts (which reads the real migrations/ directory in Node.js,
// where filesystem access is available). This applies those exact migrations
// to the ephemeral D1 database the test pool creates for each worker.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
