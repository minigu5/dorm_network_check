import {
  WEEKDAY_CURFEW,
  HOLIDAY_CURFEW,
  WEEKDAY_OPEN_WINDOW,
  WEEKEND_OPEN_WINDOW,
  CURFEW_FAR_AWAY_RADIUS_M,
  KOREAN_HOLIDAYS,
} from "../config";

const KST_OFFSET_MIN = 9 * 60;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toKst(date: Date): Date {
  return new Date(date.getTime() + KST_OFFSET_MIN * 60 * 1000);
}

function kstMinuteOfDay(date: Date): number {
  const kst = toKst(date);
  return kst.getUTCHours() * 60 + kst.getUTCMinutes();
}

function kstDateKey(date: Date): string {
  const kst = toKst(date);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(kst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function kstDayOfWeek(date: Date): number {
  // 0 = 일요일 ... 6 = 토요일 (KST 기준)
  return toKst(date).getUTCDay();
}

export function isKoreanHoliday(date: Date): boolean {
  return KOREAN_HOLIDAYS.includes(kstDateKey(date));
}

function isWeekendDay(date: Date): boolean {
  const day = kstDayOfWeek(date);
  return day === 0 || day === 6;
}

// 통금 시작/종료 시각 계산에 쓰는 "휴일" 기준: 토/일 + 공휴일.
function isHolidayForOvernightCurfew(date: Date): boolean {
  return isWeekendDay(date) || isKoreanHoliday(date);
}

// 통금(야간)/개방(저녁) 시간대를 합쳐 "신뢰 구간"이라 부른다. 이 구간에서는
// 학생이 실제로 기숙사에 있을 확률이 매우 높다고 보고 GPS 판정을 관대하게 한다.
export function isTrustedWindow(date: Date): boolean {
  const minuteOfDay = kstMinuteOfDay(date);

  // 새벽 구간: 전날 저녁부터 이어진 통금이 아직 안 끝났는지 확인한다. 종료
  // 시각은 "전날"이 휴일 전야였는지에 따라 달라지므로(예: 토요일 밤 통금은
  // 일요일 07:30까지) 어제 날짜의 요일 유형으로 판단한다.
  if (minuteOfDay < HOLIDAY_CURFEW.endMin) {
    const yesterday = new Date(date.getTime() - MS_PER_DAY);
    const endMin = isHolidayForOvernightCurfew(yesterday)
      ? HOLIDAY_CURFEW.endMin
      : WEEKDAY_CURFEW.endMin;
    if (minuteOfDay < endMin) return true;
  }

  // 저녁 개방 시간: 오늘이 토/일이면 17:00~17:50, 아니면(공휴일 포함) 18:00~18:50.
  const openWindow = isWeekendDay(date) ? WEEKEND_OPEN_WINDOW : WEEKDAY_OPEN_WINDOW;
  if (minuteOfDay >= openWindow.startMin && minuteOfDay < openWindow.endMin) return true;

  // 야간 통금 시작: 오늘(저녁)이 휴일 전야인지에 따라 22:00 또는 23:00부터 시작.
  const nightWindow = isHolidayForOvernightCurfew(date) ? HOLIDAY_CURFEW : WEEKDAY_CURFEW;
  if (minuteOfDay >= nightWindow.startMin) return true;

  return false;
}

export type RawLocationTag = "실내" | "외부" | "미확인";

// 신뢰 구간 안에서는 GPS 오차(accuracyM)를 감안해도 기숙사 반경보다 확실히
// 멀리 있다고 할 때만(effectiveDistance > CURFEW_FAR_AWAY_RADIUS_M) "외부"로
// 판정하고, 그 외에는 기본값으로 "실내"를 인정한다. 신뢰 구간 밖에서는 기존과
// 동일하게 raw가 "실내"였어도 "외부"로 강제한다.
export function resolveLocationTag(
  raw: RawLocationTag,
  isTrusted: boolean,
  distanceM: number | null,
  accuracyM: number | null
): RawLocationTag {
  if (!isTrusted) {
    return raw === "실내" ? "외부" : raw;
  }
  if (raw === "미확인" || distanceM === null) {
    return raw;
  }
  const effectiveDistance = Math.max(0, distanceM - (accuracyM ?? 0));
  return effectiveDistance > CURFEW_FAR_AWAY_RADIUS_M ? "외부" : "실내";
}
