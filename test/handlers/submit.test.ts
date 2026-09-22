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
  room: "512", corridor: "A",
  download_mbps: 50, upload_mbps: 10, ping_ms: 25, jitter_ms: 3, packet_loss_pct: 0,
  raw_samples: { ping: [20, 30] },
};

const testEnv = { ...env, DORM_LAT: "37.5", DORM_LNG: "127.0", IP_HASH_SALT: "test-salt" };

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
    expect(rows[0].room).toBe("512");
    expect(rows[0].carrier).toBe("SKT");
    expect(rows[0].manual_override).toBe(0);
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
      { ...baseBody, room: undefined, corridor: undefined, note: "복도 앞" },
      { asOrganization: "SK Telecom" }
    );
    // 2026-09-22T14:00:00+09:00 = 05:00Z, 입소 시간대 아님
    const res = await handleSubmit(req, testEnv, new Date("2026-09-22T05:00:00.000Z"));
    expect(res.status).toBe(200);
    const rows = await exportAllMeasurements(env.DB);
    expect(rows[0].location_tag).toBe("외부");
    expect(rows[0].note).toBe("복도 앞");
  });

  it("실내로 판정됐는데 room/corridor가 없으면 400", async () => {
    const req = makeRequest(
      { ...baseBody, room: undefined, corridor: undefined },
      { asOrganization: "SK Telecom" }
    );
    const res = await handleSubmit(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    expect(res.status).toBe(400);
  });

  it("실내로 판정되고 호실/복도만 있어도 200으로 저장된다", async () => {
    const req = makeRequest(baseBody, { asOrganization: "SK Telecom" });
    const res = await handleSubmit(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    expect(res.status).toBe(200);
    const rows = await exportAllMeasurements(env.DB);
    expect(rows[0].room).toBe("512");
    expect(rows[0].corridor).toBe("A");
  });

  it("위치 좌표가 없으면 미확인으로 저장된다", async () => {
    const req = makeRequest(
      { ...baseBody, lat: null, lng: null, accuracy_m: null, room: undefined, corridor: undefined, note: "위치 권한 거부" },
      { asOrganization: "SK Telecom" }
    );
    const res = await handleSubmit(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    expect(res.status).toBe(200);
    const rows = await exportAllMeasurements(env.DB);
    expect(rows[0].location_tag).toBe("미확인");
  });

  it("좌표가 숫자가 아니면(예: 문자열) 미확인으로 저장된다", async () => {
    const req = makeRequest(
      { ...baseBody, lat: "abc", lng: 127.0, room: undefined, corridor: undefined, note: "잘못된 좌표" },
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

  it("실내 판정에서 room이 유효하지 않고(예: 숫자) corridor도 없으면 400으로 거부하고 저장하지 않는다", async () => {
    const req = makeRequest(
      { ...baseBody, room: 512, corridor: undefined },
      { asOrganization: "SK Telecom" }
    );
    const res = await handleSubmit(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    expect(res.status).toBe(400);
    const rows = await exportAllMeasurements(env.DB);
    expect(rows).toHaveLength(0);
  });

  it("실내 판정에서 room이 공백 문자열뿐이고 corridor도 없으면 400으로 거부하고 저장하지 않는다", async () => {
    const req = makeRequest(
      { ...baseBody, room: " ", corridor: undefined },
      { asOrganization: "SK Telecom" }
    );
    const res = await handleSubmit(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    expect(res.status).toBe(400);
    const rows = await exportAllMeasurements(env.DB);
    expect(rows).toHaveLength(0);
  });

  it("실내 판정에서 room 없이 corridor(층)만 있어도 200으로 저장된다", async () => {
    const req = makeRequest(
      { ...baseBody, room: undefined, corridor: "3층" },
      { asOrganization: "SK Telecom" }
    );
    const res = await handleSubmit(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    expect(res.status).toBe(200);
    const rows = await exportAllMeasurements(env.DB);
    expect(rows[0].room).toBeNull();
    expect(rows[0].corridor).toBe("3층");
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
      { ...baseBody, room: " 512 ", corridor: " A " },
      { asOrganization: "SK Telecom" }
    );
    const res = await handleSubmit(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    expect(res.status).toBe(200);
    const rows = await exportAllMeasurements(env.DB);
    expect(rows[0].room).toBe("512");
    expect(rows[0].corridor).toBe("A");
  });

  it("note가 문자열이 아니면 400으로 거부하고 저장하지 않는다", async () => {
    const req = makeRequest(
      {
        ...baseBody,
        room: undefined, corridor: undefined,
        note: { text: "복도 앞" },
      },
      { asOrganization: "SK Telecom" }
    );
    const res = await handleSubmit(req, testEnv, new Date("2026-09-22T05:00:00.000Z"));
    expect(res.status).toBe(400);
    const rows = await exportAllMeasurements(env.DB);
    expect(rows).toHaveLength(0);
  });

  it("manual_override:true를 보내면 실내/외부 판정과 무관하게 DB에 1로 저장된다", async () => {
    const req = makeRequest(
      { ...baseBody, manual_override: true },
      { asOrganization: "SK Telecom" }
    );
    const res = await handleSubmit(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    expect(res.status).toBe(200);
    const rows = await exportAllMeasurements(env.DB);
    expect(rows[0].manual_override).toBe(1);
  });

  it("download_mbps가 상한(2000)을 넘으면 400으로 거부하고 저장하지 않는다", async () => {
    const req = makeRequest({ ...baseBody, download_mbps: 99999 }, { asOrganization: "SK Telecom" });
    const res = await handleSubmit(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    expect(res.status).toBe(400);
    const rows = await exportAllMeasurements(env.DB);
    expect(rows).toHaveLength(0);
  });

  it("download_mbps가 음수면 400으로 거부한다", async () => {
    const req = makeRequest({ ...baseBody, download_mbps: -1 }, { asOrganization: "SK Telecom" });
    const res = await handleSubmit(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    expect(res.status).toBe(400);
  });

  it("packet_loss_pct가 100을 넘으면 400으로 거부한다", async () => {
    const req = makeRequest({ ...baseBody, packet_loss_pct: 150 }, { asOrganization: "SK Telecom" });
    const res = await handleSubmit(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    expect(res.status).toBe(400);
  });

  it("accuracy_m이 상한(200m)을 넘어도 제출은 허용되고 원본 값 그대로 저장된다", async () => {
    // 실내/저신호 기기에서 실제로 나올 수 있는 값이라 제출 자체는 막지 않는다 --
    // 판정 계산에서만 상한으로 클램프한다(아래 조작 방지 테스트 참고).
    const req = makeRequest({ ...baseBody, accuracy_m: 500 }, { asOrganization: "SK Telecom" });
    const res = await handleSubmit(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    expect(res.status).toBe(200);
    const rows = await exportAllMeasurements(env.DB);
    expect(rows[0].accuracy_m).toBe(500);
  });

  it("accuracy_m이 음수면 400으로 거부한다", async () => {
    const req = makeRequest({ ...baseBody, accuracy_m: -5 }, { asOrganization: "SK Telecom" });
    const res = await handleSubmit(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    expect(res.status).toBe(400);
  });

  it("accuracy_m을 크게 보내 실제로 먼 위치를 '실내'로 조작할 수 없다(판정에는 상한 클램프 적용)", async () => {
    // accuracy_m에 상한을 안 씌우면 effectiveDistance = max(0, distanceM - accuracyM)를
    // 0으로 만들어 실제 거리와 무관하게 "실내"로 찍히게 할 수 있었다. 제출 자체는
    // 통과하되(200) 판정 계산에는 MAX_ACCURACY_M(200m)까지만 반영되므로 여전히 "외부".
    const req = makeRequest(
      { ...baseBody, lat: 37.7, lng: 127.0, accuracy_m: 999999, room: undefined, corridor: undefined, note: "조작 시도" },
      { asOrganization: "SK Telecom" }
    );
    const res = await handleSubmit(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    expect(res.status).toBe(200);
    const rows = await exportAllMeasurements(env.DB);
    expect(rows[0].location_tag).toBe("외부");
    expect(rows[0].accuracy_m).toBe(999999);
  });

  it("동일 출처 IP로 쿨다운(120초) 내 재제출하면 429이고 저장되지 않는다", async () => {
    const ip = "1.2.3.4";
    const t0 = new Date("2026-09-22T14:30:00.000Z");
    const res1 = await handleSubmit(
      makeRequest(baseBody, { asOrganization: "SK Telecom" }, "TestAgent", { "CF-Connecting-IP": ip }),
      testEnv,
      t0
    );
    expect(res1.status).toBe(200);

    const t1 = new Date(t0.getTime() + 60_000);
    const res2 = await handleSubmit(
      makeRequest(baseBody, { asOrganization: "SK Telecom" }, "TestAgent", { "CF-Connecting-IP": ip }),
      testEnv,
      t1
    );
    expect(res2.status).toBe(429);
    const rows = await exportAllMeasurements(env.DB);
    expect(rows).toHaveLength(1);
  });

  it("쿨다운(120초)이 지나면 같은 IP도 다시 제출할 수 있다", async () => {
    const ip = "1.2.3.4";
    const t0 = new Date("2026-09-22T14:30:00.000Z");
    await handleSubmit(
      makeRequest(baseBody, { asOrganization: "SK Telecom" }, "TestAgent", { "CF-Connecting-IP": ip }),
      testEnv,
      t0
    );
    const t1 = new Date(t0.getTime() + 121_000);
    const res2 = await handleSubmit(
      makeRequest(baseBody, { asOrganization: "SK Telecom" }, "TestAgent", { "CF-Connecting-IP": ip }),
      testEnv,
      t1
    );
    expect(res2.status).toBe(200);
    const rows = await exportAllMeasurements(env.DB);
    expect(rows).toHaveLength(2);
  });

  it("IP가 다르면 쿨다운이 서로 영향을 주지 않는다", async () => {
    const t0 = new Date("2026-09-22T14:30:00.000Z");
    await handleSubmit(
      makeRequest(baseBody, { asOrganization: "SK Telecom" }, "TestAgent", { "CF-Connecting-IP": "1.1.1.1" }),
      testEnv,
      t0
    );
    const res2 = await handleSubmit(
      makeRequest(baseBody, { asOrganization: "SK Telecom" }, "TestAgent", { "CF-Connecting-IP": "2.2.2.2" }),
      testEnv,
      t0
    );
    expect(res2.status).toBe(200);
    const rows = await exportAllMeasurements(env.DB);
    expect(rows).toHaveLength(2);
  });
});
