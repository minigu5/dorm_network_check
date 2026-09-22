import type { Env } from "../env";
import { getCfProperties, getClientIp, detectCarrier, isBlockedWifiIp } from "../lib/network";
import { isWithinGeofence } from "../lib/geo";
import { isCurfewWindow, resolveLocationTag, type RawLocationTag } from "../lib/curfew";
import { CURFEW_RADIUS_M, DEFAULT_RADIUS_M } from "../config";
import { parseOS } from "../lib/userAgent";
import { insertMeasurement, type MeasurementInput } from "../lib/db";

interface SubmitBody {
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  dong?: string;
  floor?: string;
  room?: string;
  corridor?: string;
  note?: string;
  download_mbps: number;
  upload_mbps: number;
  ping_ms: number;
  jitter_ms: number;
  packet_loss_pct: number;
  raw_samples: unknown;
}

function badRequest(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
}

export async function handleSubmit(
  request: Request,
  env: Env,
  now: Date = new Date()
): Promise<Response> {
  const { asOrganization } = getCfProperties(request);
  if (isBlockedWifiIp(getClientIp(request))) {
    return badRequest("mobile carrier network required");
  }
  const carrier = detectCarrier(asOrganization);
  if (carrier === null) {
    return badRequest("mobile carrier network required");
  }

  let body: SubmitBody;
  try {
    body = (await request.json()) as SubmitBody;
  } catch {
    return badRequest("invalid JSON body");
  }

  const numericFields: Array<[string, unknown]> = [
    ["download_mbps", body.download_mbps],
    ["upload_mbps", body.upload_mbps],
    ["ping_ms", body.ping_ms],
    ["jitter_ms", body.jitter_ms],
    ["packet_loss_pct", body.packet_loss_pct],
  ];
  for (const [name, value] of numericFields) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return badRequest(`${name} must be a finite number`);
    }
  }

  if (
    body.accuracy_m !== null &&
    body.accuracy_m !== undefined &&
    (typeof body.accuracy_m !== "number" || !Number.isFinite(body.accuracy_m))
  ) {
    return badRequest("accuracy_m must be a finite number or null");
  }

  if (body.note !== undefined && body.note !== null && typeof body.note !== "string") {
    return badRequest("note must be a string");
  }
  const note = typeof body.note === "string" ? body.note.trim() : null;

  const dormLat = Number(env.DORM_LAT);
  const dormLng = Number(env.DORM_LNG);
  const curfew = isCurfewWindow(now);
  const radius = curfew ? CURFEW_RADIUS_M : DEFAULT_RADIUS_M;

  let rawLocationTag: RawLocationTag;
  if (
    typeof body.lat !== "number" ||
    typeof body.lng !== "number" ||
    !Number.isFinite(body.lat) ||
    !Number.isFinite(body.lng)
  ) {
    rawLocationTag = "미확인";
  } else if (isWithinGeofence(body.lat, body.lng, dormLat, dormLng, radius)) {
    rawLocationTag = "실내";
  } else {
    rawLocationTag = "외부";
  }

  const locationTag = resolveLocationTag(rawLocationTag, curfew);

  let indoorFields: { dong: string; floor: string; room: string; corridor: string } | null = null;
  if (locationTag === "실내") {
    const rawIndoorFields: unknown[] = [body.dong, body.floor, body.room, body.corridor];
    const allValid = rawIndoorFields.every(
      (value) => typeof value === "string" && value.trim() !== ""
    );
    if (!allValid) {
      return badRequest("dong/floor/room/corridor are required when indoors");
    }
    indoorFields = {
      dong: (body.dong as string).trim(),
      floor: (body.floor as string).trim(),
      room: (body.room as string).trim(),
      corridor: (body.corridor as string).trim(),
    };
  }

  const measurement: MeasurementInput = {
    created_at: now.toISOString(),
    lat: body.lat ?? null,
    lng: body.lng ?? null,
    accuracy_m: body.accuracy_m ?? null,
    raw_location_tag: rawLocationTag,
    is_curfew_window: curfew ? 1 : 0,
    location_tag: locationTag,
    dong: indoorFields?.dong ?? null,
    floor: indoorFields?.floor ?? null,
    room: indoorFields?.room ?? null,
    corridor: indoorFields?.corridor ?? null,
    note: locationTag === "실내" ? null : note,
    carrier: carrier,
    network_org: asOrganization,
    os: parseOS(request.headers.get("user-agent")),
    download_mbps: body.download_mbps,
    upload_mbps: body.upload_mbps,
    ping_ms: body.ping_ms,
    jitter_ms: body.jitter_ms,
    packet_loss_pct: body.packet_loss_pct,
    raw_samples: JSON.stringify(body.raw_samples ?? null),
  };

  await insertMeasurement(env.DB, measurement);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" },
  });
}
