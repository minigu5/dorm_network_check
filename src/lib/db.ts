export interface MeasurementInput {
  created_at: string;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  raw_location_tag: string;
  is_curfew_window: number;
  location_tag: string;
  room: string | null;
  corridor: string | null;
  note: string | null;
  carrier: string;
  network_org: string | null;
  os: string | null;
  download_mbps: number;
  upload_mbps: number;
  ping_ms: number;
  jitter_ms: number;
  packet_loss_pct: number;
  raw_samples: string | null;
  manual_override: number;
  client_ip_hash: string | null;
}

export async function insertMeasurement(
  db: D1Database,
  m: MeasurementInput
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO measurements (
        created_at, lat, lng, accuracy_m, raw_location_tag, is_curfew_window,
        location_tag, room, corridor, note, carrier, network_org, os,
        download_mbps, upload_mbps, ping_ms, jitter_ms, packet_loss_pct, raw_samples,
        manual_override, client_ip_hash
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .bind(
      m.created_at, m.lat, m.lng, m.accuracy_m, m.raw_location_tag, m.is_curfew_window,
      m.location_tag, m.room, m.corridor, m.note, m.carrier,
      m.network_org, m.os, m.download_mbps, m.upload_mbps, m.ping_ms, m.jitter_ms,
      m.packet_loss_pct, m.raw_samples, m.manual_override, m.client_ip_hash
    )
    .run();
}

// 같은 출처(IP 해시)의 제출 쿨다운을 원자적으로 판정+갱신한다. INSERT ...
// ON CONFLICT ... WHERE 한 문장으로 "마지막 제출이 쿨다운보다 오래됐을 때만
// 갱신"을 처리하므로, 별도 SELECT 후 INSERT로 나누는 것과 달리 동시 요청이
// 둘 다 "쿨다운 안 지남"을 못 보고 통과하는 TOCTOU 레이스가 없다.
// changes > 0이면 슬롯을 획득(제출 허용)한 것이고, 0이면 쿨다운 중.
export async function claimSubmissionSlot(
  db: D1Database,
  clientIpHash: string,
  nowIso: string,
  cooldownThresholdIso: string
): Promise<boolean> {
  const result = await db
    .prepare(
      `INSERT INTO ip_cooldowns (client_ip_hash, last_submitted_at)
       VALUES (?, ?)
       ON CONFLICT(client_ip_hash) DO UPDATE SET last_submitted_at = excluded.last_submitted_at
       WHERE ip_cooldowns.last_submitted_at <= ?`
    )
    .bind(clientIpHash, nowIso, cooldownThresholdIso)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

// insertMeasurement가 실패해 아무것도 저장되지 않았을 때, claimSubmissionSlot이
// 이미 소모한 쿨다운 슬롯을 되돌려서 사용자가 바로 재시도할 수 있게 한다. 슬롯은
// IP당 하나(PK)이고 쿨다운 안에서는 동시에 두 요청이 슬롯을 가질 수 없으므로,
// 이 삭제가 다른 요청이 정당하게 획득한 슬롯을 지울 위험은 없다.
export async function releaseSubmissionSlot(
  db: D1Database,
  clientIpHash: string
): Promise<void> {
  await db
    .prepare("DELETE FROM ip_cooldowns WHERE client_ip_hash = ?")
    .bind(clientIpHash)
    .run();
}

export async function exportAllMeasurements(
  db: D1Database
): Promise<Record<string, unknown>[]> {
  const { results } = await db
    .prepare("SELECT * FROM measurements ORDER BY created_at ASC")
    .all();
  return results as Record<string, unknown>[];
}
