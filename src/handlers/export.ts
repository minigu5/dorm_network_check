import type { Env } from "../env";
import { exportAllMeasurements } from "../lib/db";

// Column names from measurements table schema (matching migrations 0001-0003)
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
