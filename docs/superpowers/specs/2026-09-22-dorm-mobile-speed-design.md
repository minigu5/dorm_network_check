# 기숙사 모바일 데이터 속도 측정/분석 시스템 설계

## 1. 목적

기숙사 거주자들의 모바일 데이터(LTE/5G) 속도를 동/층/복도/호실, 통신사, 시간대별로
측정·수집하여, 신호 약점 지역을 파악하고 학교/통신사에 개선을 요구할 근거 자료를
만든다.

## 2. 전체 아키텍처

```
[휴대폰 브라우저]
  --GPS 권한 요청, 측정 실행, 폼 입력--> [Cloudflare Worker]
                                              |
                                     asOrganization/asn 확인 (WiFi 차단)
                                     GPS geofence + 시간대 판정
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

## 3. WiFi 차단 (모바일 데이터만 유효)

브라우저 JS의 Network Information API는 Android 일부에서만 동작하고 iOS Safari는
지원하지 않아 신뢰할 수 없음. 대신 서버 측에서 Cloudflare가 요청마다 제공하는
`request.cf.asOrganization`/`request.cf.asn` (접속 IP의 네트워크 사업자 정보)을
사용해 판정한다.

- `POST /api/submit` 요청 시 `asOrganization`이 SKT/KT/LG U+ 모바일망 ASN
  화이트리스트에 없으면 400으로 거부.
- 알뜰폰(MVNO)은 망을 임대하는 원 사업자(SKT/KT/LGU+)의 ASN으로 잡히므로
  화이트리스트에 자동 포함됨.
- 클라이언트가 이 판정을 조작할 수 없음(브라우저를 거치지 않고 Cloudflare가 실제
  접속 경로로 판정).
- 한계: VPN 사용 등 극소수 예외 케이스는 오탐 가능. 실용적 목적상 허용.

## 4. 위치(실내/외부) 판정

### 4-1. GPS geofence
- 클라이언트에서 Geolocation API로 위도/경도/정확도(accuracy) 획득 후 서버에 전송.
- 서버가 기숙사 건물 중심 좌표와의 거리를 계산(Haversine)하여 반경 이내면
  `raw_location_tag = 실내`, 아니면 `외부`.
- 위치 권한 거부 시 `raw_location_tag = 미확인`으로 저장하고, 분석 시 해당 행은
  제외한다(제출 자체는 허용).

### 4-2. 입소 시간대 및 GPS 관용 반경
- 입소 인정 시간대(하루 기준, KST): **23:10~07:20**(자정 경과 포함), **18:05~18:55**.
- 입소 시간대 안에서는 기숙사 밖으로 나갈 수 없으므로 GPS 판정을 관대하게 하여
  반경 **40m**를 사용(건물 오차/학교와 기숙사가 인접해 있는 점 감안).
- 입소 시간대 밖에서는 GPS가 실내를 가리켜도 `실내` 판정을 신뢰하지 않는다(등교
  중 잠시 들른 경우 등을 배제하기 위함).

### 4-3. 최종 판정 로직 (서버, `created_at` 기준)
```
raw = GPS geofence 판정 (실내 / 외부 / 미확인)

if 현재시각이 입소시간대(23:10~07:20 또는 18:05~18:55) 안:
    location_tag = raw            # GPS 그대로 신뢰 (반경 40m 관용)
else:
    if raw == "실내":
        location_tag = "외부"      # 시간대 밖이면 실내 판정 무효화
    else:
        location_tag = raw         # 외부/미확인은 그대로 유지
```
- "외부" 데이터도 거부하지 않고 그대로 저장한다(학생마다 요금제가 달라 교내/외
  비교가 필요하므로 유효한 분석 축으로 사용).

## 5. 데이터 수집 폼 필드

- 동(dong), 층(floor), 호실(room), 복도(corridor): 사용자 텍스트 입력.
- 통신사(carrier): 드롭다운 (SKT / KT / LG U+ / 알뜰폰 / 기타).
- 시간(created_at), OS(User-Agent 파싱): 자동 수집.
- 위치(lat/lng/accuracy): Geolocation API로 자동 수집(권한 필요).

## 6. D1 스키마

```sql
CREATE TABLE measurements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,          -- 서버 KST 타임스탬프 (ISO 8601)
  lat REAL, lng REAL, accuracy_m REAL,
  raw_location_tag TEXT,             -- GPS geofence 원본 판정: 실내/외부/미확인
  is_curfew_window INTEGER,          -- 0/1
  location_tag TEXT NOT NULL,        -- 최종 판정: 실내/외부/미확인
  dong TEXT, floor TEXT, room TEXT, corridor TEXT,
  carrier TEXT NOT NULL,             -- SKT/KT/LGU+/알뜰/기타
  network_org TEXT,                  -- Cloudflare asOrganization (감사/디버깅용)
  os TEXT,                           -- User-Agent 파싱 결과
  download_mbps REAL, upload_mbps REAL,
  ping_ms REAL, jitter_ms REAL,
  packet_loss_pct REAL,
  raw_samples TEXT                   -- JSON, 개별 ping/download/upload 원시 샘플
);
```

## 7. API 명세

- `GET /` — 측정 페이지 서빙. 로드 시 자체적으로 asOrganization 판정 결과를 표시,
  WiFi/타 네트워크로 판단되면 측정 버튼을 비활성화하고 안내 문구 표시.
- `GET /api/download?size=N` — N바이트 랜덤 데이터 스트리밍(다운로드 측정용).
- `POST /api/upload` — 요청 바디 수신 후 폐기(클라이언트가 elapsed time 측정).
- `GET /api/ping` — 최소 응답(RTT/지터/패킷로스 측정용, 클라이언트가 반복 호출).
- `POST /api/submit`:
  1. `request.cf.asOrganization`으로 WiFi/타 네트워크 여부 확인 → 아니면 400 거부.
  2. GPS 좌표로 `raw_location_tag` 계산.
  3. 서버 시각으로 `is_curfew_window` 계산, 최종 `location_tag` 확정.
  4. D1에 insert.
- `GET /api/export?key=...` — 전체 데이터 CSV/JSON 반환(분석용, 비밀 쿼리 파라미터로
  보호).

## 8. 측정 알고리즘 (클라이언트 JS)

- **다운로드**: `/api/download?size=N`을 크기를 늘려가며(1MB→5MB→20MB) 순차 fetch,
  각 구간 elapsed time으로 Mbps 계산 후 마지막 2~3구간 평균 사용(초기 TCP
  슬로우스타트 왜곡 배제).
- **업로드**: 랜덤 Blob(5MB) 생성해 `/api/upload`로 POST, 시작~응답 도착까지
  elapsed로 Mbps 계산.
- **핑/지터**: `/api/ping` 20회 반복 호출, RTT 배열 수집 → 평균 = `ping_ms`,
  평균절대편차 = `jitter_ms`.
- **패킷로스 추정**: 위 20회 중 타임아웃(3초) 또는 실패 요청 비율 = `packet_loss_pct`.
  한계: HTTP/TCP 기반이라 실제 패킷 손실이 아닌 재전송/타임아웃 비율의 근사치이며,
  UI에 "추정치"임을 명시한다.
- 측정 완료 후 각 단계 원시 배열을 `raw_samples`(JSON)에 함께 저장해 사후 재계산이
  가능하게 한다.

## 9. 분석 리포트 (Python)

- `analysis/export.py`: `/api/export`를 호출해 로컬 CSV/JSON으로 저장.
- `analysis/analyze.py`: pandas로 데이터 적재, plotly로 다음을 포함한 인터랙티브
  단일 HTML(`report.html`) 생성:
  - 동/층/복도별 속도 히트맵
  - 통신사별 다운로드/업로드/핑 비교 박스플롯
  - 시간대별(시간/요일) 속도 패턴 라인차트
  - 실내 vs 외부 비교
- 실시간 대시보드는 범위 밖(필요할 때 수동 실행하는 정적 리포트로 충분).

## 10. 배포

- Cloudflare Workers + D1, `wrangler`로 배포.
- 배포 전 설정 필요한 값(코드 내 상수 또는 wrangler 환경변수):
  - 기숙사 건물 중심 좌표(위도/경도)
  - geofence 반경(입소 시간대: 40m)
  - `/api/export` 보호용 비밀 키
  - SKT/KT/LGU+ 모바일 ASN 화이트리스트(배포 전 실측으로 검증 필요 — 실제
    `asOrganization` 값이 예상과 다를 수 있으므로 초기 배포 후 로그로 확인해 조정)

## 11. 테스트 계획

- 배포 직후 본인 기기(Android/iPhone 각 1대)로 실내(입소 시간대)/외부/WiFi 연결
  3가지 케이스를 직접 제출해 `location_tag`와 WiFi 차단이 의도대로 동작하는지 확인.
- 그 후 기숙사 친구들에게 링크 공유.

## 12. 범위 밖(Out of scope)

- 실시간 웹 대시보드(정적 리포트로 대체).
- 패킷 단위의 정확한 손실률 측정(HTTP 기반 한계로 근사치만 제공).
- 통신사 자동 감지(브라우저 API 부재로 수동 선택 유지).
