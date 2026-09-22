import { describe, it, expect } from "vitest";
import { isTrustedWindow, resolveLocationTag } from "../../src/lib/curfew";

// KST(UTC+9) 기준 특정 날짜/시각의 Date를 만든다. month는 1~12(사람이 읽는 표기).
function kstDate(y: number, m: number, d: number, hour: number, minute: number): Date {
  return new Date(Date.UTC(y, m - 1, d, hour - 9, minute));
}

// 2026년 1월 요일: 1(목,공휴일 신정) 2(금) 3(토) 4(일) 5(월) 6(화) 7(수) 8(목) 9(금) 10(토) 11(일)
describe("isTrustedWindow", () => {
  it("평일 밤 23:30은 신뢰 구간(통금 시작 23:00)", () => {
    expect(isTrustedWindow(kstDate(2026, 1, 8, 23, 30))).toBe(true); // 목요일
  });

  it("평일 밤 22:30은 아직 통금 아님(평일은 23:00부터)", () => {
    expect(isTrustedWindow(kstDate(2026, 1, 2, 22, 30))).toBe(false); // 금요일
  });

  it("금요일 밤은 평일 규칙(23:00 시작)을 쓴다", () => {
    expect(isTrustedWindow(kstDate(2026, 1, 2, 23, 0))).toBe(true); // 금요일 23:00
  });

  it("토요일 밤 22:30은 신뢰 구간(휴일 규칙, 22:00부터 시작)", () => {
    expect(isTrustedWindow(kstDate(2026, 1, 3, 22, 30))).toBe(true); // 토요일
  });

  it("금요일 밤(평일) 통금은 다음날 07:00까지만 이어진다", () => {
    expect(isTrustedWindow(kstDate(2026, 1, 9, 6, 50))).toBe(true); // 금요일 밤 -> 토요일 새벽 06:50
    expect(isTrustedWindow(kstDate(2026, 1, 9, 7, 5))).toBe(false); // 토요일 새벽 07:05, 평일 규칙 종료 후
  });

  it("토요일 밤(휴일) 통금은 다음날 07:30까지 이어진다", () => {
    expect(isTrustedWindow(kstDate(2026, 1, 4, 7, 15))).toBe(true); // 일요일 새벽 07:15
    expect(isTrustedWindow(kstDate(2026, 1, 4, 7, 35))).toBe(false); // 일요일 새벽 07:35
  });

  it("평일 저녁 개방시간(18:00~18:50)", () => {
    expect(isTrustedWindow(kstDate(2026, 1, 5, 18, 20))).toBe(true); // 월요일
    expect(isTrustedWindow(kstDate(2026, 1, 5, 17, 30))).toBe(false);
    expect(isTrustedWindow(kstDate(2026, 1, 5, 18, 55))).toBe(false);
  });

  it("주말(토/일) 저녁 개방시간(17:00~17:50)", () => {
    expect(isTrustedWindow(kstDate(2026, 1, 3, 17, 20))).toBe(true); // 토요일
    expect(isTrustedWindow(kstDate(2026, 1, 3, 18, 20))).toBe(false); // 주말은 18시대엔 개방시간 아님
  });

  it("평일 낮은 신뢰 구간 아님", () => {
    expect(isTrustedWindow(kstDate(2026, 1, 5, 14, 0))).toBe(false);
  });

  it("평일 공휴일(신정, 목요일)은 저녁 개방시간이 평일 규칙(18:00)을 쓴다", () => {
    expect(isTrustedWindow(kstDate(2026, 1, 1, 18, 20))).toBe(true);
    expect(isTrustedWindow(kstDate(2026, 1, 1, 17, 20))).toBe(false);
  });

  it("평일 공휴일(신정, 목요일)은 통금 시작이 휴일 규칙(22:00)을 쓴다", () => {
    expect(isTrustedWindow(kstDate(2026, 1, 1, 22, 30))).toBe(true);
    expect(isTrustedWindow(kstDate(2026, 1, 1, 21, 30))).toBe(false);
  });
});

describe("resolveLocationTag", () => {
  it("신뢰 구간 밖이고 raw가 실내면 외부로 강제", () => {
    expect(resolveLocationTag("실내", false, 10, 0)).toBe("외부");
  });
  it("신뢰 구간 밖이고 raw가 외부/미확인이면 그대로", () => {
    expect(resolveLocationTag("외부", false, 500, 0)).toBe("외부");
    expect(resolveLocationTag("미확인", false, null, null)).toBe("미확인");
  });

  it("신뢰 구간 안, 좌표 없으면(미확인) 그대로 미확인", () => {
    expect(resolveLocationTag("미확인", true, null, null)).toBe("미확인");
  });

  it("신뢰 구간 안, 오차 감안한 거리가 200m 이내면 실내로 인정(관용)", () => {
    // 실제 거리 150m, 오차 0 -> 150m, 200m 이내 -> 실내
    expect(resolveLocationTag("외부", true, 150, 0)).toBe("실내");
    // 실제 거리 250m인데 GPS 오차가 100m -> 유효거리 150m, 200m 이내 -> 실내
    expect(resolveLocationTag("외부", true, 250, 100)).toBe("실내");
  });

  it("신뢰 구간 안이어도 오차 감안 거리가 200m 넘으면 외부로 판정", () => {
    // 실제 거리 500m, 오차 100m -> 유효거리 400m, 200m 초과 -> 외부
    expect(resolveLocationTag("실내", true, 500, 100)).toBe("외부");
  });

  it("accuracyM이 null이면 0으로 간주한다", () => {
    expect(resolveLocationTag("외부", true, 30, null)).toBe("실내");
  });
});
