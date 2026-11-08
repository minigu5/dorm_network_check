import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { handleStats } from "../../src/handlers/stats";
import { insertMeasurement, type MeasurementInput } from "../../src/lib/db";

function m(p: Partial<MeasurementInput>): MeasurementInput {
  return {
    created_at: "2026-11-08T10:00:00.000Z",
    lat: 35.84, lng: 128.62, accuracy_m: 10,
    raw_location_tag: "실내", is_curfew_window: 1, location_tag: "실내",
    room: null, corridor: null, note: null,
    carrier: "SKT", network_org: "SK Telecom", os: "iOS",
    download_mbps: 12.345, upload_mbps: 6.789, ping_ms: 31.5, jitter_ms: 3, packet_loss_pct: 0,
    raw_samples: null, manual_override: 0, client_ip_hash: "hash-abc",
    ...p,
  };
}

describe("handleStats", () => {
  beforeEach(async () => {
    await env.DB.exec("DELETE FROM measurements");
    await insertMeasurement(env.DB, m({ room: "301호" }));
    await insertMeasurement(env.DB, m({ corridor: "2층" }));
  });

  it("집계 결과를 JSON으로 돌려준다", async () => {
    const res = await handleStats(env);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as { roomsMeasured: number; rooms: Record<string, unknown> };
    expect(body.roomsMeasured).toBe(1);
    expect(body.rooms["301"]).toEqual({ count: 1, tier: null, worstMetric: null });
  });

  it("원본 속도 값이나 IP 해시는 응답에 없다", async () => {
    const text = await (await handleStats(env)).text();
    for (const leaked of ["12.345", "6.789", "31.5", "hash-abc", "SK Telecom"]) {
      expect(text).not.toContain(leaked);
    }
  });
});
