import type { CarrierName } from "../config";
import { DORM_FLOORS, RESIDENT_ROOMS, parseCorridorFloor, parseRoomNumber, type FloorLayout } from "./dormLayout";

// 통신사끼리 절대 속도(Mbps)를 나란히 비교하면 요금제 속도 제한·기기(LTE/5G) 차이가
// 그대로 섞여 오해를 산다. 같은 통신사 안에서도 요금제는 사람(기기)마다 달라서, 기준은
// "같은 기기가 기숙사 밖에서 잰 속도"로만 잡는다(통신사 평균으로 대신 채우지 않음). 그 기기의
// 밖 측정이 없으면 비교하지 않고 "측정함"으로만 남긴다. 단계는 다운로드·업로드·핑 중 가장
// 나쁜 비율로 정한다(실측상 업로드가 다운로드보다 훨씬 심하게 떨어져서, 평균을 내면 업로드
// 문제가 희석된다).
export const TIER_THRESHOLDS = { good: 0.7, slow: 0.3 } as const;

const CARRIERS: CarrierName[] = ["SKT", "KT", "LGU+"];

export type Tier = "good" | "slow" | "bad";
export type Metric = "download" | "upload" | "ping";

export interface StatsRow {
  created_at: string;
  location_tag: string;
  carrier: string;
  device_id: string | null;
  room: string | null;
  corridor: string | null;
  download_mbps: number;
  upload_mbps: number;
  ping_ms: number;
}

export interface RoomStat {
  count: number;
  tier: Tier | null; // null = 측정은 됐지만 같은 기기의 밖 측정이 없음
  worstMetric: Metric | null;
}

export interface DormStats {
  totalMeasurements: number;
  lastMeasuredAt: string | null;
  roomsMeasured: number;
  roomsTotal: number;
  thresholds: typeof TIER_THRESHOLDS;
  floors: Array<FloorLayout & { roomsMeasured: number; roomsTotal: number; corridorCount: number }>;
  rooms: Record<string, RoomStat>;
  carriers: Array<{
    carrier: CarrierName;
    indoorCount: number;
    outdoorCount: number;
    comparableCount: number; // 같은 기기의 밖 측정이 있어 단계를 매긴 실내 측정 수
    tiers: Record<Tier, number>;
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

  // 기기가 유심을 바꿨을 수도 있으니 기기 ID + 통신사로 묶는다.
  const deviceKey = (r: StatsRow) => (r.device_id ? `${r.device_id}|${r.carrier}` : null);
  const outdoorByDevice = new Map<string, StatsRow[]>();
  for (const r of outdoor) {
    const key = deviceKey(r);
    if (key) outdoorByDevice.set(key, [...(outdoorByDevice.get(key) ?? []), r]);
  }
  const baselines = new Map<string, Baseline>();
  for (const [key, o] of outdoorByDevice) {
    baselines.set(key, {
      download: median(o.map((r) => r.download_mbps)),
      upload: median(o.map((r) => r.upload_mbps)),
      ping: median(o.map((r) => r.ping_ms)),
    });
  }

  const graded = indoor.map((r) => {
    const key = deviceKey(r);
    const b = key ? baselines.get(key) : undefined;
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
    const tiers = { good: 0, slow: 0, bad: 0 };
    let comparable = 0;
    for (const g of mine) {
      if (!g.grade) continue;
      tiers[tierOf(g.grade.ratio)]++;
      comparable++;
    }
    return {
      carrier: c,
      indoorCount: mine.length,
      outdoorCount: outdoor.filter((r) => r.carrier === c).length,
      comparableCount: comparable,
      tiers,
    };
  });

  return {
    totalMeasurements: rows.length,
    lastMeasuredAt: rows.reduce<string | null>((a, r) => (a === null || r.created_at > a ? r.created_at : a), null),
    roomsMeasured: byRoom.size,
    roomsTotal: RESIDENT_ROOMS.size,
    thresholds: TIER_THRESHOLDS,
    floors,
    rooms,
    carriers,
  };
}
