// 통금(야간 입소) 시간대. 어느 쪽 규칙을 쓸지는 "그 날 저녁"의 요일 유형으로
// 정한다(자정을 넘어가도 규칙은 바뀌지 않음 -- 예: 토요일 22:00에 시작한 통금은
// 일요일 07:30까지 휴일 규칙 그대로 유지). 금요일 밤은 평일 규칙을 쓴다.
export const WEEKDAY_CURFEW = { startMin: 23 * 60, endMin: 7 * 60 };
export const HOLIDAY_CURFEW = { startMin: 22 * 60, endMin: 7 * 60 + 30 };

// 기숙사 개방 시간(강제 입소 아님, 원할 때 들어올 수 있는 시간). 통금과 마찬가지로
// GPS 관용 반경/기본 실내 판정에 포함한다 -- 이 시간엔 실제로 기숙사에 있는
// 학생이 많아 GPS 오차로 실내 판정을 놓치는 걸 막기 위함.
export const WEEKDAY_OPEN_WINDOW = { startMin: 18 * 60, endMin: 18 * 60 + 50 };
export const WEEKEND_OPEN_WINDOW = { startMin: 17 * 60, endMin: 17 * 60 + 50 };

export const CURFEW_RADIUS_M = 40;
export const DEFAULT_RADIUS_M = 25;

// 통금/개방 시간대("신뢰 구간") 안에서는 GPS 정확도가 나빠도(특히 실내에서
// 위성 신호가 약해질 때) 기본값을 "실내"로 두고, GPS가 오차 범위를 감안해도
// 확실히 이 반경보다 멀리 있다고 할 때만 "외부"로 뒤집는다. 값이 너무 크면
// 학교 다른 건물에 있어도 실내로 오판할 위험이, 너무 작으면 여전히 실내
// 판정을 못 받는 문제가 재발할 수 있다 -- 실측 후 조정할 것.
export const CURFEW_FAR_AWAY_RADIUS_M = 200;

// 한국 공휴일(대체공휴일 미반영). 설날/추석/부처님오신날은 음력이라 매년 날짜가
// 바뀌므로, 해가 바뀌면 이 목록을 갱신해야 한다. 제헌절은 국경일이지만 공휴일
// (유급휴일)이 아니라서 포함하지 않았다.
export const KOREAN_HOLIDAYS: string[] = [
  "2026-01-01", // 신정
  "2026-02-16", // 설날 연휴
  "2026-02-17", // 설날
  "2026-02-18", // 설날 연휴
  "2026-03-01", // 삼일절
  "2026-05-05", // 어린이날
  "2026-05-24", // 부처님오신날
  "2026-06-06", // 현충일
  "2026-08-15", // 광복절
  "2026-09-24", // 추석 연휴
  "2026-09-25", // 추석
  "2026-09-26", // 추석 연휴
  "2026-10-03", // 개천절
  "2026-10-09", // 한글날
  "2026-12-25", // 크리스마스
];

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

// 데이터 오염(비정상/조작 값) 방지용 서버 측 범위 검증. 실제 모바일망에서
// 나올 수 있는 값보다 넉넉히 잡되, 스크립트로 임의 값(음수, 수천 Mbps 등)을
// 직접 쏘는 걸 막는 게 목적이다. 범위를 벗어나면 /api/submit이 400으로
// 거부하고 DB에는 아예 들어가지 않는다.
export const MEASUREMENT_LIMITS = {
  download_mbps: { min: 0, max: 2000 },
  upload_mbps: { min: 0, max: 1000 },
  ping_ms: { min: 0, max: 5000 },
  jitter_ms: { min: 0, max: 2000 },
  packet_loss_pct: { min: 0, max: 100 },
} as const;

// GPS accuracy_m은 클라이언트가 그대로 보내는 값이라, 상한이 없으면
// resolveLocationTag의 관용 반경(CURFEW_FAR_AWAY_RADIUS_M) 계산에서
// accuracy_m을 크게 조작해 실제 위치와 무관하게 "실내"로 찍히게 할 수 있다.
// 다만 실내/저신호 상태의 실제 기기도 이 값이 크게 나올 수 있어서, 제출
// 자체를 막지는 않고 판정 계산(effectiveDistance)에서만 이 값으로 클램프한다
// (src/handlers/submit.ts의 accuracyMForTag 참고). 저장하는 accuracy_m은
// 원본 값 그대로 둔다.
export const MAX_ACCURACY_M = 200;

// 같은 클라이언트(IP 해시 기준)가 짧은 시간에 반복 제출해 통계를 스팸으로
// 오염시키는 걸 막기 위한 최소 쿨다운. 통신사 CGNAT로 여러 사용자가 IP를
// 공유할 수 있어 너무 길게 잡으면 오탐이 생기므로 짧게 유지한다.
export const SUBMIT_COOLDOWN_SECONDS = 120;
