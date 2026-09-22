import { getCfProperties, isMobileCarrierOrg } from "../lib/network";

export function handleNetworkCheck(request: Request): Response {
  const { asOrganization } = getCfProperties(request);
  const status = isMobileCarrierOrg(asOrganization) ? "mobile" : "wifi_or_other";
  return new Response(JSON.stringify({ status }), {
    headers: { "content-type": "application/json" },
  });
}
