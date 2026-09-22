# 기숙사 모바일 데이터 속도 측정 시스템

기숙사 거주자의 모바일 데이터(LTE/5G) 속도를 동/층/복도/호실, 통신사, 시간대별로
측정·수집하고 분석하는 시스템. 설계 문서는
`docs/superpowers/specs/2026-09-22-dorm-mobile-speed-design.md` 참고.

## 개발

```bash
npm install
npm test
npm run db:migrate:local  # 로컬 D1에 스키마 적용(안 하면 /api/submit이 로컬에서 실패함)
npm run dev
```

`wrangler.toml`에는 커스텀 도메인 라우트를 두지 않았다(아래 배포 7단계 참고).
그래서 `npm run dev`는 어떤 라우트 검증도 거치지 않고 로컬 Miniflare 서버를
바로 띄우며, Cloudflare 대시보드에서 도메인을 미리 연결해두지 않아도 정상적으로
실행된다.

## 배포 (최초 1회)

1. `npx wrangler login`
2. `npx wrangler d1 create dorm_network_check` 실행 후 출력된 `database_id`를
   `wrangler.toml`의 `REPLACE_WITH_D1_DATABASE_ID`에 붙여넣는다.
3. `wrangler.toml`의 `DORM_LAT`/`DORM_LNG`는 이미 기숙사 건물 좌표(35.844103,
   128.625689)로 채워져 있음. 건물이 넓거나 좌표가 실제 중심과 다르면 재측량해서
   조정한다.
4. `npx wrangler secret put EXPORT_SECRET` 실행해 `/api/export` 보호용 비밀 키를 등록한다.
5. `npm run db:migrate:remote`로 원격 D1에 스키마를 적용한다.
6. `npm run deploy`로 배포한다(`wrangler deploy`, 단일 환경이므로 `--env` 불필요).
7. Cloudflare 대시보드 → Workers & Pages → `dorm-network-check` Worker 선택 →
   Settings → Domains & Routes(대시보드 버전에 따라 "Triggers"로 표기되기도 함) →
   Add Custom Domain에서 `dorm.omm.run`을 입력해 연결한다. 이 도메인은 이미 같은
   계정의 Cloudflare DNS에 등록되어 있으므로(설계 문서 참고) `wrangler.toml`에
   라우트를 설정할 필요 없이 대시보드에서 최초 1회만 연결하면 된다.
8. 본인 기기로 접속해 WiFi 차단, 실내/외부 분기, 최종 확인 화면, 제출까지 직접
   확인한다(스펙 §13 테스트 계획).
9. **배포 후 필수 점검:** `src/config.ts`의 `MOBILE_CARRIER_ORG_KEYWORDS`가 실제
   `asOrganization` 값과 맞는지 확인한다. Cloudflare 대시보드의 Workers 로그(또는
   임시로 `network_org` 컬럼 확인)로 실제 접속 시 찍히는 값을 보고 필요하면 키워드를
   추가/수정한 뒤 재배포한다. **특히 기숙사 자체 WiFi로 접속했을 때 찍히는
   `network_org` 값을 반드시 확인해서, 그 값이 목록의 어떤 키워드와도 일치하지
   않는지 검증할 것** — 만약 일치한다면(예: 기숙사 WiFi가 SK브로드밴드/LG데이콤 등
   유선 사업자 회선을 쓰는 경우) 그 키워드를 즉시 목록에서 제거해야 한다. 그렇지
   않으면 WiFi 접속이 모바일 데이터로 오판정되어 WiFi 차단(스펙 §4)이 무력화된다.

## 분석 리포트 생성

```bash
cd analysis
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python export.py https://dorm.omm.run <EXPORT_SECRET>
python analyze.py measurements.csv
# report.html 생성됨, 브라우저로 열어서 확인
```
