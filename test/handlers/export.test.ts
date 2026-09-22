import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { handleExport } from "../../src/handlers/export";
import { insertMeasurement } from "../../src/lib/db";

const testEnv = { ...env, EXPORT_SECRET: "test-secret" };

describe("handleExport", () => {
  beforeEach(async () => {
    await env.DB.exec("DELETE FROM measurements");
    await insertMeasurement(env.DB, {
      created_at: "2026-09-22T14:30:00.000Z",
      lat: 37.5, lng: 127.0, accuracy_m: 10,
      raw_location_tag: "실내", is_curfew_window: 1, location_tag: "실내",
      dong: "3동", floor: "5", room: "512", corridor: "A", note: null,
      carrier: "SKT", network_org: "SK Telecom", os: "Android",
      download_mbps: 50, upload_mbps: 10, ping_ms: 25, jitter_ms: 3, packet_loss_pct: 0,
      raw_samples: "{}",
      manual_override: 0,
    });
  });

  it("key가 틀리면 403", async () => {
    const req = new Request("https://dorm.omm.run/api/export?key=wrong");
    const res = await handleExport(req, testEnv);
    expect(res.status).toBe(403);
  });

  it("key가 맞으면 CSV를 반환한다", async () => {
    const req = new Request("https://dorm.omm.run/api/export?key=test-secret");
    const res = await handleExport(req, testEnv);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const text = await res.text();
    expect(text).toContain("carrier");
    expect(text).toContain("SKT");
    expect(text).toContain("manual_override");
  });

  it("빈 테이블일 때도 헤더 행을 반환한다", async () => {
    await env.DB.exec("DELETE FROM measurements");
    const req = new Request("https://dorm.omm.run/api/export?key=test-secret");
    const res = await handleExport(req, testEnv);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const text = await res.text();
    expect(text).not.toBe("");
    expect(text).toContain("id,created_at");
  });
});
