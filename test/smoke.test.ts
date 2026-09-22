import { describe, it, expect } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext, SELF } from "cloudflare:test";

describe("worker smoke test", () => {
  it("responds to /api/unknown with 404", async () => {
    const response = await SELF.fetch("https://example.com/api/unknown");
    expect(response.status).toBe(404);
  });
});
