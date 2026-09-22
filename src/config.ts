export const CURFEW_WINDOWS: Array<{ startMin: number; endMin: number }> = [
  // 23:10 ~ 다음날 07:20 (자정 경과)
  { startMin: 23 * 60 + 10, endMin: 24 * 60 },
  { startMin: 0, endMin: 7 * 60 + 20 },
  // 18:05 ~ 18:55
  { startMin: 18 * 60 + 5, endMin: 18 * 60 + 55 },
];

export const CURFEW_RADIUS_M = 40;
export const DEFAULT_RADIUS_M = 25;

// 배포 후 실제 요청 로그의 asOrganization 값을 확인해 이 목록을 교정할 것.
export const MOBILE_CARRIER_ORG_KEYWORDS = [
  "sk telecom",
  "sk broadband",
  "kt corporation",
  "korea telecom",
  "lg uplus",
  "lg dacom",
  "lguplus",
];
