import { CURFEW_WINDOWS } from "../config";

const KST_OFFSET_MIN = 9 * 60;

function minutesOfDayKst(date: Date): number {
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  return (utcMinutes + KST_OFFSET_MIN) % (24 * 60);
}

export function isCurfewWindow(date: Date): boolean {
  const m = minutesOfDayKst(date);
  return CURFEW_WINDOWS.some((w) => m >= w.startMin && m < w.endMin);
}

export type RawLocationTag = "실내" | "외부" | "미확인";

export function resolveLocationTag(
  raw: RawLocationTag,
  isCurfew: boolean
): RawLocationTag {
  if (isCurfew) return raw;
  return raw === "실내" ? "외부" : raw;
}
