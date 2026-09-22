import type { Env } from "../env";
import { exportAllMeasurements } from "../lib/db";

// measurements 테이블의 현재 컬럼 목록. 스키마를 바꾸는 마이그레이션을 추가할 때마다
// (컬럼 추가/삭제) 같이 갱신할 것 -- 안 하면 CSV export에서 누락되거나 어긋난다.
const HEADERS = [
  "id",
  "created_at",
  "lat",
  "lng",
  "accuracy_m",
  "raw_location_tag",
  "is_curfew_window",
  "location_tag",
  "room",
  "corridor",
  "note",
  "carrier",
  "network_org",
  "os",
  "download_mbps",
  "upload_mbps",
  "ping_ms",
  "jitter_ms",
  "packet_loss_pct",
  "raw_samples",
  "manual_override",
  "client_ip_hash",
];

function toCsv(rows: Record<string, unknown>[]): string {
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [HEADERS.join(",")];
  for (const row of rows) {
    lines.push(HEADERS.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n");
}

export async function handleExport(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!key || key !== env.EXPORT_SECRET) {
    return new Response("Forbidden", { status: 403 });
  }

  const rows = await exportAllMeasurements(env.DB);
  const csv = toCsv(rows);
  return new Response(csv, {
    headers: { "content-type": "text/csv; charset=utf-8" },
  });
}
