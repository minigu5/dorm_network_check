import { describe, it, expect } from "vitest";
import { isCurfewWindow, resolveLocationTag } from "../../src/lib/curfew";

function kstDate(hour: number, minute: number): Date {
  // KST(UTC+9) 기준 시각을 만들기 위해 UTC로 변환해서 Date 생성
  const utcHour = hour - 9;
  return new Date(Date.UTC(2026, 0, 1, utcHour, minute));
}

describe("isCurfewWindow", () => {
  it("23:30은 입소 시간대", () => {
    expect(isCurfewWindow(kstDate(23, 30))).toBe(true);
  });
  it("03:00은 입소 시간대(자정 경과)", () => {
    expect(isCurfewWindow(kstDate(3, 0))).toBe(true);
  });
  it("18:30은 입소 시간대", () => {
    expect(isCurfewWindow(kstDate(18, 30))).toBe(true);
  });
  it("14:00은 입소 시간대 아님", () => {
    expect(isCurfewWindow(kstDate(14, 0))).toBe(false);
  });
  it("07:21은 입소 시간대 아님", () => {
    expect(isCurfewWindow(kstDate(7, 21))).toBe(false);
  });
  it("23:09는 입소 시간대 아님", () => {
    expect(isCurfewWindow(kstDate(23, 9))).toBe(false);
  });
});

describe("resolveLocationTag", () => {
  it("입소 시간대 안이면 raw 그대로", () => {
    expect(resolveLocationTag("실내", true)).toBe("실내");
    expect(resolveLocationTag("외부", true)).toBe("외부");
    expect(resolveLocationTag("미확인", true)).toBe("미확인");
  });
  it("입소 시간대 밖이고 raw가 실내면 외부로 강제", () => {
    expect(resolveLocationTag("실내", false)).toBe("외부");
  });
  it("입소 시간대 밖이고 raw가 외부/미확인이면 그대로", () => {
    expect(resolveLocationTag("외부", false)).toBe("외부");
    expect(resolveLocationTag("미확인", false)).toBe("미확인");
  });
});
