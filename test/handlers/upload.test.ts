import { describe, it, expect } from "vitest";
import { handleUpload } from "../../src/handlers/upload";

describe("handleUpload", () => {
  it("받은 바이트 수를 JSON으로 반환한다", async () => {
    const body = new Uint8Array(2048);
    const req = new Request("https://example.com/api/upload", {
      method: "POST",
      body,
    });
    const res = await handleUpload(req);
    const json = await res.json();
    expect(json).toEqual({ received: 2048 });
  });
});
