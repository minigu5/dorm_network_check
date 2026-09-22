import { describe, it, expect } from "vitest";
import { getCfProperties, isMobileCarrierOrg } from "../../src/lib/network";

describe("isMobileCarrierOrg", () => {
  it("SK Telecom 계열은 모바일망으로 판정", () => {
    expect(isMobileCarrierOrg("SK Telecom Co., Ltd.")).toBe(true);
  });
  it("KT 계열은 모바일망으로 판정", () => {
    expect(isMobileCarrierOrg("KT Corporation")).toBe(true);
  });
  it("LG Uplus 계열은 모바일망으로 판정", () => {
    expect(isMobileCarrierOrg("LG Uplus Corp")).toBe(true);
  });
  it("대소문자 무시", () => {
    expect(isMobileCarrierOrg("sk telecom co")).toBe(true);
  });
  it("학교/기타망은 false", () => {
    expect(isMobileCarrierOrg("Some University Network")).toBe(false);
  });
  it("null은 false", () => {
    expect(isMobileCarrierOrg(null)).toBe(false);
  });
});

describe("getCfProperties", () => {
  it("request.cf에서 asn/asOrganization을 읽는다", () => {
    const req = new Request("https://example.com/", {
      cf: { asn: 9318, asOrganization: "SK Telecom" },
    } as RequestInit);
    const props = getCfProperties(req);
    expect(props.asn).toBe(9318);
    expect(props.asOrganization).toBe("SK Telecom");
  });

  it("cf가 없으면 null을 반환", () => {
    const req = new Request("https://example.com/");
    const props = getCfProperties(req);
    expect(props.asn).toBeNull();
    expect(props.asOrganization).toBeNull();
  });
});
