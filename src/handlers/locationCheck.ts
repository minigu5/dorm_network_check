import type { Env } from "../env";
import { haversineDistanceMeters } from "../lib/geo";
import { isTrustedWindow, resolveLocationTag, type RawLocationTag } from "../lib/curfew";
import { CURFEW_RADIUS_M, DEFAULT_RADIUS_M } from "../config";

export function handleLocationCheck(
  request: Request,
  env: Env,
  now: Date = new Date()
): Response {
  const url = new URL(request.url);
  const latParam = url.searchParams.get("lat");
  const lngParam = url.searchParams.get("lng");
  const accuracyParam = url.searchParams.get("accuracy");

  let tag: RawLocationTag;
  const lat = latParam !== null ? Number(latParam) : NaN;
  const lng = lngParam !== null ? Number(lngParam) : NaN;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    tag = "미확인";
  } else {
    const dormLat = Number(env.DORM_LAT);
    const dormLng = Number(env.DORM_LNG);
    const trusted = isTrustedWindow(now);
    const radius = trusted ? CURFEW_RADIUS_M : DEFAULT_RADIUS_M;
    const distanceM = haversineDistanceMeters(lat, lng, dormLat, dormLng);
    const raw: RawLocationTag = distanceM <= radius ? "실내" : "외부";

    const accuracyParsed = accuracyParam !== null ? Number(accuracyParam) : NaN;
    const accuracyM = Number.isFinite(accuracyParsed) ? accuracyParsed : null;

    tag = resolveLocationTag(raw, trusted, distanceM, accuracyM);
  }

  return new Response(JSON.stringify({ tag }), {
    headers: { "content-type": "application/json" },
  });
}
