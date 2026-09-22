import type { Env } from "../env";
import { exportAllMeasurements } from "../lib/db";

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
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
