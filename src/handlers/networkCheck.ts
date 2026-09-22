import { getCfProperties, getClientIp, detectCarrier, isBlockedWifiIp } from "../lib/network";

export function handleNetworkCheck(request: Request): Response {
  const { asOrganization } = getCfProperties(request);
  const ip = getClientIp(request);
  const carrier = isBlockedWifiIp(ip) ? null : detectCarrier(asOrganization);
  const status = carrier !== null ? "mobile" : "wifi_or_other";
  return new Response(JSON.stringify({ status, carrier }), {
    headers: { "content-type": "application/json" },
  });
}
