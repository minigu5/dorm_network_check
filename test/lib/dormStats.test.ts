import { describe, it, expect } from "vitest";
import { computeDormStats, type StatsRow } from "../../src/lib/dormStats";

function row(p: Partial<StatsRow>): StatsRow {
  return {
    created_at: "2026-11-08T10:00:00.000Z",
    location_tag: "실내",
    carrier: "SKT",
    device_id: "dev-a",
    room: null,
    corridor: null,
    download_mbps: 100,
    upload_mbps: 50,
    ping_ms: 20,
    ...p,
  };
}

// 기기 A의 밖 기준: 다운 100, 업 50, 핑 20
const outA = row({ location_tag: "외부" });

describe("computeDormStats", () => {
  it("실내 측정을 같은 기기의 밖 측정과 비교해 3단계로 나눈다", () => {
    const stats = computeDormStats([
      outA,
      row({ room: "301호", download_mbps: 90 }), // 90% → good
      row({ room: "302호", download_mbps: 50 }), // 50% → slow
      row({ room: "303호", download_mbps: 10 }), // 10% → bad
    ]);
    expect(stats.rooms["301"].tier).toBe("good");
    expect(stats.rooms["302"].tier).toBe("slow");
    expect(stats.rooms["303"].tier).toBe("bad");
  });

  it("다른 기기의 밖 측정은 기준으로 쓰지 않는다(요금제·기기 차이)", () => {
    const stats = computeDormStats([
      row({ device_id: "dev-b", location_tag: "외부", download_mbps: 500 }),
      row({ room: "301호", download_mbps: 10 }),
    ]);
    expect(stats.rooms["301"]).toEqual({ count: 1, tier: null, worstMetric: null });
  });

  it("기기 ID가 없는 측정(구버전)은 비교하지 않는다", () => {
    const stats = computeDormStats([
      row({ device_id: null, location_tag: "외부" }),
      row({ device_id: null, room: "301호", download_mbps: 10 }),
    ]);
    expect(stats.rooms["301"].tier).toBeNull();
  });

  it("기기마다 자기 밖 속도가 기준이다(요금제 상한이 낮아도 밖과 같으면 그대로)", () => {
    const stats = computeDormStats([
      outA,
      row({ device_id: "dev-slow-plan", location_tag: "외부", download_mbps: 5, upload_mbps: 2 }),
      row({ device_id: "dev-slow-plan", room: "301호", download_mbps: 5, upload_mbps: 2 }),
    ]);
    expect(stats.rooms["301"].tier).toBe("good");
  });

  it("같은 기기의 밖 측정이 여러 건이면 중간값이 기준", () => {
    const stats = computeDormStats([
      row({ location_tag: "외부", download_mbps: 10 }),
      row({ location_tag: "외부", download_mbps: 100 }),
      row({ location_tag: "외부", download_mbps: 1000 }),
      row({ room: "301호", download_mbps: 50 }), // 50/100 → slow
    ]);
    expect(stats.rooms["301"].tier).toBe("slow");
  });

  it("다운·업·핑 중 가장 나쁜 비율로 단계를 정하고 그 항목을 알려 준다", () => {
    const stats = computeDormStats([
      outA,
      row({ room: "301호", upload_mbps: 5 }), // 업 10%
      row({ room: "302호", ping_ms: 40 }), // 핑 20/40 = 50%
    ]);
    expect(stats.rooms["301"]).toEqual({ count: 1, tier: "bad", worstMetric: "upload" });
    expect(stats.rooms["302"]).toEqual({ count: 1, tier: "slow", worstMetric: "ping" });
  });

  it("핑이 0(전부 실패)이면 가장 나쁜 단계", () => {
    const stats = computeDormStats([outA, row({ room: "301호", ping_ms: 0 })]);
    expect(stats.rooms["301"]).toMatchObject({ tier: "bad", worstMetric: "ping" });
  });

  it("한 방에 여러 측정이면 단계는 중간값(짝수면 더 나쁜 쪽)", () => {
    const stats = computeDormStats([
      outA,
      row({ room: "301호", download_mbps: 90 }),
      row({ room: "301호", download_mbps: 50 }),
      row({ room: "301호", download_mbps: 10 }),
      row({ room: "302호", download_mbps: 90 }),
      row({ room: "302호", download_mbps: 50 }),
    ]);
    expect(stats.rooms["301"]).toMatchObject({ count: 3, tier: "slow" });
    expect(stats.rooms["302"]).toMatchObject({ count: 2, tier: "slow" });
  });

  it("비교 가능한 측정과 아닌 측정이 섞이면 가능한 쪽으로 단계를 정한다", () => {
    const stats = computeDormStats([
      outA,
      row({ room: "301호", download_mbps: 10 }),
      row({ device_id: "dev-b", room: "301호" }),
    ]);
    expect(stats.rooms["301"]).toEqual({ count: 2, tier: "bad", worstMetric: "download" });
  });

  it("통신사별로 실내·밖·비교 가능 건수와 단계 개수를 센다", () => {
    const stats = computeDormStats([
      outA,
      row({ room: "301호", download_mbps: 90 }),
      row({ room: "302호", download_mbps: 10 }),
      row({ device_id: "dev-b", room: "303호" }), // 비교 불가
      row({ carrier: "KT", device_id: "dev-k", room: "304호" }),
    ]);
    const skt = stats.carriers.find((c) => c.carrier === "SKT")!;
    expect(skt).toEqual({
      carrier: "SKT", indoorCount: 3, outdoorCount: 1, comparableCount: 2,
      tiers: { good: 1, slow: 0, bad: 1 },
    });
    const kt = stats.carriers.find((c) => c.carrier === "KT")!;
    expect(kt).toMatchObject({ indoorCount: 1, outdoorCount: 0, comparableCount: 0 });
  });

  it("층별·전체 측정 방 수와 복도 측정 수를 센다", () => {
    const stats = computeDormStats([
      row({ room: "301호" }),
      row({ room: "302" }),
      row({ room: "101호" }),
      row({ room: "999호" }), // 목록 밖 → 방 칸엔 안 들어감
      row({ corridor: "3층" }),
      row({ corridor: "3층" }),
    ]);
    expect(stats.roomsMeasured).toBe(3);
    expect(stats.roomsTotal).toBe(97);
    const f3 = stats.floors.find((f) => f.floor === 3)!;
    expect(f3).toMatchObject({ roomsMeasured: 2, roomsTotal: 25, corridorCount: 2 });
    expect(stats.totalMeasurements).toBe(6);
  });

  it("층은 5층부터 1층 순서로 내려 준다", () => {
    expect(computeDormStats([]).floors.map((f) => f.floor)).toEqual([5, 4, 3, 2, 1]);
  });

  it("마지막 측정 시각, 빈 데이터면 null", () => {
    expect(computeDormStats([]).lastMeasuredAt).toBeNull();
    const stats = computeDormStats([
      row({ created_at: "2026-11-08T09:00:00.000Z" }),
      row({ created_at: "2026-11-08T11:00:00.000Z" }),
    ]);
    expect(stats.lastMeasuredAt).toBe("2026-11-08T11:00:00.000Z");
  });
});
