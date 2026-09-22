import { describe, it, expect } from "vitest";
import {
  getCfProperties,
  getClientIp,
  isMobileCarrierOrg,
  detectCarrier,
  isBlockedWifiIp,
} from "../../src/lib/network";

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

describe("getClientIp", () => {
  it("CF-Connecting-IP 헤더를 읽는다", () => {
    const req = new Request("https://example.com/", {
      headers: { "CF-Connecting-IP": "221.168.22.149" },
    });
    expect(getClientIp(req)).toBe("221.168.22.149");
  });

  it("헤더 없으면 null", () => {
    const req = new Request("https://example.com/");
    expect(getClientIp(req)).toBeNull();
  });
});

describe("detectCarrier", () => {
  it("SK Telecom 계열은 SKT로 판정", () => {
    expect(detectCarrier("SK Telecom Co., Ltd.")).toBe("SKT");
  });
  it("KT 계열은 KT로 판정", () => {
    expect(detectCarrier("KT Corporation")).toBe("KT");
  });
  it("LG Uplus 계열은 LGU+로 판정", () => {
    expect(detectCarrier("LG Uplus Corp")).toBe("LGU+");
  });
  it("대소문자 무시", () => {
    expect(detectCarrier("sk telecom co")).toBe("SKT");
  });
  it("학교/기타망은 null", () => {
    expect(detectCarrier("Some University Network")).toBeNull();
  });
  it("null은 null", () => {
    expect(detectCarrier(null)).toBeNull();
  });
});

describe("isBlockedWifiIp", () => {
  it("차단 목록에 있는 IP는 true", () => {
    expect(isBlockedWifiIp("221.168.22.149")).toBe(true);
  });
  it("차단 목록에 없는 IP는 false", () => {
    expect(isBlockedWifiIp("1.2.3.4")).toBe(false);
  });
  it("null은 false", () => {
    expect(isBlockedWifiIp(null)).toBe(false);
  });
});
