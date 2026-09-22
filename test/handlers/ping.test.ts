import { describe, it, expect } from "vitest";
import { handlePing } from "../../src/handlers/ping";

describe("handlePing", () => {
  it("204 No Content를 즉시 반환한다", () => {
    const res = handlePing();
    expect(res.status).toBe(204);
  });
});
