import type { CarrierName } from "../config";
import { DORM_FLOORS, RESIDENT_ROOMS, parseCorridorFloor, parseRoomNumber, type FloorLayout } from "./dormLayout";

// 통신사끼리 절대 속도(Mbps)를 나란히 비교하면 요금제 속도 제한·기기(LTE/5G) 차이가
// 그대로 섞여 오해를 산다. 그래서 "같은 통신사의 기숙사 밖 속도 대비 안에서 몇 %인가"로
// 바꾸고, 다운로드·업로드·핑 중 가장 나쁜 비율로 체감 단계를 정한다(실측상 업로드가
// 다운로드보다 훨씬 심하게 떨어져서, 평균을 내면 업로드 문제가 희석된다).
export const TIER_THRESHOLDS = { good: 0.7, slow: 0.3 } as const;
// 밖 측정이 이보다 적으면 기준값(중앙값)이 한두 건에 휘둘리므로 단계를 내지 않는다.
export const MIN_OUTDOOR_BASELINE = 5;

const CARRIERS: CarrierName[] = ["SKT", "KT", "LGU+"];

export type Tier = "good" | "slow" | "bad";
export type Metric = "download" | "upload" | "ping";

export interface StatsRow {
  created_at: string;
  location_tag: string;
  carrier: string;
  room: string | null;
  corridor: string | null;
  download_mbps: number;
  upload_mbps: number;
  ping_ms: number;
}

export interface RoomStat {
  count: number;
  tier: Tier | null; // null = 측정은 됐지만 그 통신사의 밖 기준이 부족
  worstMetric: Metric | null;
}

export interface DormStats {
  totalMeasurements: number;
  lastMeasuredAt: string | null;
  roomsMeasured: number;
  roomsTotal: number;
  thresholds: typeof TIER_THRESHOLDS;
  minOutdoorBaseline: number;
  floors: Array<FloorLayout & { roomsMeasured: number; roomsTotal: number; corridorCount: number }>;
  rooms: Record<string, RoomStat>;
  carriers: Array<{
    carrier: CarrierName;
    indoorCount: number;
    outdoorCount: number;
    baselineReady: boolean;
    tiers: Record<Tier, number> | null;
  }>;
}

interface Baseline {
  download: number;
  upload: number;
  ping: number;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// 1.0 = 밖과 같음. 속도는 안/밖, 핑은 낮을수록 좋으니 밖/안. 핑 0은 전부 실패(손실 100%)라 최악.
function worstRatio(r: StatsRow, b: Baseline): { ratio: number; metric: Metric } {
  const ratios: Array<[Metric, number]> = [
    ["download", b.download > 0 ? r.download_mbps / b.download : 1],
    ["upload", b.upload > 0 ? r.upload_mbps / b.upload : 1],
    ["ping", r.ping_ms > 0 ? b.ping / r.ping_ms : 0],
  ];
  const [metric, ratio] = ratios.reduce((a, c) => (c[1] < a[1] ? c : a));
  return { ratio, metric };
}

function tierOf(ratio: number): Tier {
  if (ratio >= TIER_THRESHOLDS.good) return "good";
  if (ratio >= TIER_THRESHOLDS.slow) return "slow";
  return "bad";
}

export function computeDormStats(rows: StatsRow[]): DormStats {
  const outdoor = rows.filter((r) => r.location_tag === "외부");
  const indoor = rows.filter((r) => r.location_tag === "실내");

  const baselines = new Map<string, Baseline>();
  for (const c of CARRIERS) {
    const o = outdoor.filter((r) => r.carrier === c);
    if (o.length >= MIN_OUTDOOR_BASELINE) {
      baselines.set(c, {
        download: median(o.map((r) => r.download_mbps)),
        upload: median(o.map((r) => r.upload_mbps)),
        ping: median(o.map((r) => r.ping_ms)),
      });
    }
  }

  const graded = indoor.map((r) => {
    const b = baselines.get(r.carrier);
    return { row: r, grade: b ? worstRatio(r, b) : null };
  });

  const byRoom = new Map<number, typeof graded>();
  const corridorByFloor = new Map<number, number>();
  for (const g of graded) {
    const room = parseRoomNumber(g.row.room);
    if (room !== null) {
      byRoom.set(room, [...(byRoom.get(room) ?? []), g]);
      continue;
    }
    const floor = parseCorridorFloor(g.row.corridor);
    if (floor !== null) corridorByFloor.set(floor, (corridorByFloor.get(floor) ?? 0) + 1);
  }

  const rooms: Record<string, RoomStat> = {};
  for (const [room, list] of byRoom) {
    // 짝수 건이면 아래쪽 중간(더 나쁜 쪽)을 골라 "괜찮다"를 과장하지 않는다.
    const grades = list.flatMap((g) => (g.grade ? [g.grade] : [])).sort((a, b) => a.ratio - b.ratio);
    const mid = grades[Math.floor((grades.length - 1) / 2)];
    rooms[String(room)] = {
      count: list.length,
      tier: mid ? tierOf(mid.ratio) : null,
      worstMetric: mid ? mid.metric : null,
    };
  }

  const roomFloor = (n: number) => Math.floor(n / 100);
  const floors = DORM_FLOORS.map((fl) => {
    const total = [...RESIDENT_ROOMS].filter((n) => roomFloor(n) === fl.floor);
    return {
      ...fl,
      roomsMeasured: total.filter((n) => byRoom.has(n)).length,
      roomsTotal: total.length,
      corridorCount: corridorByFloor.get(fl.floor) ?? 0,
    };
  });

  const carriers = CARRIERS.map((c) => {
    const mine = graded.filter((g) => g.row.carrier === c);
    const ready = baselines.has(c);
    const tiers = ready ? { good: 0, slow: 0, bad: 0 } : null;
    if (tiers) for (const g of mine) tiers[tierOf(g.grade!.ratio)]++;
    return {
      carrier: c,
      indoorCount: mine.length,
      outdoorCount: outdoor.filter((r) => r.carrier === c).length,
      baselineReady: ready,
      tiers,
    };
  });

  return {
    totalMeasurements: rows.length,
    lastMeasuredAt: rows.reduce<string | null>((a, r) => (a === null || r.created_at > a ? r.created_at : a), null),
    roomsMeasured: byRoom.size,
    roomsTotal: RESIDENT_ROOMS.size,
    thresholds: TIER_THRESHOLDS,
    minOutdoorBaseline: MIN_OUTDOOR_BASELINE,
    floors,
    rooms,
    carriers,
  };
}
