import { describe, it, expect } from "vitest";
import { handleNetworkCheck } from "../../src/handlers/networkCheck";

describe("handleNetworkCheck", () => {
  it("모바일망이면 status: mobile, 통신사 이름 포함", async () => {
    const req = new Request("https://example.com/api/network-check", {
      cf: { asOrganization: "SK Telecom" },
    } as RequestInit);
    const res = handleNetworkCheck(req);
    const body = await res.json();
    expect(body).toEqual({ status: "mobile", carrier: "SKT" });
  });

  it("WiFi/기타망이면 status: wifi_or_other, carrier: null", async () => {
    const req = new Request("https://example.com/api/network-check", {
      cf: { asOrganization: "Some University" },
    } as RequestInit);
    const res = handleNetworkCheck(req);
    const body = await res.json();
    expect(body).toEqual({ status: "wifi_or_other", carrier: null });
  });

  it("모바일망 조직명이어도 차단된 WiFi IP면 wifi_or_other", async () => {
    const req = new Request("https://example.com/api/network-check", {
      cf: { asOrganization: "KT Corporation" },
      headers: { "CF-Connecting-IP": "221.168.22.149" },
    } as RequestInit);
    const res = handleNetworkCheck(req);
    const body = await res.json();
    expect(body).toEqual({ status: "wifi_or_other", carrier: null });
  });
});
