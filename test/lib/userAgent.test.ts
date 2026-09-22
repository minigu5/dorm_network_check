import { describe, it, expect } from "vitest";
import { parseOS } from "../../src/lib/userAgent";

describe("parseOS", () => {
  it("iPhone UA는 iOS", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15";
    expect(parseOS(ua)).toBe("iOS");
  });
  it("Android UA는 Android", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36";
    expect(parseOS(ua)).toBe("Android");
  });
  it("그 외/null은 Other", () => {
    expect(parseOS("curl/8.0")).toBe("Other");
    expect(parseOS(null)).toBe("Other");
  });
});
