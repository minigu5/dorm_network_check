import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { insertMeasurement, exportAllMeasurements, type MeasurementInput } from "../../src/lib/db";

function sampleInput(overrides: Partial<MeasurementInput> = {}): MeasurementInput {
  return {
    created_at: "2026-09-22T14:30:00.000Z",
    lat: 37.5, lng: 127.0, accuracy_m: 15,
    raw_location_tag: "실내",
    is_curfew_window: 1,
    location_tag: "실내",
    dong: "3동", floor: "5", room: "512", corridor: "A",
    note: null,
    carrier: "SKT",
    network_org: "SK Telecom",
    os: "Android",
    download_mbps: 55.2, upload_mbps: 12.1,
    ping_ms: 28.5, jitter_ms: 4.2, packet_loss_pct: 0,
    raw_samples: JSON.stringify({ ping: [20, 30] }),
    manual_override: 0,
    ...overrides,
  };
}

describe("insertMeasurement / exportAllMeasurements", () => {
  beforeEach(async () => {
    await env.DB.exec("DELETE FROM measurements");
  });

  it("행을 저장하고 다시 읽을 수 있다", async () => {
    await insertMeasurement(env.DB, sampleInput());
    const rows = await exportAllMeasurements(env.DB);
    expect(rows).toHaveLength(1);
    expect(rows[0].carrier).toBe("SKT");
    expect(rows[0].location_tag).toBe("실내");
  });

  it("외부 판정 행은 dong/floor/room/corridor가 null일 수 있다", async () => {
    await insertMeasurement(
      env.DB,
      sampleInput({
        location_tag: "외부", raw_location_tag: "외부",
        dong: null, floor: null, room: null, corridor: null,
        note: "정문 앞",
      })
    );
    const rows = await exportAllMeasurements(env.DB);
    expect(rows[0].note).toBe("정문 앞");
    expect(rows[0].dong).toBeNull();
  });

  it("manual_override 플래그가 저장된다", async () => {
    await insertMeasurement(env.DB, sampleInput({ manual_override: 1 }));
    const rows = await exportAllMeasurements(env.DB);
    expect(rows[0].manual_override).toBe(1);
  });
});
