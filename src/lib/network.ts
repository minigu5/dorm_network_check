import { CARRIER_ORG_KEYWORDS, BLOCKED_WIFI_IPS, type CarrierName } from "../config";

export function getCfProperties(request: Request): {
  asn: number | null;
  asOrganization: string | null;
} {
  const cf = (request as Request & { cf?: IncomingRequestCfProperties }).cf;
  return {
    asn: cf?.asn ?? null,
    asOrganization: cf?.asOrganization ?? null,
  };
}

export function getClientIp(request: Request): string | null {
  return request.headers.get("CF-Connecting-IP");
}

// asOrganization이 등록된 통신사 키워드 그룹 중 하나와 일치하면 그 통신사 이름을,
// 아니면 null을 반환한다. isMobileCarrierOrg는 이 결과가 null이 아닌지로 판정한다 --
// 두 함수가 서로 다른 로직을 갖지 않도록 detectCarrier가 유일한 판정 지점이다.
export function detectCarrier(asOrganization: string | null): CarrierName | null {
  if (!asOrganization) return null;
  const lower = asOrganization.toLowerCase();
  for (const carrier of Object.keys(CARRIER_ORG_KEYWORDS) as CarrierName[]) {
    if (CARRIER_ORG_KEYWORDS[carrier].some((keyword) => lower.includes(keyword))) {
      return carrier;
    }
  }
  return null;
}

export function isMobileCarrierOrg(asOrganization: string | null): boolean {
  return detectCarrier(asOrganization) !== null;
}

export function isBlockedWifiIp(ip: string | null): boolean {
  if (!ip) return false;
  return BLOCKED_WIFI_IPS.includes(ip);
}
