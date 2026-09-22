export interface MeasurementInput {
  created_at: string;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  raw_location_tag: string;
  is_curfew_window: number;
  location_tag: string;
  dong: string | null;
  floor: string | null;
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
}

export async function insertMeasurement(
  db: D1Database,
  m: MeasurementInput
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO measurements (
        created_at, lat, lng, accuracy_m, raw_location_tag, is_curfew_window,
        location_tag, dong, floor, room, corridor, note, carrier, network_org, os,
        download_mbps, upload_mbps, ping_ms, jitter_ms, packet_loss_pct, raw_samples
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .bind(
      m.created_at, m.lat, m.lng, m.accuracy_m, m.raw_location_tag, m.is_curfew_window,
      m.location_tag, m.dong, m.floor, m.room, m.corridor, m.note, m.carrier,
      m.network_org, m.os, m.download_mbps, m.upload_mbps, m.ping_ms, m.jitter_ms,
      m.packet_loss_pct, m.raw_samples
    )
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
