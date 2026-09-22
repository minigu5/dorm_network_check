import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { handleSubmit } from "../../src/handlers/submit";
import { exportAllMeasurements } from "../../src/lib/db";

function makeRequest(
  body: Record<string, unknown>,
  cf: Record<string, unknown>,
  ua = "TestAgent",
  extraHeaders: Record<string, string> = {}
) {
  return new Request("https://dorm.omm.run/api/submit", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": ua, ...extraHeaders },
    body: JSON.stringify(body),
    cf,
  } as RequestInit);
}

const baseBody = {
  lat: 37.5, lng: 127.0, accuracy_m: 15,
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
    expect(rows[0].carrier).toBe("SKT");
  });

  it("WiFi/기타망이면 400으로 거부하고 저장하지 않는다", async () => {
    const req = makeRequest(baseBody, { asOrganization: "Some University" });
    const res = await handleSubmit(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    expect(res.status).toBe(400);
    const rows = await exportAllMeasurements(env.DB);
    expect(rows).toHaveLength(0);
  });

  it("조직명은 모바일망이어도 차단된 WiFi IP면 400으로 거부하고 저장하지 않는다", async () => {
    const req = makeRequest(baseBody, { asOrganization: "KT Corporation" }, "TestAgent", {
      "CF-Connecting-IP": "221.168.22.149",
    });
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

  it("accuracy_m이 숫자가 아니면 400으로 거부하고 저장하지 않는다", async () => {
    const req = makeRequest(
      { ...baseBody, accuracy_m: "very accurate" },
      { asOrganization: "SK Telecom" }
    );
    const res = await handleSubmit(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    expect(res.status).toBe(400);
    const rows = await exportAllMeasurements(env.DB);
    expect(rows).toHaveLength(0);
  });

  it("실내 판정에서 dong이 문자열이 아니면(예: 숫자) 400으로 거부하고 저장하지 않는다", async () => {
    const req = makeRequest(
      { ...baseBody, dong: 5 },
      { asOrganization: "SK Telecom" }
    );
    const res = await handleSubmit(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    expect(res.status).toBe(400);
    const rows = await exportAllMeasurements(env.DB);
    expect(rows).toHaveLength(0);
  });

  it("실내 판정에서 dong이 공백 문자열뿐이면 400으로 거부하고 저장하지 않는다", async () => {
    const req = makeRequest(
      { ...baseBody, dong: " " },
      { asOrganization: "SK Telecom" }
    );
    const res = await handleSubmit(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    expect(res.status).toBe(400);
    const rows = await exportAllMeasurements(env.DB);
    expect(rows).toHaveLength(0);
  });

  it("입소 시간대엔 GPS 오차 감안 범위(200m) 안이면 반경(40m) 밖이어도 실내로 저장된다", async () => {
    // 실제 거리 약 150m(0.001347deg), accuracy_m 없음(0으로 간주) -> 실내
    const req = makeRequest(
      { ...baseBody, lat: 37.501347, accuracy_m: null },
      { asOrganization: "SK Telecom" }
    );
    const res = await handleSubmit(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    expect(res.status).toBe(200);
    const rows = await exportAllMeasurements(env.DB);
    expect(rows[0].location_tag).toBe("실내");
  });

  it("실내 필드 앞뒤 공백은 trim되어 저장된다", async () => {
    const req = makeRequest(
      { ...baseBody, dong: "  3동  ", floor: " 5 ", room: " 512 ", corridor: " A " },
      { asOrganization: "SK Telecom" }
    );
    const res = await handleSubmit(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    expect(res.status).toBe(200);
    const rows = await exportAllMeasurements(env.DB);
    expect(rows[0].dong).toBe("3동");
    expect(rows[0].floor).toBe("5");
    expect(rows[0].room).toBe("512");
    expect(rows[0].corridor).toBe("A");
  });

  it("note가 문자열이 아니면 400으로 거부하고 저장하지 않는다", async () => {
    const req = makeRequest(
      {
        ...baseBody,
        dong: undefined, floor: undefined, room: undefined, corridor: undefined,
        note: { text: "복도 앞" },
      },
      { asOrganization: "SK Telecom" }
    );
    const res = await handleSubmit(req, testEnv, new Date("2026-09-22T05:00:00.000Z"));
    expect(res.status).toBe(400);
    const rows = await exportAllMeasurements(env.DB);
    expect(rows).toHaveLength(0);
  });
});
