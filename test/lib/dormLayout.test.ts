import { describe, it, expect } from "vitest";
import { DORM_FLOORS, RESIDENT_ROOMS, parseRoomNumber, parseCorridorFloor } from "../../src/lib/dormLayout";

describe("DORM_FLOORS", () => {
  it("배치도 기준 층별 생활실 수(14/16/25/24/18실)와 일치한다", () => {
    const counts = Object.fromEntries(
      DORM_FLOORS.map((f) => [
        f.floor,
        [...f.annex, ...f.main].flat().filter((s) => typeof s === "number").length,
      ])
    );
    expect(counts).toEqual({ 1: 14, 2: 16, 3: 25, 4: 24, 5: 18 });
    expect(RESIDENT_ROOMS.size).toBe(97);
  });

  it("빈 방·시설 호실은 생활실 목록에 없다", () => {
    for (const n of [106, 111, 115, 201, 212, 218, 310, 404, 411, 425, 508, 513]) {
      expect(RESIDENT_ROOMS.has(n)).toBe(false);
    }
  });
});

describe("parseRoomNumber", () => {
  it("'301호', '301', ' 301 호 ' 모두 301", () => {
    expect(parseRoomNumber("301호")).toBe(301);
    expect(parseRoomNumber("301")).toBe(301);
    expect(parseRoomNumber(" 301 호 ")).toBe(301);
  });

  it("생활실 목록에 없는 번호나 숫자 없는 값은 null", () => {
    expect(parseRoomNumber("404호")).toBeNull();
    expect(parseRoomNumber("방")).toBeNull();
    expect(parseRoomNumber(null)).toBeNull();
  });
});

describe("parseCorridorFloor", () => {
  it("'3층' → 3, 범위 밖이나 빈 값은 null", () => {
    expect(parseCorridorFloor("3층")).toBe(3);
    expect(parseCorridorFloor("9층")).toBeNull();
    expect(parseCorridorFloor(null)).toBeNull();
  });
});
