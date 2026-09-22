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
//
// 주의: "sk broadband"(SK브로드밴드)와 "lg dacom"(LG데이콤/LG유플러스의 유선망 전신)은
// 각각 SK/LG 계열의 "유선"(고정회선) 인터넷 사업자 브랜드이며 모바일망이 아니다. 과거
// 이 목록에 포함돼 있었으나, 기숙사 WiFi가 바로 이 유선 사업자 회선을 쓸 경우
// isMobileCarrierOrg()를 통과해 WiFi 차단(§4)이 완전히 무력화되는 치명적 버그였다.
// 반드시 실제 "모바일"(LTE/5G) 사업자 문자열만 추가할 것 — 유선/기업망 브랜드는 절대
// 추가하지 말 것.
//
// 참고(고칠 수 없는 한계): KT는 유선(KT 유선 인터넷)과 모바일(KT 5G/LTE)을 같은
// AS4766/"KT Corporation" asOrganization 문자열로 노출하므로, asOrganization만으로는
// KT 유선과 KT 모바일을 구분할 수 없다. 이는 버그가 아니라 Cloudflare가 제공하는
// 정보의 근본적 한계이며, 스펙 §4의 VPN 한계와 마찬가지로 실용적 목적상 감수한다.
export const MOBILE_CARRIER_ORG_KEYWORDS = [
  "sk telecom",
  "kt corporation",
  "korea telecom",
  "lg uplus",
  "lguplus",
];
