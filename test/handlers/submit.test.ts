import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { handleSubmit } from "../../src/handlers/submit";
import { exportAllMeasurements } from "../../src/lib/db";

function makeRequest(body: Record<string, unknown>, cf: Record<string, unknown>, ua = "TestAgent") {
  return new Request("https://dorm.omm.run/api/submit", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": ua },
    body: JSON.stringify(body),
    cf,
  } as RequestInit);
}

const baseBody = {
  lat: 37.5, lng: 127.0, accuracy_m: 15,
  carrier: "SKT",
  dong: "3동", floor: "5", room: "512", corridor: "A",
  download_mbps: 50, upload_mbps: 10, ping_ms: 25, jitter_ms: 3, packet_loss_pct: 0,
  raw_samples: { ping: [20, 30] },
};

const testEnv = { ...env, DORM_LAT: "37.5", DORM_LNG: "127.0" };

describe("handleSubmit", () => {
  beforeEach(async () => {
    await env.DB.exec("DELETE FROM measurements");
  });

  it("모바일망 + 입소 시간대 + 반경 안 -> 실내로 저장", async () => {
    const req = makeRequest(baseBody, { asOrganization: "SK Telecom" });
    // 2026-09-22T23:30:00+09:00 = 2026-09-22T14:30:00Z (입소 시간대)
    const fixedNow = new Date("2026-09-22T14:30:00.000Z");
    const res = await handleSubmit(req, testEnv, fixedNow);
    expect(res.status).toBe(200);
    const rows = await exportAllMeasurements(env.DB);
    expect(rows).toHaveLength(1);
    expect(rows[0].location_tag).toBe("실내");
    expect(rows[0].dong).toBe("3동");
  });

  it("WiFi/기타망이면 400으로 거부하고 저장하지 않는다", async () => {
    const req = makeRequest(baseBody, { asOrganization: "Some University" });
    const res = await handleSubmit(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    expect(res.status).toBe(400);
    const rows = await exportAllMeasurements(env.DB);
    expect(rows).toHaveLength(0);
  });

  it("입소 시간대 밖이면 GPS가 실내여도 외부로 강제 저장한다", async () => {
    const req = makeRequest(
      { ...baseBody, dong: undefined, floor: undefined, room: undefined, corridor: undefined, note: "복도 앞" },
      { asOrganization: "SK Telecom" }
    );
    // 2026-09-22T14:00:00+09:00 = 05:00Z, 입소 시간대 아님
    const res = await handleSubmit(req, testEnv, new Date("2026-09-22T05:00:00.000Z"));
    expect(res.status).toBe(200);
    const rows = await exportAllMeasurements(env.DB);
    expect(rows[0].location_tag).toBe("외부");
    expect(rows[0].note).toBe("복도 앞");
  });

  it("실내로 판정됐는데 dong/floor/room/corridor가 없으면 400", async () => {
    const req = makeRequest(
      { ...baseBody, dong: undefined, floor: undefined, room: undefined, corridor: undefined },
      { asOrganization: "SK Telecom" }
    );
    const res = await handleSubmit(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    expect(res.status).toBe(400);
  });

  it("위치 좌표가 없으면 미확인으로 저장된다", async () => {
    const req = makeRequest(
      { ...baseBody, lat: null, lng: null, accuracy_m: null, dong: undefined, floor: undefined, room: undefined, corridor: undefined, note: "위치 권한 거부" },
      { asOrganization: "SK Telecom" }
    );
    const res = await handleSubmit(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    expect(res.status).toBe(200);
    const rows = await exportAllMeasurements(env.DB);
    expect(rows[0].location_tag).toBe("미확인");
  });

  it("좌표가 숫자가 아니면(예: 문자열) 미확인으로 저장된다", async () => {
    const req = makeRequest(
      { ...baseBody, lat: "abc", lng: 127.0, dong: undefined, floor: undefined, room: undefined, corridor: undefined, note: "잘못된 좌표" },
      { asOrganization: "SK Telecom" }
    );
    const res = await handleSubmit(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    expect(res.status).toBe(200);
    const rows = await exportAllMeasurements(env.DB);
    expect(rows[0].location_tag).toBe("미확인");
  });

  it("숫자 측정값 필드가 누락되거나 숫자가 아니면 400으로 거부하고 저장하지 않는다", async () => {
    const req = makeRequest(
      { ...baseBody, download_mbps: "fast" },
      { asOrganization: "SK Telecom" }
    );
    const res = await handleSubmit(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    expect(res.status).toBe(400);
    const rows = await exportAllMeasurements(env.DB);
    expect(rows).toHaveLength(0);
  });
});
