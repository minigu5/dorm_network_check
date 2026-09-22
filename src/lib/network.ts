import { MOBILE_CARRIER_ORG_KEYWORDS } from "../config";

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

export function isMobileCarrierOrg(asOrganization: string | null): boolean {
  if (!asOrganization) return false;
  const lower = asOrganization.toLowerCase();
  return MOBILE_CARRIER_ORG_KEYWORDS.some((keyword) => lower.includes(keyword));
}
