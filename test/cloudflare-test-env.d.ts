import type { Env } from "../src/env";
import type { D1Migration } from "cloudflare:test";

// @cloudflare/vitest-pool-workers ships "cloudflare:test" with an empty
// `ProvidedEnv` interface by design and expects each project to augment it
// via declaration merging (see its own doc comment on `ProvidedEnv`). Without
// this, every `env.DB`/`env.TEST_MIGRATIONS` access in the test suite fails
// `tsc --noEmit` with "Property '...' does not exist on type 'ProvidedEnv'".
declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {
    // Injected as a test-only Miniflare binding from vitest.config.ts; not
    // part of the real worker's Env.
    TEST_MIGRATIONS: D1Migration[];
  }
}
