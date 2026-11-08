// 입지관 층별 생활실 배치(2026-08-12 기준 생활실별 배치도). /stats 배치도와
// 방 단위 집계가 같이 쓴다. 배치도가 바뀌면(호실 재배정, 빈 방 변동) 같이 갱신할 것.
//
// 슬롯: 숫자 = 학생이 사는 생활실(분모에 포함), 객체 = 시설·빈 방(칸만 그리고 분모에서 제외).
// 각 층은 신관(annex, 위 2줄)과 본관(main, 아래 2줄)으로 나뉘고, 각 줄은 복도를 사이에 둔
// 왼쪽→오른쪽 순서다. 배치도에서 거주 학생이 전부 #N/A인 방은 "빈방"으로 둔다.
export type FacilitySlot = { label: string; span?: number };
export type Slot = number | FacilitySlot;

export interface FloorLayout {
  floor: number;
  annex: Slot[][];
  main: Slot[][];
}

const f = (label: string, span = 1): FacilitySlot => (span === 1 ? { label } : { label, span });
const STAIRS = f("계단");
const EV = f("E/V");
const STUDY = f("자습");
const EMPTY = f("빈방");

export const DORM_FLOORS: FloorLayout[] = [
  {
    floor: 5,
    annex: [
      [STAIRS, f("자습", 2), f("자습", 2)],
      [EV, f("게스트"), f("게스트"), f("게스트"), f("게스트")],
    ],
    main: [
      [503, 504, 505, 506, 507, STAIRS, EMPTY, 509, 510, 511, 512],
      [517, 518, 519, 520, 521, 522, STUDY, 524, 525, 526, STAIRS],
    ],
  },
  {
    floor: 4,
    annex: [
      [STAIRS, 401, 402, 403, 405],
      [EV, STUDY, 417, 418, 419],
    ],
    main: [
      [406, 407, 408, 409, 410, STAIRS, EMPTY, 412, 413, 414, 415],
      [420, 421, 422, 423, 424, f("사감"), STUDY, 427, 428, 429, STAIRS],
    ],
  },
  {
    floor: 3,
    annex: [
      [STAIRS, 301, 302, 303, 304],
      [EV, STUDY, 316, 317, 318],
    ],
    main: [
      [305, 306, 307, 308, 309, STAIRS, EMPTY, 311, 312, 313, 314],
      [319, 320, 321, 322, 323, 324, STUDY, 326, 327, 328, STAIRS],
    ],
  },
  {
    floor: 2,
    annex: [
      [STAIRS, f("자습", 2), f("장애우"), 203],
      [EV, f("관리"), f("사감"), 216, 217],
    ],
    main: [
      [204, 205, 206, 207, 208, STAIRS, STUDY, 210, 211, EMPTY, EMPTY],
      [EMPTY, 219, 220, 221, 222, 223, STUDY, 225, EMPTY, EMPTY, STAIRS],
    ],
  },
  {
    floor: 1,
    annex: [
      [STAIRS, f("통제", 2), f("화장실"), f("화장실")],
      [EV, f("출입구"), f("택배"), f("자습", 2)],
    ],
    main: [
      [101, 102, 103, 104, 105, STAIRS, EMPTY, 107, 108, 109, 110],
      [f("보관"), 112, 113, 114, f("사감"), STUDY, STUDY, 118, 119, f("장애우"), STAIRS],
    ],
  },
];

export const RESIDENT_ROOMS: ReadonlySet<number> = new Set(
  DORM_FLOORS.flatMap((fl) => [...fl.annex, ...fl.main].flat()).filter(
    (s): s is number => typeof s === "number"
  )
);

// 호실 입력은 자유 텍스트("301호", "301", " 301 호 ")라 처음 나오는 세 자리 숫자만 본다.
// 생활실 목록에 없는 번호(오타, 시설 호실)는 null -- 방 칸에는 안 들어가고 통신사 집계에만 남는다.
export function parseRoomNumber(room: string | null): number | null {
  const m = room?.match(/\d{3}/);
  if (!m) return null;
  const n = Number(m[0]);
  return RESIDENT_ROOMS.has(n) ? n : null;
}

// 복도 측정의 corridor 값은 층 선택지("1층"~"5층")다.
export function parseCorridorFloor(corridor: string | null): number | null {
  const m = corridor?.match(/\d/);
  if (!m) return null;
  const n = Number(m[0]);
  return DORM_FLOORS.some((fl) => fl.floor === n) ? n : null;
}
