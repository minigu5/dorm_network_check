# 기숙사 모바일 데이터 속도 측정/분석 시스템 설계

## 1. 목적

기숙사 거주자들의 모바일 데이터(LTE/5G) 속도를 동/층/복도/호실, 통신사, 시간대별로
측정·수집하여, 신호 약점 지역을 파악하고 학교/통신사에 개선을 요구할 근거 자료를
만든다.

## 2. 전체 아키텍처

```
[휴대폰 브라우저]
  --1.네트워크 확인--> [Cloudflare Worker: /api/network-check]
  --2.GPS 권한/판정, 3.분기 입력, 4.최종 확인--
  --5.측정 실행--
  --6.제출--> [Cloudflare Worker: /api/submit]
                                              |
                                     asOrganization/asn 재확인 (WiFi 차단)
                                     GPS geofence + 시간대 재판정
                                              |
                                              v
                                        [D1 (SQLite)]
                                              |
                                       GET /api/export
                                              |
                                              v
                                [로컬 Python 분석 스크립트]
                                  (pandas + plotly)
                                              |
                                              v
                                    report.html (정적, 인터랙티브)
```

- 수집: Cloudflare Worker(TypeScript) 하나가 측정 페이지 서빙, 측정 API, D1 저장을
  모두 담당. `*.workers.dev` 기본 도메인으로 링크 공유.
- 분석: 로컬 Python 스크립트가 `/api/export`로 데이터를 받아 하나의 인터랙티브
  HTML 리포트(plotly)를 생성. 실시간 대시보드는 만들지 않음(필요할 때 수동 실행).

## 3. 사용자 플로우 (프론트엔드 단계별 진행)

측정 페이지는 아래 순서를 강제한다. 실제 속도 측정(4단계)은 사용자가 최종 확인을
누르기 전까지 시작하지 않는다.

1. **접속 즉시 네트워크 확인**: 페이지 로드 시 서버에 판정을 요청해
   WiFi/기타망인지 모바일망(SKT/KT/LGU+)인지 먼저 확인한다(판정 방법은 §4).
   - WiFi/기타망: 화면에 "모바일 데이터로 연결 후 다시 시도하세요" 안내만 표시,
     이후 단계 전부 비활성화.
   - 모바일망 확인됨: 2단계로 진행.
2. **위치 확인**: Geolocation 권한을 요청하고, 좌표를 받으면 §5의 로직으로
   `raw_location_tag`(실내/외부/미확인)를 계산한다. 권한을 거부하면 `미확인`으로
   처리하고 외부와 동일한 화면(3-b)으로 진행한다.
3. **입력 화면 분기**:
   - **3-a. 실내로 판정된 경우**: 동/층/호실/복도를 사용자가 직접 선택·입력하는
     폼을 보여준다(필수 입력). 통신사 선택도 함께 받는다.
   - **3-b. 외부 또는 미확인인 경우**: 동/층/호실/복도 입력란은 보여주지 않는다.
     GPS 좌표는 자동으로 첨부되고, 사용자가 원할 때만 채울 수 있는 선택적 자유
     설명 텍스트("예: 정문 앞 버스정류장" 등)만 제공한다. 통신사 선택은 동일하게
     받는다.
4. **최종 확인 화면**: 지금까지 판정/입력된 정보(네트워크 판정 결과, 위치 판정
   결과, 3-a 또는 3-b에서 입력한 값, 통신사)를 한 화면에 요약해서 보여주고
   사용자가 "이 정보로 측정 시작"을 눌러야 다음 단계로 넘어간다. 취소하면 3단계로
   돌아가 값을 수정할 수 있다.
5. **측정 실행**: 확인 후에만 §8의 다운로드/업로드/핑/지터/패킷로스 측정을
   순서대로 실행한다.
6. **제출**: 측정 결과 + 2~4단계에서 모은 메타데이터를 묶어 `POST /api/submit`으로
   전송한다. 서버는 클라이언트의 판정을 그대로 신뢰하지 않고 WiFi 여부와
   위치/시간대 판정을 **다시 한번 서버에서 재계산**해 최종 저장한다(1~2단계의
   클라이언트 판정은 UX용 사전 안내일 뿐, 보안/정합성의 최종 근거는 항상 서버).

## 4. WiFi 차단 (모바일 데이터만 유효)

브라우저 JS의 Network Information API는 Android 일부에서만 동작하고 iOS Safari는
지원하지 않아 신뢰할 수 없음. 대신 서버 측에서 Cloudflare가 요청마다 제공하는
`request.cf.asOrganization`/`request.cf.asn` (접속 IP의 네트워크 사업자 정보)을
사용해 판정한다.

- `GET /api/network-check` — §3 1단계에서 페이지 로드 직후 호출. `asOrganization`
  판정 결과(`mobile` / `wifi_or_other`)만 반환, 저장은 하지 않음. UX 안내용.
- `POST /api/submit` — 제출 시 서버가 같은 방식으로 **다시** 판정해 `asOrganization`이
  SKT/KT/LG U+ 모바일망 ASN 화이트리스트에 없으면 400으로 거부(최종 근거).
- 알뜰폰(MVNO)은 망을 임대하는 원 사업자(SKT/KT/LGU+)의 ASN으로 잡히므로
  화이트리스트에 자동 포함됨.
- 클라이언트가 이 판정을 조작할 수 없음(브라우저를 거치지 않고 Cloudflare가 실제
  접속 경로로 판정).
- 한계: VPN 사용 등 극소수 예외 케이스는 오탐 가능. 실용적 목적상 허용.
- 한계: KT는 유선(홈 인터넷)과 모바일(LTE/5G)이 같은 asOrganization 문자열
  (`KT Corporation`)을 공유하므로, asOrganization만으로는 KT 유선 WiFi와 KT
  모바일망을 구분할 수 없다. 이는 Cloudflare가 제공하는 정보의 근본적 한계로,
  고칠 수 없는 영구적 스펙 한계다(SK/LG 계열은 유선 브랜드명이 달라 화이트리스트
  키워드에서 애초에 제외했지만, KT는 이 방법으로도 분리되지 않는다).
- **IP 직접 차단(위 한계의 실용적 보완)**: 실측 결과 기숙사 WiFi가 KT 유선망을
  써서 asOrganization만으로 못 걸러지는 것이 확인됨(예: 학교 WiFi 공인 IP가
  KT/AS4766로 잡힘). 이런 경우를 대비해 알려진 WiFi 공인(egress) IP를
  `CF-Connecting-IP` 헤더로 직접 확인해 차단하는 목록(`BLOCKED_WIFI_IPS`)을
  둔다. `/api/network-check`와 `/api/submit` 양쪽에서 조직명 판정과 별개로 이
  목록을 확인하며, 이 목록에 있으면 조직명이 무엇이든 무조건 거부한다. WiFi가
  다시 뚫리면 해당 WiFi에 연결한 기기에서 공인 IP를 확인해(예: ip.pe.kr) 이
  목록을 갱신할 것.

### 4-1. 통신사 자동 판별
브라우저 JS에는 통신사 감지 API가 없지만, 서버가 어차피 WiFi 차단을 위해
`asOrganization`을 확인하므로 같은 값에서 통신사(SKT/KT/LGU+)도 함께
판별한다. 사용자가 수동으로 선택할 필요가 없다: `GET /api/network-check`가
`{status, carrier}`를 반환하고, `POST /api/submit`도 클라이언트가 보낸 값을
신뢰하지 않고 서버가 asOrganization으로 다시 판별해 저장한다(위치/시간대
재검증과 같은 원칙). 알뜰폰(MVNO) 사용자도 실제로 타는 망(SKT/KT/LGU+) 기준
으로 자동 분류된다.

## 5. 위치(실내/외부) 판정

### 5-1. GPS geofence
- 클라이언트에서 Geolocation API로 위도/경도/정확도(accuracy) 획득 후 서버에 전송.
- 서버가 기숙사 건물 중심 좌표와의 거리를 계산(Haversine)하여 반경 이내면
  `raw_location_tag = 실내`, 아니면 `외부`.
- 위치 권한 거부 시 `raw_location_tag = 미확인`으로 저장하고, 분석 시 해당 행은
  제외한다(제출 자체는 허용).

### 5-2. 신뢰 구간(통금/개방 시간)과 요일 유형

이 시간대엔 학생이 실제로 기숙사에 있을 확률이 매우 높다고 보고 GPS 판정을
관대하게 한다("신뢰 구간"). 통금(야간)은 그 날 저녁이 평일인지 휴일 전야인지에
따라 시작/종료 시각이 다르고, 저녁 개방 시간(강제 아님)은 별도로 존재한다.

- **통금(야간)**: 평일(월~금, 공휴일 아님) **23:00~다음날 07:00**, 휴일 전야
  (토/일/공휴일) **22:00~다음날 07:30**. 자정을 넘어가도 "그 날 저녁"의 요일
  유형을 그대로 쓴다(토요일 밤 22시에 시작한 통금은 일요일 07:30까지 휴일
  규칙 유지). 금요일 밤은 평일 규칙(23:00 시작)을 쓴다.
- **저녁 개방 시간(강제 아님)**: 평일 **18:00~18:50**, 주말(토/일만, 공휴일
  아닌 평일은 제외) **17:00~17:50**.
- **휴일 판정**: 토/일 + 한국 공휴일(설날/추석 등 음력 공휴일 포함, 매년 갱신
  필요 — `src/config.ts`의 `KOREAN_HOLIDAYS` 참고. 대체공휴일 미반영).
- 신뢰 구간 안에서는 GPS 판정 반경 **40m**(`CURFEW_RADIUS_M`), 밖에서는
  **25m**(`DEFAULT_RADIUS_M`)를 기본 반경으로 쓴다(이 값은 감사용
  `raw_location_tag` 계산에만 쓰이고, 최종 판정은 5-3의 GPS 오차 관용 로직을
  따로 거친다).

### 5-3. 최종 판정 로직 (서버, `created_at` 기준)

아이폰 실내 GPS는 위성 신호가 약해져 정확도가 크게 떨어지는 경우가 흔하다.
신뢰 구간 안에서 순수 반경(40m)만으로 판정하면 실제로 기숙사 안에 있어도
"외부"로 오판되는 사례가 잦았다. 그래서 신뢰 구간 안에서는 GPS 오차
(`accuracy_m`)를 감안한 유효거리가 확실히 멀 때만("멀리 있다고 확신할 수
있을 때만") 외부로 뒤집고, 그 외에는 기본값을 실내로 둔다.

```
raw = 반경(신뢰 구간 40m / 그 외 25m) 기준 GPS geofence 판정 (실내 / 외부 / 미확인)

if 현재시각이 신뢰 구간(§5-2) 안:
    if raw == "미확인":
        location_tag = "미확인"
    else:
        유효거리 = max(0, 실제거리 - accuracy_m)
        location_tag = 유효거리 > 200m ? "외부" : "실내"   # CURFEW_FAR_AWAY_RADIUS_M
else:
    if raw == "실내":
        location_tag = "외부"      # 신뢰 구간 밖이면 실내 판정 무효화
    else:
        location_tag = raw         # 외부/미확인은 그대로 유지
```
- `CURFEW_FAR_AWAY_RADIUS_M`(기본 200m)은 튜닝 대상이다: 너무 크면 학교의
  다른 인접 건물에 있어도 실내로 오판할 위험이, 너무 작으면 여전히 GPS 오차로
  실내 판정을 못 받는 문제가 재발할 수 있다.
- "외부" 데이터도 거부하지 않고 그대로 저장한다(학생마다 요금제가 달라 교내/외
  비교가 필요하므로 유효한 분석 축으로 사용).

## 6. 데이터 수집 폼 필드 (§3 분기에 따른 구성)

- 공통(모든 경우): 통신사(carrier)는 §4-1대로 서버가 asOrganization에서 자동
  판별(사용자 선택 없음), 위치(lat/lng/accuracy)는 Geolocation API로 자동
  수집(권한 필요), 시간(created_at) 및 OS(User-Agent 파싱)는 자동 수집.
- **실내 판정(3-a)**: 동(dong), 층(floor), 호실(room), 복도(corridor)를 사용자가
  직접 선택·입력(필수).
- **외부/미확인(3-b)**: 동/층/호실/복도 입력란 없음. 대신 선택적 자유 설명
  텍스트(`note`, 필수 아님)만 제공. 위치는 GPS 좌표로 충분하다고 보고 강제 입력
  항목을 두지 않는다.

## 7. UI 스타일

- 장식 최소화. 그라데이션, 이모지, 화려한 애니메이션 넣지 않는다.
- 커스텀 CSS 프레임워크를 직접 만들지 말고 가벼운 정형 CSS 프레임워크(예:
  Pico.css, Water.css류의 클래스리스/경량 프레임워크) 하나를 CDN(cdnjs)으로
  불러와 기본 스타일만 사용한다.
- 필요한 기능(폼, 버튼, 진행 표시, 결과 요약 표/텍스트)만 구현하고 그 이상의
  꾸미기는 하지 않는다.
- **모바일 환경 최적화 필수**(실제 사용자는 전부 휴대폰 브라우저): `viewport`
  메타 태그로 확대/축소 없이 폭에 맞게 표시, 레이아웃은 항상 1단 세로 배치(가로
  스크롤/멀티 컬럼 없음), 버튼과 입력 필드는 터치로 누르기 쉬운 크기 유지, 폰트는
  휴대폰 화면에서 확대 없이 읽히는 크기로 한다. 데스크톱 전용 레이아웃은 만들지
  않는다.

## 8. D1 스키마

```sql
CREATE TABLE measurements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,          -- 서버 KST 타임스탬프 (ISO 8601)
  lat REAL, lng REAL, accuracy_m REAL,
  raw_location_tag TEXT,             -- GPS geofence 원본 판정: 실내/외부/미확인
  is_curfew_window INTEGER,          -- 0/1, §5-2 신뢰 구간(통금+개방시간) 여부
  location_tag TEXT NOT NULL,        -- 최종 판정: 실내/외부/미확인
  dong TEXT, floor TEXT, room TEXT, corridor TEXT,  -- 실내 판정일 때만 채움
  note TEXT,                         -- 외부/미확인일 때 선택적 자유 설명
  carrier TEXT NOT NULL,             -- SKT/KT/LGU+, asOrganization에서 서버가 자동 판별(§4-1)
  network_org TEXT,                  -- Cloudflare asOrganization (감사/디버깅용)
  os TEXT,                           -- User-Agent 파싱 결과
  download_mbps REAL, upload_mbps REAL,
  ping_ms REAL, jitter_ms REAL,
  packet_loss_pct REAL,
  raw_samples TEXT                   -- JSON, 개별 ping/download/upload 원시 샘플
);
```

## 9. API 명세

- `GET /` — 측정 페이지 서빙(정적 shell, §3 플로우를 클라이언트 JS로 진행).
- `GET /api/network-check` — §3 1단계용. `CF-Connecting-IP`가 §4의
  `BLOCKED_WIFI_IPS`에 있으면 무조건, 아니면 asOrganization으로 판정해
  `{status: "mobile"|"wifi_or_other", carrier: "SKT"|"KT"|"LGU+"|null}` 반환,
  저장 없음.
- `GET /api/location-check?lat=&lng=&accuracy=` — §3 2단계용. §5-3의 판정
  로직(신뢰 구간 + GPS 오차 관용)을 그대로 써서 `{tag}`만 반환, 저장 없음.
  `POST /api/submit`과 반드시 같은 로직을 재사용해야 한다(별도 구현 금지).
- `GET /api/download?size=N` — N바이트 랜덤 데이터 스트리밍(다운로드 측정용).
- `POST /api/upload` — 요청 바디 수신 후 폐기(클라이언트가 elapsed time 측정).
- `GET /api/ping` — 최소 응답(RTT/지터/패킷로스 측정용, 클라이언트가 반복 호출).
- `POST /api/submit` (§3 6단계, 사용자가 4단계 확인을 마친 뒤에만 클라이언트가
  호출):
  1. `CF-Connecting-IP`/`asOrganization`으로 WiFi/타 네트워크 여부 **재확인**,
     통신사(carrier)도 asOrganization에서 **재판별**(클라이언트가 보낸 값은
     신뢰하지 않음) → 모바일망 아니면 400 거부.
  2. GPS 좌표+정확도로 `raw_location_tag`·최종 `location_tag` **재계산**(§5-3).
  3. 서버 시각으로 `is_curfew_window`(신뢰 구간 여부) 계산.
  4. `location_tag`가 실내면 dong/floor/room/corridor 필수, 아니면 `note`만 허용.
  5. D1에 insert.
- `GET /api/export?key=...` — 전체 데이터 CSV/JSON 반환(분석용, 비밀 쿼리 파라미터로
  보호).

## 10. 측정 알고리즘 (클라이언트 JS)

- **다운로드/업로드는 고정 크기가 아니라 고정 시간 동안 반복 측정한다**
  (speedtest.net과 같은 방식). 회선 속도가 다르면 고정 크기 방식은 전체 측정
  시간이 크게 달라지고(느린 회선에서 20MB는 매우 오래 걸림), 사용자에게 진행
  상황도 보여줄 수 없었다. 대신:
  - **다운로드**: 목표 시간(기본 6초) 동안 `/api/download?size=4MB`를 반복
    fetch하되, 응답 바디를 스트림(ReadableStream)으로 읽어 실시간 수신 바이트
    수를 누적한다. 목표 시간이 지나면 진행 중인 청크를 `reader.cancel()`로
    중단하고(이미 받은 바이트는 그대로 집계됨), 총 바이트/총 경과시간으로
    Mbps를 계산한다.
  - **업로드**: 랜덤 청크(기본 2MB) 생성 후 목표 시간(기본 5초) 동안
    `/api/upload`에 반복 POST. 브라우저 호환성상 업로드 진행률은 스트림 단위로
    알 수 없어 청크 완료 단위로만 갱신하며, 마지막 청크는 목표 시간을 약간
    넘길 수 있다.
  - 진행 중 실시간으로 경과시간/남은시간(대략)/현재까지의 Mbps를 화면에 표시한다.
- **핑/지터**: `/api/ping` 20회 반복 호출, RTT 배열 수집 → 평균 = `ping_ms`,
  평균절대편차 = `jitter_ms`. 진행 중 "n/20" 카운트를 화면에 표시한다.
- **패킷로스 추정**: 위 20회 중 타임아웃(3초) 또는 실패 요청 비율 = `packet_loss_pct`.
  한계: HTTP/TCP 기반이라 실제 패킷 손실이 아닌 재전송/타임아웃 비율의 근사치이며,
  UI에 "추정치"임을 명시한다.
- 측정 완료 후 핑 원시 배열과 다운로드/업로드 총 바이트·총 시간을
  `raw_samples`(JSON)에 함께 저장해 사후 재계산이 가능하게 한다.
- 한계: 고정 시간 방식은 회선이 빠를수록 실제 사용 데이터량이 커진다(예: 매우
  빠른 5G에서는 짧은 시간에도 수십~수백 MB를 주고받을 수 있음). 이는
  speedtest.net류 도구의 공통적인 트레이드오프이며, 반대로 고정 크기 방식은
  느린 회선에서 측정 시간이 지나치게 길어지는 문제가 있어 이쪽을 택했다.

## 11. 분석 리포트 (Python)

- `analysis/export.py`: `/api/export`를 호출해 로컬 CSV/JSON으로 저장.
- `analysis/analyze.py`: pandas로 데이터 적재, plotly로 다음을 포함한 인터랙티브
  단일 HTML(`report.html`) 생성:
  - 동/층/복도별 속도 히트맵
  - 통신사별 다운로드/업로드/핑 비교 박스플롯
  - 시간대별(시간/요일) 속도 패턴 라인차트
  - 실내 vs 외부 비교
- 실시간 대시보드는 범위 밖(필요할 때 수동 실행하는 정적 리포트로 충분).

## 12. 배포

- Cloudflare Workers + D1, `wrangler`로 배포.
- GitHub 저장소: `https://github.com/minigu5/dorm_network_check` (기존 커밋 없음,
  로컬 repo를 그대로 push).
- 커스텀 도메인: `dorm.omm.run` (사용자 소유 도메인, Cloudflare Workers Custom
  Domains로 연결. `wrangler.toml`에 route 설정).
- 배포 전 설정 필요한 값(코드 내 상수 또는 wrangler 환경변수):
  - 기숙사 건물 중심 좌표(위도/경도)
  - geofence 반경(입소 시간대: 40m)
  - `/api/export` 보호용 비밀 키
  - SKT/KT/LGU+ 모바일 ASN 화이트리스트(배포 전 실측으로 검증 필요 — 실제
    `asOrganization` 값이 예상과 다를 수 있으므로 초기 배포 후 로그로 확인해 조정)

## 13. 테스트 계획

- 배포 직후 본인 기기(Android/iPhone 각 1대)로 다음 케이스를 직접 실행해 확인:
  - WiFi 연결 상태로 접속 → 1단계에서 바로 차단되는지.
  - 모바일 데이터 + 입소 시간대 + 실내 → 3-a 폼(동/층/호실/복도)이 뜨는지,
    최종 확인 화면을 거쳐야 측정이 시작되는지, `location_tag=실내`로 저장되는지.
  - 모바일 데이터 + 외부(또는 입소 시간대 밖) → 3-b 화면(자유 설명만)이 뜨는지,
    `location_tag=외부`로 저장되는지.
  - 위치 권한 거부 → 3-b로 진행하고 `location_tag=미확인`으로 저장되는지.
- 그 후 기숙사 친구들에게 링크 공유.

## 14. 범위 밖(Out of scope)

- 실시간 웹 대시보드(정적 리포트로 대체).
- 패킷 단위의 정확한 손실률 측정(HTTP 기반 한계로 근사치만 제공).
- 통신사 자동 감지(브라우저 API 부재로 수동 선택 유지).
