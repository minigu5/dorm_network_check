import { describe, it, expect } from "vitest";
import { handleDownload } from "../../src/handlers/download";

describe("handleDownload", () => {
  it("size 파라미터만큼 바이트를 반환한다", async () => {
    const req = new Request("https://example.com/api/download?size=1024");
    const res = handleDownload(req);
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBe(1024);
  });

  it("size가 없거나 잘못되면 400", async () => {
    const req = new Request("https://example.com/api/download");
    const res = handleDownload(req);
    expect(res.status).toBe(400);
  });

  it("size가 최대치(20MB)를 넘으면 400", async () => {
    const req = new Request("https://example.com/api/download?size=99999999");
    const res = handleDownload(req);
    expect(res.status).toBe(400);
  });
});
