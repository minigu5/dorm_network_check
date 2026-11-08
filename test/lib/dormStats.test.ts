import { describe, it, expect } from "vitest";
import { computeDormStats, type StatsRow } from "../../src/lib/dormStats";

function row(p: Partial<StatsRow>): StatsRow {
  return {
    created_at: "2026-11-08T10:00:00.000Z",
    location_tag: "실내",
    carrier: "SKT",
    room: null,
    corridor: null,
    download_mbps: 100,
    upload_mbps: 50,
    ping_ms: 20,
    ...p,
  };
}

// SKT 밖 기준: 다운 100, 업 50, 핑 20 (5건 → 기준 충족)
const sktOutdoor = Array.from({ length: 5 }, () => row({ location_tag: "외부" }));

describe("computeDormStats", () => {
  it("밖 측정 5건 이상인 통신사만 기준 충족, 실내 측정을 3단계로 센다", () => {
    const stats = computeDormStats([
      ...sktOutdoor,
      row({ room: "301호", download_mbps: 90 }), // 90% → good
      row({ room: "302호", download_mbps: 50 }), // 50% → slow
      row({ room: "303호", download_mbps: 10 }), // 10% → bad
      row({ carrier: "KT", location_tag: "외부" }),
      row({ carrier: "KT", room: "304호" }),
    ]);
    const skt = stats.carriers.find((c) => c.carrier === "SKT")!;
    expect(skt).toMatchObject({ baselineReady: true, indoorCount: 3, outdoorCount: 5, tiers: { good: 1, slow: 1, bad: 1 } });
    const kt = stats.carriers.find((c) => c.carrier === "KT")!;
    expect(kt).toMatchObject({ baselineReady: false, indoorCount: 1, outdoorCount: 1, tiers: null });
  });

  it("다운·업·핑 중 가장 나쁜 비율로 단계를 정하고 그 항목을 알려 준다", () => {
    const stats = computeDormStats([
      ...sktOutdoor,
      row({ room: "301호", upload_mbps: 5 }), // 업 10%
      row({ room: "302호", ping_ms: 40 }), // 핑 20/40 = 50%
    ]);
    expect(stats.rooms["301"]).toEqual({ count: 1, tier: "bad", worstMetric: "upload" });
    expect(stats.rooms["302"]).toEqual({ count: 1, tier: "slow", worstMetric: "ping" });
  });

  it("핑이 0(전부 실패)이면 가장 나쁜 단계", () => {
    const stats = computeDormStats([...sktOutdoor, row({ room: "301호", ping_ms: 0 })]);
    expect(stats.rooms["301"]).toMatchObject({ tier: "bad", worstMetric: "ping" });
  });

  it("기준 부족 통신사의 방은 측정함으로만(tier null) 표시", () => {
    const stats = computeDormStats([row({ carrier: "KT", room: "101호" })]);
    expect(stats.rooms["101"]).toEqual({ count: 1, tier: null, worstMetric: null });
  });

  it("한 방에 여러 측정이면 단계는 중간값(짝수면 더 나쁜 쪽)", () => {
    const stats = computeDormStats([
      ...sktOutdoor,
      row({ room: "301호", download_mbps: 90 }),
      row({ room: "301호", download_mbps: 50 }),
      row({ room: "301호", download_mbps: 10 }),
      row({ room: "302호", download_mbps: 90 }),
      row({ room: "302호", download_mbps: 50 }),
    ]);
    expect(stats.rooms["301"]).toMatchObject({ count: 3, tier: "slow" });
    expect(stats.rooms["302"]).toMatchObject({ count: 2, tier: "slow" });
  });

  it("기준 있는 측정과 없는 측정이 섞이면 있는 쪽으로 단계를 정한다", () => {
    const stats = computeDormStats([
      ...sktOutdoor,
      row({ room: "301호", download_mbps: 10 }),
      row({ carrier: "KT", room: "301호" }),
    ]);
    expect(stats.rooms["301"]).toEqual({ count: 2, tier: "bad", worstMetric: "download" });
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
