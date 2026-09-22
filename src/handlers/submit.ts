import type { Env } from "../env";
import { getCfProperties, getClientIp, detectCarrier, isBlockedWifiIp, hashIp } from "../lib/network";
import { haversineDistanceMeters } from "../lib/geo";
import { isTrustedWindow, resolveLocationTag, type RawLocationTag } from "../lib/curfew";
import {
  CURFEW_RADIUS_M,
  DEFAULT_RADIUS_M,
  MEASUREMENT_LIMITS,
  MAX_ACCURACY_M,
  SUBMIT_COOLDOWN_SECONDS,
} from "../config";
import { parseOS } from "../lib/userAgent";
import {
  insertMeasurement,
  claimSubmissionSlot,
  releaseSubmissionSlot,
  type MeasurementInput,
} from "../lib/db";

interface SubmitBody {
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  room?: string;
  corridor?: string;
  note?: string;
  manual_override?: boolean;
  download_mbps: number;
  upload_mbps: number;
  ping_ms: number;
  jitter_ms: number;
  packet_loss_pct: number;
  raw_samples: unknown;
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function badRequest(message: string): Response {
  return jsonError(400, message);
}

function tooManyRequests(message: string): Response {
  return jsonError(429, message);
}

export async function handleSubmit(
  request: Request,
  env: Env,
  now: Date = new Date()
): Promise<Response> {
  const clientIp = getClientIp(request);
  if (isBlockedWifiIp(clientIp)) {
    return badRequest("mobile carrier network required");
  }
  const { asOrganization } = getCfProperties(request);
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
    const limits = MEASUREMENT_LIMITS[name as keyof typeof MEASUREMENT_LIMITS];
    if (value < limits.min || value > limits.max) {
      return badRequest(`${name} must be between ${limits.min} and ${limits.max}`);
    }
  }

  if (
    body.accuracy_m !== null &&
    body.accuracy_m !== undefined &&
    (typeof body.accuracy_m !== "number" || !Number.isFinite(body.accuracy_m))
  ) {
    return badRequest("accuracy_m must be a finite number or null");
  }
  // 음수는 실제 GPS 센서가 절대 내놓지 않는 값이라 거부하지만, 큰 값(실내/저신호
  // 상태에서 흔함)은 정상 기기에서도 나올 수 있어 제출 자체를 막지 않는다 --
  // 대신 판정 계산에서만 상한을 씌운다(아래 accuracyMForTag).
  if (typeof body.accuracy_m === "number" && body.accuracy_m < 0) {
    return badRequest("accuracy_m must not be negative");
  }

  if (body.note !== undefined && body.note !== null && typeof body.note !== "string") {
    return badRequest("note must be a string");
  }
  const note = typeof body.note === "string" ? body.note.trim() : null;

  const dormLat = Number(env.DORM_LAT);
  const dormLng = Number(env.DORM_LNG);
  const trusted = isTrustedWindow(now);
  const radius = trusted ? CURFEW_RADIUS_M : DEFAULT_RADIUS_M;

  let rawLocationTag: RawLocationTag;
  let distanceM: number | null = null;
  if (
    typeof body.lat !== "number" ||
    typeof body.lng !== "number" ||
    !Number.isFinite(body.lat) ||
    !Number.isFinite(body.lng)
  ) {
    rawLocationTag = "미확인";
  } else {
    distanceM = haversineDistanceMeters(body.lat, body.lng, dormLat, dormLng);
    rawLocationTag = distanceM <= radius ? "실내" : "외부";
  }

  const rawAccuracyM =
    typeof body.accuracy_m === "number" && Number.isFinite(body.accuracy_m)
      ? body.accuracy_m
      : null;
  // 조작된(또는 비정상적으로 큰) accuracy_m이 resolveLocationTag의 GPS 오차
  // 관용 계산에서 실제 거리와 무관하게 "실내"로 찍히게 하는 걸 막기 위해
  // 판정에만 상한을 적용한다. 저장하는 accuracy_m은 원본 값 그대로 둔다.
  const accuracyMForTag = rawAccuracyM !== null ? Math.min(rawAccuracyM, MAX_ACCURACY_M) : null;
  const locationTag = resolveLocationTag(rawLocationTag, trusted, distanceM, accuracyMForTag);

  let indoorFields: { room: string | null; corridor: string | null } | null = null;
  if (locationTag === "실내") {
    const room = typeof body.room === "string" ? body.room.trim() : "";
    const corridor = typeof body.corridor === "string" ? body.corridor.trim() : "";
    if (room === "" && corridor === "") {
      return badRequest("room or corridor is required when indoors");
    }
    indoorFields = { room: room || null, corridor: corridor || null };
  }

  // IP를 알 수 없으면(CF 경유가 아닌 로컬/테스트 등) 쿨다운 없이 진행한다 --
  // 이 앱은 항상 Cloudflare 엣지를 거치므로 실서비스에서는 항상 값이 있다.
  // 검증을 모두 통과한 뒤, 실제 저장 직전에 원자적으로 쿨다운을 판정+갱신해서
  // (claimSubmissionSlot) 동시 요청이 쿨다운을 동시에 통과하는 TOCTOU를 막는다.
  let clientIpHash: string | null = null;
  if (clientIp) {
    clientIpHash = await hashIp(clientIp, env.IP_HASH_SALT);
    const cooldownThreshold = new Date(now.getTime() - SUBMIT_COOLDOWN_SECONDS * 1000).toISOString();
    let claimed: boolean;
    try {
      claimed = await claimSubmissionSlot(env.DB, clientIpHash, now.toISOString(), cooldownThreshold);
    } catch (err) {
      console.error("claimSubmissionSlot failed", err);
      return jsonError(500, "database write failed");
    }
    if (!claimed) {
      return tooManyRequests("submitted too recently, please wait before retrying");
    }
  }

  const measurement: MeasurementInput = {
    created_at: now.toISOString(),
    lat: body.lat ?? null,
    lng: body.lng ?? null,
    accuracy_m: body.accuracy_m ?? null,
    raw_location_tag: rawLocationTag,
    is_curfew_window: trusted ? 1 : 0,
    location_tag: locationTag,
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
    manual_override: body.manual_override === true ? 1 : 0,
    client_ip_hash: clientIpHash,
  };

  try {
    await insertMeasurement(env.DB, measurement);
  } catch (err) {
    console.error("insertMeasurement failed", err);
    if (clientIpHash) {
      // 아무것도 저장되지 않았으니 방금 소모한 쿨다운 슬롯을 되돌려서 바로 재시도할 수 있게 한다.
      await releaseSubmissionSlot(env.DB, clientIpHash).catch((releaseErr) => {
        console.error("releaseSubmissionSlot failed", releaseErr);
      });
    }
    return jsonError(500, "database write failed");
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" },
  });
}
