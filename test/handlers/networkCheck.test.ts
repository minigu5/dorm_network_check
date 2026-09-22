import { describe, it, expect } from "vitest";
import { handleNetworkCheck } from "../../src/handlers/networkCheck";

describe("handleNetworkCheck", () => {
  it("모바일망이면 status: mobile", async () => {
    const req = new Request("https://example.com/api/network-check", {
      cf: { asOrganization: "SK Telecom" },
    } as RequestInit);
    const res = handleNetworkCheck(req);
    const body = await res.json();
    expect(body).toEqual({ status: "mobile" });
  });

  it("WiFi/기타망이면 status: wifi_or_other", async () => {
    const req = new Request("https://example.com/api/network-check", {
      cf: { asOrganization: "Some University" },
    } as RequestInit);
    const res = handleNetworkCheck(req);
    const body = await res.json();
    expect(body).toEqual({ status: "wifi_or_other" });
  });
});
