import type { Env } from "../env";
import { isWithinGeofence } from "../lib/geo";
import { isCurfewWindow, resolveLocationTag, type RawLocationTag } from "../lib/curfew";
import { CURFEW_RADIUS_M, DEFAULT_RADIUS_M } from "../config";

export function handleLocationCheck(
  request: Request,
  env: Env,
  now: Date = new Date()
): Response {
  const url = new URL(request.url);
  const latParam = url.searchParams.get("lat");
  const lngParam = url.searchParams.get("lng");

  let tag: RawLocationTag;
  if (latParam === null || lngParam === null) {
    tag = "미확인";
  } else {
    const lat = Number(latParam);
    const lng = Number(lngParam);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      tag = "미확인";
    } else {
      const dormLat = Number(env.DORM_LAT);
      const dormLng = Number(env.DORM_LNG);
      const curfew = isCurfewWindow(now);
      const radius = curfew ? CURFEW_RADIUS_M : DEFAULT_RADIUS_M;
      const raw: RawLocationTag = isWithinGeofence(lat, lng, dormLat, dormLng, radius)
        ? "실내"
        : "외부";
      tag = resolveLocationTag(raw, curfew);
    }
  }

  return new Response(JSON.stringify({ tag }), {
    headers: { "content-type": "application/json" },
  });
}
