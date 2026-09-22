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
// (이 한계를 실측으로 만난 경우 BLOCKED_WIFI_IPS에 해당 WiFi의 공인 IP를 추가할 것.)
export type CarrierName = "SKT" | "KT" | "LGU+";

export const CARRIER_ORG_KEYWORDS: Record<CarrierName, string[]> = {
  SKT: ["sk telecom"],
  KT: ["kt corporation", "korea telecom"],
  "LGU+": ["lg uplus", "lguplus"],
};

// asOrganization만으로는 KT 유선/모바일을 구분 못 하는 등 조직명 판정이 뚫리는 경우를
// 대비한 최후 수단: 실제로 확인된 기숙사/학교 WiFi의 공인(egress) IP를 직접 차단한다.
// (예: ip.pe.kr 같은 도구로 해당 WiFi에 연결한 기기에서 확인) 이 IP는 학교 네트워크
// 구성이 바뀌면 함께 바뀔 수 있으니, WiFi 차단이 다시 뚫리면 재확인 후 갱신할 것.
export const BLOCKED_WIFI_IPS = ["221.168.22.149"];
