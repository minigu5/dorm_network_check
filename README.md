# 기숙사 모바일 데이터 속도 측정 시스템

기숙사 거주자의 모바일 데이터(LTE/5G) 속도를 동/층/복도/호실, 통신사, 시간대별로
측정·수집하고 분석하는 시스템. 설계 문서는
`docs/superpowers/specs/2026-09-22-dorm-mobile-speed-design.md` 참고.

## 개발

```bash
npm install
npm test
npm run dev
```

`npm run dev`는 `wrangler.toml`의 기본(top-level) 설정으로 로컬 Miniflare 서버를
띄운다. 커스텀 도메인(`dorm.omm.run`) 라우트는 `env.production`에만 정의되어
있으므로, 로컬 개발 시에는 Cloudflare 대시보드에서 도메인을 미리 연결해두지
않아도 `wrangler dev`가 정상적으로 실행된다.

## 배포 (최초 1회)

1. `npx wrangler login`
2. `npx wrangler d1 create dorm_network_check` 실행 후 출력된 `database_id`를
   `wrangler.toml`의 `REPLACE_WITH_D1_DATABASE_ID`에 붙여넣는다.
3. `wrangler.toml`의 `DORM_LAT`/`DORM_LNG`는 이미 기숙사 건물 좌표(35.844103,
   128.625689)로 채워져 있음. 건물이 넓거나 좌표가 실제 중심과 다르면 재측량해서
   조정한다.
4. `npx wrangler secret put EXPORT_SECRET` 실행해 `/api/export` 보호용 비밀 키를 등록한다.
5. `npm run db:migrate:remote`로 원격 D1에 스키마를 적용한다.
6. `npm run deploy`로 배포한다. 이 스크립트는 내부적으로
   `wrangler deploy --env production`을 실행하며, `wrangler.toml`의
   `[env.production]` 섹션에 정의된 `dorm.omm.run` 커스텀 도메인 라우트가 이
   시점에만 적용된다(로컬 `wrangler dev`에는 영향 없음).
7. Cloudflare 대시보드에서 Workers 프로젝트에 커스텀 도메인 `dorm.omm.run`을 연결한다
   (DNS가 이미 Cloudflare에 있다면 `wrangler.toml`의 `[env.production].routes` 설정으로
   자동 연결됨).
8. 본인 기기로 접속해 WiFi 차단, 실내/외부 분기, 최종 확인 화면, 제출까지 직접
   확인한다(스펙 §13 테스트 계획).
9. **배포 후 필수 점검:** `src/config.ts`의 `MOBILE_CARRIER_ORG_KEYWORDS`가 실제
   `asOrganization` 값과 맞는지 확인한다. Cloudflare 대시보드의 Workers 로그(또는
   임시로 `network_org` 컬럼 확인)로 실제 접속 시 찍히는 값을 보고 필요하면 키워드를
   추가/수정한 뒤 재배포한다.

## 분석 리포트 생성

```bash
cd analysis
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python export.py https://dorm.omm.run <EXPORT_SECRET>
python analyze.py measurements.csv
# report.html 생성됨, 브라우저로 열어서 확인
```
