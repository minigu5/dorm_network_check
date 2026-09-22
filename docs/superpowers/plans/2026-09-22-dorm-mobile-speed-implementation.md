# 기숙사 모바일 데이터 속도 측정 시스템 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cloudflare Worker + D1로 기숙사 모바일 데이터 속도를 자동 측정·수집하고, Python으로 층/복도/통신사/시간대별 분석 리포트를 생성하는 시스템을 만든다.

**Architecture:** 단일 Cloudflare Worker(TypeScript)가 정적 페이지(public/) 서빙 + 측정 API + D1 저장을 담당. 클라이언트는 접속 시 네트워크(WiFi 차단)·위치(실내/외부) 판정을 먼저 거친 뒤 사용자 확인을 받고 나서만 실제 속도 측정을 실행한다. 서버는 클라이언트의 판정을 다시 검증해 최종 저장한다. 분석은 별도 로컬 Python 스크립트(pandas + plotly)가 `/api/export`로 데이터를 받아 정적 HTML 리포트를 만든다.

**Tech Stack:** Cloudflare Workers (TypeScript), Cloudflare D1 (SQLite), Wrangler CLI, Vitest + `@cloudflare/vitest-pool-workers`, Pico.css(CDN, 장식 없는 클래스리스 프레임워크), Python 3 + pandas + plotly (분석 전용).

**Spec:** `docs/superpowers/specs/2026-09-22-dorm-mobile-speed-design.md`

## Global Constraints

- 모바일 데이터(SKT/KT/LGU+)로 접속한 경우만 유효. WiFi/기타망은 접속 즉시(§3 1단계, `GET /api/network-check`)와 제출 시(`POST /api/submit`) 두 번 서버에서 `request.cf.asOrganization`으로 차단한다. 클라이언트 판정은 UX 안내용일 뿐 최종 근거가 아니다.
- 위치 판정: GPS geofence(Haversine) + 입소 시간대. 입소 인정 시간대는 **23:10~07:20**(자정 경과 포함)과 **18:05~18:55**(KST). 입소 시간대 안에서는 geofence 반경 **40m**(관대), 그 외 시간대는 반경 **25m**(기본)를 사용하고, 시간대 밖에서 raw 판정이 `실내`면 최종 `location_tag`는 무조건 `외부`로 강제한다.
- 위치 권한 거부 시 `raw_location_tag = 미확인`, 외부와 동일한 입력 화면으로 진행. 제출 자체는 막지 않되 분석에서 제외.
- 폼 필드 분기: `location_tag`가 `실내`면 동/층/호실/복도 필수 입력, 그 외(`외부`/`미확인`)면 그 필드들 없이 선택적 자유 설명(`note`)만 받는다.
- "외부" 데이터는 거부하지 않고 그대로 저장(요금제별 교내/외 비교용 유효 데이터).
- 측정 5종: 다운로드, 업로드, 핑, 지터, 패킷로스(추정치, HTTP 기반 한계 명시).
- 실제 측정은 §3 4단계 "최종 확인 화면"에서 사용자가 승인한 뒤에만 시작한다.
- UI는 장식 최소화: 그라데이션/이모지/화려한 애니메이션 금지. 가벼운 클래스리스 CSS 프레임워크(Pico.css, cdnjs) 하나만 CDN으로 불러와 사용하고 커스텀 디자인을 만들지 않는다.
- UI는 모바일 환경 최적화 필수(실사용자는 전부 휴대폰 브라우저): `viewport` 메타 태그, 항상 1단 세로 레이아웃(가로 스크롤/멀티 컬럼 금지), 터치하기 쉬운 버튼/입력 크기, 확대 없이 읽히는 폰트 크기. 데스크톱 전용 레이아웃 금지.
- GitHub 저장소: `https://github.com/minigu5/dorm_network_check` (기존 커밋 없음, 이미 로컬 repo와 연결·push 완료).
- 커스텀 도메인: `dorm.omm.run` (Cloudflare Workers Custom Domain).
- 분석 리포트는 정적 인터랙티브 HTML 하나(`report.html`, plotly). 실시간 대시보드는 범위 밖.

---

## File Structure

```
wrangler.toml                    # Worker 설정, D1 바인딩, assets, custom domain route
package.json / tsconfig.json     # Worker 프로젝트 설정
vitest.config.ts                 # @cloudflare/vitest-pool-workers 설정
migrations/0001_create_measurements.sql
src/
  index.ts                       # 라우터: /api/* 는 핸들러로, 나머지는 ASSETS로 위임
  env.ts                         # Env 인터페이스 (DB, ASSETS, DORM_LAT, DORM_LNG, EXPORT_SECRET)
  config.ts                      # 시간대/반경/통신사 키워드 등 프로젝트 상수
  lib/
    geo.ts                       # haversineDistanceMeters, isWithinGeofence
    curfew.ts                    # isCurfewWindow, resolveLocationTag
    network.ts                   # isMobileCarrierOrg, getCfProperties
    userAgent.ts                 # parseOS
    stats.ts                     # computeThroughputMbps, computePingStats
    db.ts                        # insertMeasurement, exportAllMeasurements
  handlers/
    networkCheck.ts              # GET /api/network-check
    download.ts                  # GET /api/download
    upload.ts                    # POST /api/upload
    ping.ts                      # GET /api/ping
    submit.ts                    # POST /api/submit
    export.ts                    # GET /api/export
test/
  lib/geo.test.ts
  lib/curfew.test.ts
  lib/network.test.ts
  lib/userAgent.test.ts
  lib/stats.test.ts
  lib/db.test.ts
  handlers/networkCheck.test.ts
  handlers/download.test.ts
  handlers/upload.test.ts
  handlers/ping.test.ts
  handlers/submit.test.ts
  handlers/export.test.ts
public/
  index.html                    # 측정 페이지 shell (Pico.css CDN 링크)
  app.js                        # §3 플로우 전체(네트워크확인→위치→분기입력→확인→측정→제출)
  stats-client.js               # stats.ts와 동일한 계산 로직의 브라우저용 사본(빌드 없이 <script>로 로드)
analysis/
  requirements.txt
  export.py
  analyze.py
  test_analyze.py
README.md
```

**분리 이유:** `lib/`의 각 파일은 순수 함수 하나의 책임만 가져 단위 테스트가 쉽다. `handlers/`는 각 API 엔드포인트 하나씩 담당해 `index.ts` 라우터가 얇게 유지된다. `db.ts`는 D1 접근을 한 곳에 모아 스키마 변경 시 여기만 고치면 된다. 프론트는 빌드 도구 없이 정적 파일 두 개(`index.html`, `app.js`)로 유지해 배포를 단순하게 한다. `stats-client.js`는 Node용 `stats.ts`와 로직이 100% 같아야 하므로, Task 6에서 두 파일을 나란히 만들고 값이 같은지 확인하는 테스트를 둔다.

---

### Task 1: 프로젝트 스캐폴딩 (Wrangler + D1 + Vitest)

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `wrangler.toml`
- Create: `vitest.config.ts`
- Create: `src/env.ts`
- Create: `src/index.ts`
- Create: `migrations/0001_create_measurements.sql`
- Test: `test/smoke.test.ts`

**Interfaces:**
- Produces: `Env` 인터페이스(`DB: D1Database`, `ASSETS: Fetcher`, `DORM_LAT: string`, `DORM_LNG: string`, `EXPORT_SECRET: string`), 뒤 모든 태스크가 이 타입을 import해서 씀.
- Produces: `src/index.ts`의 기본 `export default { fetch(request, env, ctx) { ... } }` — 뒤 태스크들이 라우팅 분기를 추가해나감.

- [ ] **Step 1: 패키지/설정 파일 작성**

`package.json`:
```json
{
  "name": "dorm-network-check",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "db:migrate:local": "wrangler d1 migrations apply dorm_network_check --local",
    "db:migrate:remote": "wrangler d1 migrations apply dorm_network_check --remote"
  },
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "^0.5.0",
    "@cloudflare/workers-types": "^4.20240925.0",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "wrangler": "^3.78.0"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types", "vitest/globals"],
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "include": ["src", "test", "vitest.config.ts"]
}
```

`wrangler.toml` (D1 `database_id`는 Step 2에서 채움):
```toml
name = "dorm-network-check"
main = "src/index.ts"
compatibility_date = "2024-09-23"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "dorm_network_check"
database_id = "REPLACE_WITH_D1_DATABASE_ID"
migrations_dir = "migrations"

[assets]
directory = "public"
binding = "ASSETS"

[vars]
DORM_LAT = "35.844103"
DORM_LNG = "128.625689"

[[routes]]
pattern = "dorm.omm.run/*"
custom_domain = true
```

`vitest.config.ts`:
```ts
import { defineWorkersConfig } from "@cloudflare/vitest-pool-workers/config";

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: { configPath: "./wrangler.toml" },
      },
    },
  },
});
```

`src/env.ts`:
```ts
export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  DORM_LAT: string;
  DORM_LNG: string;
  EXPORT_SECRET: string;
}
```

`src/index.ts`:
```ts
import type { Env } from "./env";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      return new Response("Not Found", { status: 404 });
    }
    return env.ASSETS.fetch(request);
  },
};
```

`migrations/0001_create_measurements.sql`:
```sql
CREATE TABLE measurements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  lat REAL,
  lng REAL,
  accuracy_m REAL,
  raw_location_tag TEXT NOT NULL,
  is_curfew_window INTEGER NOT NULL,
  location_tag TEXT NOT NULL,
  dong TEXT,
  floor TEXT,
  room TEXT,
  corridor TEXT,
  note TEXT,
  carrier TEXT NOT NULL,
  network_org TEXT,
  os TEXT,
  download_mbps REAL NOT NULL,
  upload_mbps REAL NOT NULL,
  ping_ms REAL NOT NULL,
  jitter_ms REAL NOT NULL,
  packet_loss_pct REAL NOT NULL,
  raw_samples TEXT
);
```

`public/index.html` (플레이스홀더, Task 15에서 채움):
```html
<!doctype html><html><body>placeholder</body></html>
```

- [ ] **Step 2: 의존성 설치 및 D1 데이터베이스 생성**

```bash
npm install
npx wrangler login
npx wrangler d1 create dorm_network_check
```

출력된 `database_id`를 `wrangler.toml`의 `REPLACE_WITH_D1_DATABASE_ID`에 붙여넣는다.

- [ ] **Step 3: 스모크 테스트 작성**

`test/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext, SELF } from "cloudflare:test";

describe("worker smoke test", () => {
  it("responds to /api/unknown with 404", async () => {
    const response = await SELF.fetch("https://example.com/api/unknown");
    expect(response.status).toBe(404);
  });
});
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `npm test`
Expected: PASS (1 test)

- [ ] **Step 5: 커밋**

```bash
git add package.json tsconfig.json wrangler.toml vitest.config.ts src/env.ts src/index.ts migrations public/index.html test/smoke.test.ts
git commit -m "chore: scaffold Cloudflare Worker project with D1 and vitest"
```

---

### Task 2: `geo.ts` — GPS 거리/geofence 계산

**Files:**
- Create: `src/lib/geo.ts`
- Test: `test/lib/geo.test.ts`

**Interfaces:**
- Produces: `haversineDistanceMeters(lat1, lng1, lat2, lng2): number`, `isWithinGeofence(lat, lng, centerLat, centerLng, radiusM): boolean`. Task 12(submit 핸들러)에서 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/lib/geo.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { haversineDistanceMeters, isWithinGeofence } from "../../src/lib/geo";

describe("haversineDistanceMeters", () => {
  it("returns 0 for identical points", () => {
    expect(haversineDistanceMeters(37.5, 127.0, 37.5, 127.0)).toBeCloseTo(0, 3);
  });

  it("returns ~157km between Seoul and Busan-ish coords", () => {
    // 서울시청(37.5665, 126.9780) ~ 대전시청(36.3504, 127.3845) 대략 141km
    const d = haversineDistanceMeters(37.5665, 126.978, 36.3504, 127.3845);
    expect(d).toBeGreaterThan(140000);
    expect(d).toBeLessThan(145000);
  });
});

describe("isWithinGeofence", () => {
  const center = { lat: 37.5, lng: 127.0 };

  it("returns true when within radius", () => {
    // 위도 0.0001도 ~= 11m 이동
    expect(isWithinGeofence(37.5001, 127.0, center.lat, center.lng, 40)).toBe(true);
  });

  it("returns false when outside radius", () => {
    // 위도 0.01도 ~= 1.1km 이동
    expect(isWithinGeofence(37.51, 127.0, center.lat, center.lng, 40)).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- geo.test.ts`
Expected: FAIL with "Cannot find module '../../src/lib/geo'"

- [ ] **Step 3: 구현**

`src/lib/geo.ts`:
```ts
const EARTH_RADIUS_M = 6371000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function haversineDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

export function isWithinGeofence(
  lat: number,
  lng: number,
  centerLat: number,
  centerLng: number,
  radiusM: number
): boolean {
  return haversineDistanceMeters(lat, lng, centerLat, centerLng) <= radiusM;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- geo.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/geo.ts test/lib/geo.test.ts
git commit -m "feat: add haversine distance and geofence check"
```

---

### Task 3: `curfew.ts` — 입소 시간대 및 최종 위치 판정

**Files:**
- Create: `src/config.ts`
- Create: `src/lib/curfew.ts`
- Test: `test/lib/curfew.test.ts`

**Interfaces:**
- Consumes: 없음(순수 함수, `Date` 입력).
- Produces: `CURFEW_WINDOWS`, `CURFEW_RADIUS_M`, `DEFAULT_RADIUS_M`, `MOBILE_CARRIER_ORG_KEYWORDS` (`src/config.ts`). `isCurfewWindow(date: Date): boolean`, `type RawLocationTag = "실내" | "외부" | "미확인"`, `resolveLocationTag(raw: RawLocationTag, isCurfew: boolean): RawLocationTag` (`src/lib/curfew.ts`). Task 12에서 사용.

- [ ] **Step 1: 설정 파일 작성**

`src/config.ts`:
```ts
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
```

- [ ] **Step 2: 실패하는 테스트 작성**

`test/lib/curfew.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { isCurfewWindow, resolveLocationTag } from "../../src/lib/curfew";

function kstDate(hour: number, minute: number): Date {
  // KST(UTC+9) 기준 시각을 만들기 위해 UTC로 변환해서 Date 생성
  const utcHour = hour - 9;
  return new Date(Date.UTC(2026, 0, 1, utcHour, minute));
}

describe("isCurfewWindow", () => {
  it("23:30은 입소 시간대", () => {
    expect(isCurfewWindow(kstDate(23, 30))).toBe(true);
  });
  it("03:00은 입소 시간대(자정 경과)", () => {
    expect(isCurfewWindow(kstDate(3, 0))).toBe(true);
  });
  it("18:30은 입소 시간대", () => {
    expect(isCurfewWindow(kstDate(18, 30))).toBe(true);
  });
  it("14:00은 입소 시간대 아님", () => {
    expect(isCurfewWindow(kstDate(14, 0))).toBe(false);
  });
  it("07:21은 입소 시간대 아님", () => {
    expect(isCurfewWindow(kstDate(7, 21))).toBe(false);
  });
  it("23:09는 입소 시간대 아님", () => {
    expect(isCurfewWindow(kstDate(23, 9))).toBe(false);
  });
});

describe("resolveLocationTag", () => {
  it("입소 시간대 안이면 raw 그대로", () => {
    expect(resolveLocationTag("실내", true)).toBe("실내");
    expect(resolveLocationTag("외부", true)).toBe("외부");
    expect(resolveLocationTag("미확인", true)).toBe("미확인");
  });
  it("입소 시간대 밖이고 raw가 실내면 외부로 강제", () => {
    expect(resolveLocationTag("실내", false)).toBe("외부");
  });
  it("입소 시간대 밖이고 raw가 외부/미확인이면 그대로", () => {
    expect(resolveLocationTag("외부", false)).toBe("외부");
    expect(resolveLocationTag("미확인", false)).toBe("미확인");
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npm test -- curfew.test.ts`
Expected: FAIL with "Cannot find module '../../src/lib/curfew'"

- [ ] **Step 4: 구현**

`src/lib/curfew.ts`:
```ts
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
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test -- curfew.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 6: 커밋**

```bash
git add src/config.ts src/lib/curfew.ts test/lib/curfew.test.ts
git commit -m "feat: add curfew window and final location tag resolution logic"
```

---

### Task 4: `network.ts` — WiFi/모바일망 판정

**Files:**
- Create: `src/lib/network.ts`
- Test: `test/lib/network.test.ts`

**Interfaces:**
- Consumes: `MOBILE_CARRIER_ORG_KEYWORDS` (`src/config.ts`, Task 3에서 생성).
- Produces: `getCfProperties(request: Request): { asn: number | null; asOrganization: string | null }`, `isMobileCarrierOrg(asOrganization: string | null): boolean`. Task 8, 12에서 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/lib/network.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { getCfProperties, isMobileCarrierOrg } from "../../src/lib/network";

describe("isMobileCarrierOrg", () => {
  it("SK Telecom 계열은 모바일망으로 판정", () => {
    expect(isMobileCarrierOrg("SK Telecom Co., Ltd.")).toBe(true);
  });
  it("KT 계열은 모바일망으로 판정", () => {
    expect(isMobileCarrierOrg("KT Corporation")).toBe(true);
  });
  it("LG Uplus 계열은 모바일망으로 판정", () => {
    expect(isMobileCarrierOrg("LG Uplus Corp")).toBe(true);
  });
  it("대소문자 무시", () => {
    expect(isMobileCarrierOrg("sk telecom co")).toBe(true);
  });
  it("학교/기타망은 false", () => {
    expect(isMobileCarrierOrg("Some University Network")).toBe(false);
  });
  it("null은 false", () => {
    expect(isMobileCarrierOrg(null)).toBe(false);
  });
});

describe("getCfProperties", () => {
  it("request.cf에서 asn/asOrganization을 읽는다", () => {
    const req = new Request("https://example.com/", {
      cf: { asn: 9318, asOrganization: "SK Telecom" },
    } as RequestInit);
    const props = getCfProperties(req);
    expect(props.asn).toBe(9318);
    expect(props.asOrganization).toBe("SK Telecom");
  });

  it("cf가 없으면 null을 반환", () => {
    const req = new Request("https://example.com/");
    const props = getCfProperties(req);
    expect(props.asn).toBeNull();
    expect(props.asOrganization).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- network.test.ts`
Expected: FAIL with "Cannot find module '../../src/lib/network'"

- [ ] **Step 3: 구현**

`src/lib/network.ts`:
```ts
import { MOBILE_CARRIER_ORG_KEYWORDS } from "../config";

export function getCfProperties(request: Request): {
  asn: number | null;
  asOrganization: string | null;
} {
  const cf = (request as Request & { cf?: IncomingRequestCfProperties }).cf;
  return {
    asn: cf?.asn ?? null,
    asOrganization: cf?.asOrganization ?? null,
  };
}

export function isMobileCarrierOrg(asOrganization: string | null): boolean {
  if (!asOrganization) return false;
  const lower = asOrganization.toLowerCase();
  return MOBILE_CARRIER_ORG_KEYWORDS.some((keyword) => lower.includes(keyword));
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- network.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/network.ts test/lib/network.test.ts
git commit -m "feat: add WiFi/mobile carrier detection via Cloudflare cf properties"
```

---

### Task 5: `userAgent.ts` — OS 파싱

**Files:**
- Create: `src/lib/userAgent.ts`
- Test: `test/lib/userAgent.test.ts`

**Interfaces:**
- Produces: `parseOS(userAgent: string | null): "iOS" | "Android" | "Other"`. Task 12에서 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/lib/userAgent.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseOS } from "../../src/lib/userAgent";

describe("parseOS", () => {
  it("iPhone UA는 iOS", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15";
    expect(parseOS(ua)).toBe("iOS");
  });
  it("Android UA는 Android", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36";
    expect(parseOS(ua)).toBe("Android");
  });
  it("그 외/null은 Other", () => {
    expect(parseOS("curl/8.0")).toBe("Other");
    expect(parseOS(null)).toBe("Other");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- userAgent.test.ts`
Expected: FAIL with "Cannot find module '../../src/lib/userAgent'"

- [ ] **Step 3: 구현**

`src/lib/userAgent.ts`:
```ts
export function parseOS(userAgent: string | null): "iOS" | "Android" | "Other" {
  if (!userAgent) return "Other";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iOS";
  if (/Android/i.test(userAgent)) return "Android";
  return "Other";
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- userAgent.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/userAgent.ts test/lib/userAgent.test.ts
git commit -m "feat: add User-Agent OS parsing"
```

---

### Task 6: `stats.ts` — 측정값 계산 로직 (서버/클라이언트 공용)

**Files:**
- Create: `src/lib/stats.ts`
- Create: `public/stats-client.js`
- Test: `test/lib/stats.test.ts`

**Interfaces:**
- Produces: `computeThroughputMbps(bytes: number, elapsedMs: number): number`, `computePingStats(samples: Array<number | null>): { ping_ms: number; jitter_ms: number; packet_loss_pct: number }` (`src/lib/stats.ts`, TypeScript/Node 테스트용, Task 12 export 검증에서 참고). `public/stats-client.js`는 브라우저에서 그대로 `<script>`로 로드하는 동일 로직의 순수 JS 버전(빌드 없음), Task 15에서 `app.js`가 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/lib/stats.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeThroughputMbps, computePingStats } from "../../src/lib/stats";

describe("computeThroughputMbps", () => {
  it("1MB를 1000ms에 받으면 약 8Mbps", () => {
    const mbps = computeThroughputMbps(1_000_000, 1000);
    expect(mbps).toBeCloseTo(8, 1);
  });
  it("elapsedMs가 0이면 0을 반환(0으로 나누기 방지)", () => {
    expect(computeThroughputMbps(1_000_000, 0)).toBe(0);
  });
});

describe("computePingStats", () => {
  it("모두 성공한 샘플의 평균/지터/손실률을 계산", () => {
    const result = computePingStats([20, 22, 19, 45]);
    expect(result.ping_ms).toBeCloseTo(26.5, 1);
    // 평균절대편차: |20-26.5|+|22-26.5|+|19-26.5|+|45-26.5| = 6.5+4.5+7.5+18.5=37 /4=9.25
    expect(result.jitter_ms).toBeCloseTo(9.25, 1);
    expect(result.packet_loss_pct).toBe(0);
  });
  it("일부 실패(null)한 샘플은 패킷로스로 집계", () => {
    const result = computePingStats([20, null, 22, null]);
    expect(result.packet_loss_pct).toBe(50);
    expect(result.ping_ms).toBeCloseTo(21, 1);
  });
  it("전부 실패하면 ping/jitter는 0, 손실률 100", () => {
    const result = computePingStats([null, null]);
    expect(result.ping_ms).toBe(0);
    expect(result.jitter_ms).toBe(0);
    expect(result.packet_loss_pct).toBe(100);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- stats.test.ts`
Expected: FAIL with "Cannot find module '../../src/lib/stats'"

- [ ] **Step 3: 구현**

`src/lib/stats.ts`:
```ts
export function computeThroughputMbps(bytes: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  const bits = bytes * 8;
  const seconds = elapsedMs / 1000;
  return bits / seconds / 1_000_000;
}

export function computePingStats(samples: Array<number | null>): {
  ping_ms: number;
  jitter_ms: number;
  packet_loss_pct: number;
} {
  const successes = samples.filter((s): s is number => s !== null);
  const failureCount = samples.length - successes.length;
  const packet_loss_pct = samples.length === 0 ? 0 : (failureCount / samples.length) * 100;

  if (successes.length === 0) {
    return { ping_ms: 0, jitter_ms: 0, packet_loss_pct };
  }

  const mean = successes.reduce((a, b) => a + b, 0) / successes.length;
  const meanAbsoluteDeviation =
    successes.reduce((a, b) => a + Math.abs(b - mean), 0) / successes.length;

  return { ping_ms: mean, jitter_ms: meanAbsoluteDeviation, packet_loss_pct };
}
```

`public/stats-client.js` (브라우저용, `src/lib/stats.ts`와 로직 동일, 빌드 없이 `<script>`로 로드):
```js
function computeThroughputMbps(bytes, elapsedMs) {
  if (elapsedMs <= 0) return 0;
  const bits = bytes * 8;
  const seconds = elapsedMs / 1000;
  return bits / seconds / 1000000;
}

function computePingStats(samples) {
  const successes = samples.filter((s) => s !== null);
  const failureCount = samples.length - successes.length;
  const packet_loss_pct = samples.length === 0 ? 0 : (failureCount / samples.length) * 100;

  if (successes.length === 0) {
    return { ping_ms: 0, jitter_ms: 0, packet_loss_pct };
  }

  const mean = successes.reduce((a, b) => a + b, 0) / successes.length;
  const meanAbsoluteDeviation =
    successes.reduce((a, b) => a + Math.abs(b - mean), 0) / successes.length;

  return { ping_ms: mean, jitter_ms: meanAbsoluteDeviation, packet_loss_pct };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- stats.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/stats.ts public/stats-client.js test/lib/stats.test.ts
git commit -m "feat: add throughput and ping statistics calculation"
```

---

### Task 7: D1 스키마 연동 — `db.ts`

**Files:**
- Create: `src/lib/db.ts`
- Test: `test/lib/db.test.ts`

**Interfaces:**
- Consumes: `Env`(Task 1), migration `0001_create_measurements.sql`(Task 1).
- Produces: `interface MeasurementInput`, `insertMeasurement(db: D1Database, m: MeasurementInput): Promise<void>`, `exportAllMeasurements(db: D1Database): Promise<Record<string, unknown>[]>`. Task 12, 13에서 사용.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/lib/db.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { insertMeasurement, exportAllMeasurements, type MeasurementInput } from "../../src/lib/db";

function sampleInput(overrides: Partial<MeasurementInput> = {}): MeasurementInput {
  return {
    created_at: "2026-09-22T14:30:00.000Z",
    lat: 37.5, lng: 127.0, accuracy_m: 15,
    raw_location_tag: "실내",
    is_curfew_window: 1,
    location_tag: "실내",
    dong: "3동", floor: "5", room: "512", corridor: "A",
    note: null,
    carrier: "SKT",
    network_org: "SK Telecom",
    os: "Android",
    download_mbps: 55.2, upload_mbps: 12.1,
    ping_ms: 28.5, jitter_ms: 4.2, packet_loss_pct: 0,
    raw_samples: JSON.stringify({ ping: [20, 30] }),
    ...overrides,
  };
}

describe("insertMeasurement / exportAllMeasurements", () => {
  beforeEach(async () => {
    await env.DB.exec("DELETE FROM measurements");
  });

  it("행을 저장하고 다시 읽을 수 있다", async () => {
    await insertMeasurement(env.DB, sampleInput());
    const rows = await exportAllMeasurements(env.DB);
    expect(rows).toHaveLength(1);
    expect(rows[0].carrier).toBe("SKT");
    expect(rows[0].location_tag).toBe("실내");
  });

  it("외부 판정 행은 dong/floor/room/corridor가 null일 수 있다", async () => {
    await insertMeasurement(
      env.DB,
      sampleInput({
        location_tag: "외부", raw_location_tag: "외부",
        dong: null, floor: null, room: null, corridor: null,
        note: "정문 앞",
      })
    );
    const rows = await exportAllMeasurements(env.DB);
    expect(rows[0].note).toBe("정문 앞");
    expect(rows[0].dong).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- db.test.ts`
Expected: FAIL with "Cannot find module '../../src/lib/db'"

- [ ] **Step 3: 로컬 D1에 마이그레이션 적용**

```bash
npx wrangler d1 migrations apply dorm_network_check --local
```

- [ ] **Step 4: 구현**

`src/lib/db.ts`:
```ts
export interface MeasurementInput {
  created_at: string;
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  raw_location_tag: string;
  is_curfew_window: number;
  location_tag: string;
  dong: string | null;
  floor: string | null;
  room: string | null;
  corridor: string | null;
  note: string | null;
  carrier: string;
  network_org: string | null;
  os: string | null;
  download_mbps: number;
  upload_mbps: number;
  ping_ms: number;
  jitter_ms: number;
  packet_loss_pct: number;
  raw_samples: string | null;
}

export async function insertMeasurement(
  db: D1Database,
  m: MeasurementInput
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO measurements (
        created_at, lat, lng, accuracy_m, raw_location_tag, is_curfew_window,
        location_tag, dong, floor, room, corridor, note, carrier, network_org, os,
        download_mbps, upload_mbps, ping_ms, jitter_ms, packet_loss_pct, raw_samples
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .bind(
      m.created_at, m.lat, m.lng, m.accuracy_m, m.raw_location_tag, m.is_curfew_window,
      m.location_tag, m.dong, m.floor, m.room, m.corridor, m.note, m.carrier,
      m.network_org, m.os, m.download_mbps, m.upload_mbps, m.ping_ms, m.jitter_ms,
      m.packet_loss_pct, m.raw_samples
    )
    .run();
}

export async function exportAllMeasurements(
  db: D1Database
): Promise<Record<string, unknown>[]> {
  const { results } = await db
    .prepare("SELECT * FROM measurements ORDER BY created_at ASC")
    .all();
  return results as Record<string, unknown>[];
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npm test -- db.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: 커밋**

```bash
git add src/lib/db.ts test/lib/db.test.ts
git commit -m "feat: add D1 insert/export functions for measurements"
```

---

### Task 8: `GET /api/network-check` 핸들러

**Files:**
- Create: `src/handlers/networkCheck.ts`
- Modify: `src/index.ts`
- Test: `test/handlers/networkCheck.test.ts`

**Interfaces:**
- Consumes: `getCfProperties`, `isMobileCarrierOrg` (Task 4).
- Produces: `handleNetworkCheck(request: Request): Response` — JSON `{ status: "mobile" | "wifi_or_other" }`.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/handlers/networkCheck.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { handleNetworkCheck } from "../../src/handlers/networkCheck";

describe("handleNetworkCheck", () => {
  it("모바일망이면 status: mobile", async () => {
    const req = new Request("https://example.com/api/network-check", {
      cf: { asOrganization: "SK Telecom" },
    } as RequestInit);
    const res = handleNetworkCheck(req);
    const body = await res.json();
    expect(body).toEqual({ status: "mobile" });
  });

  it("WiFi/기타망이면 status: wifi_or_other", async () => {
    const req = new Request("https://example.com/api/network-check", {
      cf: { asOrganization: "Some University" },
    } as RequestInit);
    const res = handleNetworkCheck(req);
    const body = await res.json();
    expect(body).toEqual({ status: "wifi_or_other" });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- networkCheck.test.ts`
Expected: FAIL with "Cannot find module '../../src/handlers/networkCheck'"

- [ ] **Step 3: 구현**

`src/handlers/networkCheck.ts`:
```ts
import { getCfProperties, isMobileCarrierOrg } from "../lib/network";

export function handleNetworkCheck(request: Request): Response {
  const { asOrganization } = getCfProperties(request);
  const status = isMobileCarrierOrg(asOrganization) ? "mobile" : "wifi_or_other";
  return new Response(JSON.stringify({ status }), {
    headers: { "content-type": "application/json" },
  });
}
```

`src/index.ts` 라우팅에 추가:
```ts
import type { Env } from "./env";
import { handleNetworkCheck } from "./handlers/networkCheck";

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/network-check") {
      return handleNetworkCheck(request);
    }
    if (url.pathname.startsWith("/api/")) {
      return new Response("Not Found", { status: 404 });
    }
    return env.ASSETS.fetch(request);
  },
};
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- networkCheck.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/handlers/networkCheck.ts src/index.ts test/handlers/networkCheck.test.ts
git commit -m "feat: add GET /api/network-check endpoint"
```

---

### Task 9: `GET /api/download` 핸들러

**Files:**
- Create: `src/handlers/download.ts`
- Modify: `src/index.ts`
- Test: `test/handlers/download.test.ts`

**Interfaces:**
- Produces: `handleDownload(request: Request): Response` — `size` 쿼리 파라미터만큼 랜덤 바이트를 스트리밍.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/handlers/download.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { handleDownload } from "../../src/handlers/download";

describe("handleDownload", () => {
  it("size 파라미터만큼 바이트를 반환한다", async () => {
    const req = new Request("https://example.com/api/download?size=1024");
    const res = handleDownload(req);
    const buf = await res.arrayBuffer();
    expect(buf.byteLength).toBe(1024);
  });

  it("size가 없거나 잘못되면 400", async () => {
    const req = new Request("https://example.com/api/download");
    const res = handleDownload(req);
    expect(res.status).toBe(400);
  });

  it("size가 최대치(20MB)를 넘으면 400", async () => {
    const req = new Request("https://example.com/api/download?size=99999999");
    const res = handleDownload(req);
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- download.test.ts`
Expected: FAIL with "Cannot find module '../../src/handlers/download'"

- [ ] **Step 3: 구현**

`src/handlers/download.ts`:
```ts
const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

export function handleDownload(request: Request): Response {
  const url = new URL(request.url);
  const sizeParam = url.searchParams.get("size");
  const size = sizeParam ? Number(sizeParam) : NaN;

  if (!Number.isFinite(size) || size <= 0 || size > MAX_DOWNLOAD_BYTES) {
    return new Response("Invalid size", { status: 400 });
  }

  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes.subarray(0, Math.min(size, 65536)));
  // 65536바이트 이후는 반복 채움(랜덤성보다 순수 처리량 측정이 목적)
  for (let offset = 65536; offset < size; offset += 65536) {
    bytes.set(bytes.subarray(0, Math.min(65536, size - offset)), offset);
  }

  return new Response(bytes, {
    headers: {
      "content-type": "application/octet-stream",
      "content-length": String(size),
      "cache-control": "no-store",
    },
  });
}
```

`src/index.ts`에 라우트 추가:
```ts
import { handleDownload } from "./handlers/download";
// ...
if (url.pathname === "/api/download") {
  return handleDownload(request);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- download.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/handlers/download.ts src/index.ts test/handlers/download.test.ts
git commit -m "feat: add GET /api/download endpoint for download speed test"
```

---

### Task 10: `POST /api/upload` 핸들러

**Files:**
- Create: `src/handlers/upload.ts`
- Modify: `src/index.ts`
- Test: `test/handlers/upload.test.ts`

**Interfaces:**
- Produces: `handleUpload(request: Request): Promise<Response>` — 바디를 읽어 바이트 수만 반환.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/handlers/upload.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { handleUpload } from "../../src/handlers/upload";

describe("handleUpload", () => {
  it("받은 바이트 수를 JSON으로 반환한다", async () => {
    const body = new Uint8Array(2048);
    const req = new Request("https://example.com/api/upload", {
      method: "POST",
      body,
    });
    const res = await handleUpload(req);
    const json = await res.json();
    expect(json).toEqual({ received: 2048 });
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- upload.test.ts`
Expected: FAIL with "Cannot find module '../../src/handlers/upload'"

- [ ] **Step 3: 구현**

`src/handlers/upload.ts`:
```ts
export async function handleUpload(request: Request): Promise<Response> {
  const buf = await request.arrayBuffer();
  return new Response(JSON.stringify({ received: buf.byteLength }), {
    headers: { "content-type": "application/json" },
  });
}
```

`src/index.ts`에 라우트 추가:
```ts
import { handleUpload } from "./handlers/upload";
// ...
if (url.pathname === "/api/upload" && request.method === "POST") {
  return handleUpload(request);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- upload.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: 커밋**

```bash
git add src/handlers/upload.ts src/index.ts test/handlers/upload.test.ts
git commit -m "feat: add POST /api/upload endpoint for upload speed test"
```

---

### Task 11: `GET /api/ping` 핸들러

**Files:**
- Create: `src/handlers/ping.ts`
- Modify: `src/index.ts`
- Test: `test/handlers/ping.test.ts`

**Interfaces:**
- Produces: `handlePing(): Response` — 즉시 빈 응답.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/handlers/ping.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { handlePing } from "../../src/handlers/ping";

describe("handlePing", () => {
  it("204 No Content를 즉시 반환한다", () => {
    const res = handlePing();
    expect(res.status).toBe(204);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- ping.test.ts`
Expected: FAIL with "Cannot find module '../../src/handlers/ping'"

- [ ] **Step 3: 구현**

`src/handlers/ping.ts`:
```ts
export function handlePing(): Response {
  return new Response(null, { status: 204 });
}
```

`src/index.ts`에 라우트 추가:
```ts
import { handlePing } from "./handlers/ping";
// ...
if (url.pathname === "/api/ping") {
  return handlePing();
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- ping.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: 커밋**

```bash
git add src/handlers/ping.ts src/index.ts test/handlers/ping.test.ts
git commit -m "feat: add GET /api/ping endpoint for RTT measurement"
```

---

### Task 12: `POST /api/submit` 핸들러 (핵심 검증 로직)

**Files:**
- Create: `src/handlers/submit.ts`
- Modify: `src/index.ts`
- Test: `test/handlers/submit.test.ts`

**Interfaces:**
- Consumes: `getCfProperties`, `isMobileCarrierOrg`(Task 4), `isWithinGeofence`(Task 2), `isCurfewWindow`, `resolveLocationTag`, `RawLocationTag`(Task 3), `parseOS`(Task 5), `insertMeasurement`, `MeasurementInput`(Task 7), `Env`(Task 1).
- Produces: `handleSubmit(request: Request, env: Env): Promise<Response>`.

요청 바디 형태(클라이언트가 보내는 JSON):
```ts
interface SubmitBody {
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  carrier: string;
  dong?: string; floor?: string; room?: string; corridor?: string;
  note?: string;
  download_mbps: number;
  upload_mbps: number;
  ping_ms: number;
  jitter_ms: number;
  packet_loss_pct: number;
  raw_samples: unknown;
}
```

- [ ] **Step 1: 실패하는 테스트 작성**

`test/handlers/submit.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { handleSubmit } from "../../src/handlers/submit";
import { exportAllMeasurements } from "../../src/lib/db";

function makeRequest(body: Record<string, unknown>, cf: Record<string, unknown>, ua = "TestAgent") {
  return new Request("https://dorm.omm.run/api/submit", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": ua },
    body: JSON.stringify(body),
    cf,
  } as RequestInit);
}

const baseBody = {
  lat: 37.5, lng: 127.0, accuracy_m: 15,
  carrier: "SKT",
  dong: "3동", floor: "5", room: "512", corridor: "A",
  download_mbps: 50, upload_mbps: 10, ping_ms: 25, jitter_ms: 3, packet_loss_pct: 0,
  raw_samples: { ping: [20, 30] },
};

const testEnv = { ...env, DORM_LAT: "37.5", DORM_LNG: "127.0" };

describe("handleSubmit", () => {
  beforeEach(async () => {
    await env.DB.exec("DELETE FROM measurements");
  });

  it("모바일망 + 입소 시간대 + 반경 안 -> 실내로 저장", async () => {
    const req = makeRequest(baseBody, { asOrganization: "SK Telecom" });
    // 2026-09-22T23:30:00+09:00 = 2026-09-22T14:30:00Z (입소 시간대)
    const fixedNow = new Date("2026-09-22T14:30:00.000Z");
    const res = await handleSubmit(req, testEnv, fixedNow);
    expect(res.status).toBe(200);
    const rows = await exportAllMeasurements(env.DB);
    expect(rows).toHaveLength(1);
    expect(rows[0].location_tag).toBe("실내");
    expect(rows[0].dong).toBe("3동");
  });

  it("WiFi/기타망이면 400으로 거부하고 저장하지 않는다", async () => {
    const req = makeRequest(baseBody, { asOrganization: "Some University" });
    const res = await handleSubmit(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    expect(res.status).toBe(400);
    const rows = await exportAllMeasurements(env.DB);
    expect(rows).toHaveLength(0);
  });

  it("입소 시간대 밖이면 GPS가 실내여도 외부로 강제 저장한다", async () => {
    const req = makeRequest(
      { ...baseBody, dong: undefined, floor: undefined, room: undefined, corridor: undefined, note: "복도 앞" },
      { asOrganization: "SK Telecom" }
    );
    // 2026-09-22T14:00:00+09:00 = 05:00Z, 입소 시간대 아님
    const res = await handleSubmit(req, testEnv, new Date("2026-09-22T05:00:00.000Z"));
    expect(res.status).toBe(200);
    const rows = await exportAllMeasurements(env.DB);
    expect(rows[0].location_tag).toBe("외부");
    expect(rows[0].note).toBe("복도 앞");
  });

  it("실내로 판정됐는데 dong/floor/room/corridor가 없으면 400", async () => {
    const req = makeRequest(
      { ...baseBody, dong: undefined, floor: undefined, room: undefined, corridor: undefined },
      { asOrganization: "SK Telecom" }
    );
    const res = await handleSubmit(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    expect(res.status).toBe(400);
  });

  it("위치 좌표가 없으면 미확인으로 저장된다", async () => {
    const req = makeRequest(
      { ...baseBody, lat: null, lng: null, accuracy_m: null, dong: undefined, floor: undefined, room: undefined, corridor: undefined, note: "위치 권한 거부" },
      { asOrganization: "SK Telecom" }
    );
    const res = await handleSubmit(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    expect(res.status).toBe(200);
    const rows = await exportAllMeasurements(env.DB);
    expect(rows[0].location_tag).toBe("미확인");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- submit.test.ts`
Expected: FAIL with "Cannot find module '../../src/handlers/submit'"

- [ ] **Step 3: 구현**

`src/handlers/submit.ts`:
```ts
import type { Env } from "../env";
import { getCfProperties, isMobileCarrierOrg } from "../lib/network";
import { isWithinGeofence } from "../lib/geo";
import { isCurfewWindow, resolveLocationTag, type RawLocationTag } from "../lib/curfew";
import { CURFEW_RADIUS_M, DEFAULT_RADIUS_M } from "../config";
import { parseOS } from "../lib/userAgent";
import { insertMeasurement, type MeasurementInput } from "../lib/db";

interface SubmitBody {
  lat: number | null;
  lng: number | null;
  accuracy_m: number | null;
  carrier: string;
  dong?: string;
  floor?: string;
  room?: string;
  corridor?: string;
  note?: string;
  download_mbps: number;
  upload_mbps: number;
  ping_ms: number;
  jitter_ms: number;
  packet_loss_pct: number;
  raw_samples: unknown;
}

function badRequest(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { "content-type": "application/json" },
  });
}

export async function handleSubmit(
  request: Request,
  env: Env,
  now: Date = new Date()
): Promise<Response> {
  const { asOrganization } = getCfProperties(request);
  if (!isMobileCarrierOrg(asOrganization)) {
    return badRequest("mobile carrier network required");
  }

  let body: SubmitBody;
  try {
    body = (await request.json()) as SubmitBody;
  } catch {
    return badRequest("invalid JSON body");
  }

  if (!body.carrier) {
    return badRequest("carrier is required");
  }

  const dormLat = Number(env.DORM_LAT);
  const dormLng = Number(env.DORM_LNG);
  const curfew = isCurfewWindow(now);
  const radius = curfew ? CURFEW_RADIUS_M : DEFAULT_RADIUS_M;

  let rawLocationTag: RawLocationTag;
  if (body.lat == null || body.lng == null) {
    rawLocationTag = "미확인";
  } else if (isWithinGeofence(body.lat, body.lng, dormLat, dormLng, radius)) {
    rawLocationTag = "실내";
  } else {
    rawLocationTag = "외부";
  }

  const locationTag = resolveLocationTag(rawLocationTag, curfew);

  if (locationTag === "실내") {
    if (!body.dong || !body.floor || !body.room || !body.corridor) {
      return badRequest("dong/floor/room/corridor are required when indoors");
    }
  }

  const measurement: MeasurementInput = {
    created_at: now.toISOString(),
    lat: body.lat ?? null,
    lng: body.lng ?? null,
    accuracy_m: body.accuracy_m ?? null,
    raw_location_tag: rawLocationTag,
    is_curfew_window: curfew ? 1 : 0,
    location_tag: locationTag,
    dong: locationTag === "실내" ? body.dong ?? null : null,
    floor: locationTag === "실내" ? body.floor ?? null : null,
    room: locationTag === "실내" ? body.room ?? null : null,
    corridor: locationTag === "실내" ? body.corridor ?? null : null,
    note: locationTag === "실내" ? null : body.note ?? null,
    carrier: body.carrier,
    network_org: asOrganization,
    os: parseOS(request.headers.get("user-agent")),
    download_mbps: body.download_mbps,
    upload_mbps: body.upload_mbps,
    ping_ms: body.ping_ms,
    jitter_ms: body.jitter_ms,
    packet_loss_pct: body.packet_loss_pct,
    raw_samples: JSON.stringify(body.raw_samples ?? null),
  };

  await insertMeasurement(env.DB, measurement);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "content-type": "application/json" },
  });
}
```

`src/index.ts`에 라우트 추가:
```ts
import { handleSubmit } from "./handlers/submit";
// ...
if (url.pathname === "/api/submit" && request.method === "POST") {
  return handleSubmit(request, env);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- submit.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/handlers/submit.ts src/index.ts test/handlers/submit.test.ts
git commit -m "feat: add POST /api/submit with WiFi and location/curfew validation"
```

---

### Task 13: `GET /api/export` 핸들러

**Files:**
- Create: `src/handlers/export.ts`
- Modify: `src/index.ts`
- Test: `test/handlers/export.test.ts`

**Interfaces:**
- Consumes: `exportAllMeasurements`(Task 7), `Env`(Task 1).
- Produces: `handleExport(request: Request, env: Env): Promise<Response>` — CSV 반환, `key` 쿼리 파라미터가 `env.EXPORT_SECRET`과 일치해야 함.

- [ ] **Step 1: 실패하는 테스트 작성**

`test/handlers/export.test.ts`:
```ts
import { describe, it, expect, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { handleExport } from "../../src/handlers/export";
import { insertMeasurement } from "../../src/lib/db";

const testEnv = { ...env, EXPORT_SECRET: "test-secret" };

describe("handleExport", () => {
  beforeEach(async () => {
    await env.DB.exec("DELETE FROM measurements");
    await insertMeasurement(env.DB, {
      created_at: "2026-09-22T14:30:00.000Z",
      lat: 37.5, lng: 127.0, accuracy_m: 10,
      raw_location_tag: "실내", is_curfew_window: 1, location_tag: "실내",
      dong: "3동", floor: "5", room: "512", corridor: "A", note: null,
      carrier: "SKT", network_org: "SK Telecom", os: "Android",
      download_mbps: 50, upload_mbps: 10, ping_ms: 25, jitter_ms: 3, packet_loss_pct: 0,
      raw_samples: "{}",
    });
  });

  it("key가 틀리면 403", async () => {
    const req = new Request("https://dorm.omm.run/api/export?key=wrong");
    const res = await handleExport(req, testEnv);
    expect(res.status).toBe(403);
  });

  it("key가 맞으면 CSV를 반환한다", async () => {
    const req = new Request("https://dorm.omm.run/api/export?key=test-secret");
    const res = await handleExport(req, testEnv);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    const text = await res.text();
    expect(text).toContain("carrier");
    expect(text).toContain("SKT");
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npm test -- export.test.ts`
Expected: FAIL with "Cannot find module '../../src/handlers/export'"

- [ ] **Step 3: 구현**

`src/handlers/export.ts`:
```ts
import type { Env } from "../env";
import { exportAllMeasurements } from "../lib/db";

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return `"${s.replace(/"/g, '""')}"`;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(","));
  }
  return lines.join("\n");
}

export async function handleExport(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const key = url.searchParams.get("key");
  if (!key || key !== env.EXPORT_SECRET) {
    return new Response("Forbidden", { status: 403 });
  }

  const rows = await exportAllMeasurements(env.DB);
  const csv = toCsv(rows);
  return new Response(csv, {
    headers: { "content-type": "text/csv; charset=utf-8" },
  });
}
```

`src/index.ts`에 라우트 추가:
```ts
import { handleExport } from "./handlers/export";
// ...
if (url.pathname === "/api/export") {
  return handleExport(request, env);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test -- export.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: 전체 테스트 스위트 실행**

Run: `npm test`
Expected: PASS (모든 테스트, Task 1~13 합산)

- [ ] **Step 6: 커밋**

```bash
git add src/handlers/export.ts src/index.ts test/handlers/export.test.ts
git commit -m "feat: add GET /api/export endpoint with secret-key auth"
```

---

### Task 14: 프론트엔드 — 측정 페이지 (§3 플로우 전체)

**Files:**
- Modify: `public/index.html`
- Create: `public/app.js`

**Interfaces:**
- Consumes: `computeThroughputMbps`, `computePingStats` (`public/stats-client.js`, Task 6), API 엔드포인트 `/api/network-check`, `/api/download`, `/api/upload`, `/api/ping`, `/api/submit` (Task 8~12).

이 태스크는 브라우저 UI라 자동 테스트 대신 수동 체크리스트로 검증한다(스펙 §13과 동일).

- [ ] **Step 1: 페이지 shell 작성**

`public/index.html`:
```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>기숙사 모바일 데이터 속도 측정</title>
  <link
    rel="stylesheet"
    href="https://cdnjs.cloudflare.com/ajax/libs/picnic/7.1.0/picnic.min.css"
  />
  <style>
    /* 모바일 최적화: 1단 세로 레이아웃, 터치하기 쉬운 크기, 확대 없이 읽히는 폰트 */
    body { max-width: 480px; margin: 0 auto; padding: 16px; font-size: 16px; }
    input, select, button { width: 100%; min-height: 44px; font-size: 16px; margin-bottom: 8px; }
    button { min-height: 48px; }
  </style>
</head>
<body>
  <main class="container">
    <h1>기숙사 모바일 데이터 속도 측정</h1>

    <section id="step-network">
      <p id="network-status">네트워크 확인 중...</p>
    </section>

    <section id="step-location" hidden>
      <p id="location-status">위치 확인 중...</p>
    </section>

    <section id="step-form-indoor" hidden>
      <h2>실내 측정 정보</h2>
      <label>동 <input id="input-dong" type="text" /></label>
      <label>층 <input id="input-floor" type="text" /></label>
      <label>호실 <input id="input-room" type="text" /></label>
      <label>복도 <input id="input-corridor" type="text" /></label>
      <label>통신사
        <select id="input-carrier-indoor">
          <option value="SKT">SKT</option>
          <option value="KT">KT</option>
          <option value="LGU+">LG U+</option>
          <option value="알뜰폰">알뜰폰</option>
          <option value="기타">기타</option>
        </select>
      </label>
      <button id="btn-indoor-next">다음</button>
    </section>

    <section id="step-form-outdoor" hidden>
      <h2>외부 측정 정보</h2>
      <p id="outdoor-coords"></p>
      <label>설명(선택) <input id="input-note" type="text" placeholder="예: 정문 앞 버스정류장" /></label>
      <label>통신사
        <select id="input-carrier-outdoor">
          <option value="SKT">SKT</option>
          <option value="KT">KT</option>
          <option value="LGU+">LG U+</option>
          <option value="알뜰폰">알뜰폰</option>
          <option value="기타">기타</option>
        </select>
      </label>
      <button id="btn-outdoor-next">다음</button>
    </section>

    <section id="step-confirm" hidden>
      <h2>측정 시작 전 확인</h2>
      <pre id="confirm-summary"></pre>
      <button id="btn-confirm-start">이 정보로 측정 시작</button>
      <button id="btn-confirm-back">뒤로</button>
    </section>

    <section id="step-measuring" hidden>
      <p id="measuring-status">측정 중...</p>
    </section>

    <section id="step-done" hidden>
      <p>측정 완료. 참여해주셔서 감사합니다.</p>
      <pre id="result-summary"></pre>
    </section>
  </main>

  <script src="stats-client.js"></script>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: `app.js` 작성 (§3 플로우 구현)**

`public/app.js`:
```js
const state = {
  networkOk: false,
  lat: null, lng: null, accuracy: null,
  locationBranch: null, // "indoor" | "outdoor"
  form: {},
};

const el = (id) => document.getElementById(id);
const show = (id) => { el(id).hidden = false; };
const hide = (id) => { el(id).hidden = true; };

async function step1CheckNetwork() {
  const res = await fetch("/api/network-check");
  const body = await res.json();
  if (body.status !== "mobile") {
    el("network-status").textContent =
      "모바일 데이터로 연결한 뒤 다시 시도하세요. (현재 WiFi 또는 다른 네트워크로 감지됨)";
    return;
  }
  state.networkOk = true;
  el("network-status").textContent = "모바일 데이터 연결 확인됨.";
  await step2CheckLocation();
}

async function step2CheckLocation() {
  hide("step-network");
  show("step-location");
  el("location-status").textContent = "위치 확인 중...";

  if (!("geolocation" in navigator)) {
    return goToOutdoorForm();
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.lat = pos.coords.latitude;
      state.lng = pos.coords.longitude;
      state.accuracy = pos.coords.accuracy;
      // 실내/외부 최종 판정은 서버가 하지만, UI 분기를 위해 서버에 위치만 먼저 물어보는 대신
      // 사용자 경험상 "실내로 추정" 여부는 제출 시 서버 응답으로 확정한다.
      // 여기서는 좌표를 얻었다는 사실만으로 실내 입력 폼을 우선 보여주고,
      // 최종 확인 화면에서 서버 판정 결과를 안내하지 않고 사용자가 입력한 대로 진행한다.
      goToIndoorForm();
    },
    () => {
      goToOutdoorForm();
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

function goToIndoorForm() {
  hide("step-location");
  state.locationBranch = "indoor";
  show("step-form-indoor");
}

function goToOutdoorForm() {
  hide("step-location");
  state.locationBranch = "outdoor";
  el("outdoor-coords").textContent = state.lat
    ? `GPS: ${state.lat.toFixed(5)}, ${state.lng.toFixed(5)}`
    : "GPS: 확인 안 됨";
  show("step-form-outdoor");
}

function buildSummary() {
  if (state.locationBranch === "indoor") {
    return {
      carrier: el("input-carrier-indoor").value,
      dong: el("input-dong").value,
      floor: el("input-floor").value,
      room: el("input-room").value,
      corridor: el("input-corridor").value,
    };
  }
  return {
    carrier: el("input-carrier-outdoor").value,
    note: el("input-note").value,
  };
}

function goToConfirm() {
  state.form = buildSummary();
  hide("step-form-indoor");
  hide("step-form-outdoor");
  el("confirm-summary").textContent = JSON.stringify(
    { branch: state.locationBranch, lat: state.lat, lng: state.lng, ...state.form },
    null,
    2
  );
  show("step-confirm");
}

el("btn-indoor-next").addEventListener("click", goToConfirm);
el("btn-outdoor-next").addEventListener("click", goToConfirm);
el("btn-confirm-back").addEventListener("click", () => {
  hide("step-confirm");
  if (state.locationBranch === "indoor") show("step-form-indoor");
  else show("step-form-outdoor");
});
el("btn-confirm-start").addEventListener("click", runMeasurementAndSubmit);

async function measureDownload() {
  const sizes = [1_000_000, 5_000_000, 20_000_000];
  let lastMbps = 0;
  for (const size of sizes) {
    const start = performance.now();
    const res = await fetch(`/api/download?size=${size}`, { cache: "no-store" });
    await res.arrayBuffer();
    const elapsed = performance.now() - start;
    lastMbps = computeThroughputMbps(size, elapsed);
  }
  return lastMbps;
}

async function measureUpload() {
  const size = 5_000_000;
  const data = new Uint8Array(size);
  const start = performance.now();
  await fetch("/api/upload", { method: "POST", body: data });
  const elapsed = performance.now() - start;
  return computeThroughputMbps(size, elapsed);
}

async function measurePing() {
  const samples = [];
  for (let i = 0; i < 20; i++) {
    const start = performance.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      await fetch("/api/ping", { cache: "no-store", signal: controller.signal });
      clearTimeout(timeout);
      samples.push(performance.now() - start);
    } catch {
      samples.push(null);
    }
  }
  return { samples, stats: computePingStats(samples) };
}

async function runMeasurementAndSubmit() {
  hide("step-confirm");
  show("step-measuring");

  el("measuring-status").textContent = "다운로드 측정 중...";
  const download_mbps = await measureDownload();

  el("measuring-status").textContent = "업로드 측정 중...";
  const upload_mbps = await measureUpload();

  el("measuring-status").textContent = "핑/지터 측정 중...";
  const { samples, stats } = await measurePing();

  const body = {
    lat: state.lat, lng: state.lng, accuracy_m: state.accuracy,
    carrier: state.form.carrier,
    dong: state.form.dong, floor: state.form.floor,
    room: state.form.room, corridor: state.form.corridor,
    note: state.form.note,
    download_mbps, upload_mbps,
    ping_ms: stats.ping_ms, jitter_ms: stats.jitter_ms,
    packet_loss_pct: stats.packet_loss_pct,
    raw_samples: { ping: samples },
  };

  const res = await fetch("/api/submit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  hide("step-measuring");
  show("step-done");
  el("result-summary").textContent = res.ok
    ? JSON.stringify(body, null, 2)
    : `제출 실패: ${res.status}`;
}

step1CheckNetwork();
```

- [ ] **Step 3: 로컬에서 수동 검증**

```bash
npm run dev
```

브라우저(또는 휴대폰이 개발 서버에 접근 가능하도록 `wrangler dev --ip 0.0.0.0` 사용)로 아래 항목을 스펙 §13 기준대로 확인한다:

- WiFi로 접속 시 1단계에서 "모바일 데이터로 연결..." 안내가 뜨고 이후 진행되지 않는다.
- 모바일 데이터로 접속 시 위치 권한 요청이 뜨고, 허용 시 실내 입력 폼(3-a)이 뜬다.
- 위치 권한을 거부하면 외부 입력 폼(3-b)이 뜬다.
- 최종 확인 화면에서 입력한 값이 정확히 보이고, "이 정보로 측정 시작"을 누르기 전에는 `/api/submit` 요청이 나가지 않는다(개발자 도구 네트워크 탭으로 확인).
- 측정 완료 후 결과 요약이 표시된다.
- 실제 휴대폰 화면 폭(360~430px)에서 가로 스크롤이 생기지 않고, 버튼/입력 필드가
  손가락으로 누르기 충분히 크며, 텍스트가 확대 없이 읽힌다.

- [ ] **Step 4: 커밋**

```bash
git add public/index.html public/app.js
git commit -m "feat: implement measurement page flow (network check, location branch, confirm, measure, submit)"
```

---

### Task 15: Python 분석 스크립트

**Files:**
- Create: `analysis/requirements.txt`
- Create: `analysis/export.py`
- Create: `analysis/analyze.py`
- Test: `analysis/test_analyze.py`

**Interfaces:**
- Produces: `analysis/analyze.py`의 `build_report(df: pandas.DataFrame) -> str` (HTML 문자열 반환), `analysis/export.py`의 `fetch_measurements(base_url: str, key: str) -> list[dict]`.

- [ ] **Step 1: 의존성 파일 작성**

`analysis/requirements.txt`:
```
pandas>=2.2
plotly>=5.22
requests>=2.32
pytest>=8.0
```

```bash
cd analysis && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt
```

- [ ] **Step 2: 실패하는 테스트 작성**

`analysis/test_analyze.py`:
```python
import pandas as pd
from analyze import build_report


def sample_df():
    return pd.DataFrame([
        {
            "created_at": "2026-09-22T14:30:00.000Z",
            "location_tag": "실내", "dong": "3동", "floor": "5", "corridor": "A",
            "carrier": "SKT", "download_mbps": 50.0, "upload_mbps": 10.0,
            "ping_ms": 25.0, "jitter_ms": 3.0, "packet_loss_pct": 0.0,
        },
        {
            "created_at": "2026-09-22T05:00:00.000Z",
            "location_tag": "외부", "dong": None, "floor": None, "corridor": None,
            "carrier": "KT", "download_mbps": 80.0, "upload_mbps": 20.0,
            "ping_ms": 15.0, "jitter_ms": 1.0, "packet_loss_pct": 0.0,
        },
    ])


def test_build_report_contains_key_sections():
    html = build_report(sample_df())
    assert "<html" in html.lower()
    assert "SKT" in html
    assert "KT" in html


def test_build_report_handles_empty_dataframe():
    empty = sample_df().iloc[0:0]
    html = build_report(empty)
    assert "<html" in html.lower()
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `cd analysis && pytest test_analyze.py -v`
Expected: FAIL with "ModuleNotFoundError: No module named 'analyze'"

- [ ] **Step 4: 구현**

`analysis/export.py`:
```python
import csv
import io
import sys

import requests


def fetch_measurements(base_url: str, key: str) -> list[dict]:
    resp = requests.get(f"{base_url}/api/export", params={"key": key}, timeout=30)
    resp.raise_for_status()
    reader = csv.DictReader(io.StringIO(resp.text))
    return list(reader)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("usage: python export.py <base_url> <export_key>")
        sys.exit(1)
    rows = fetch_measurements(sys.argv[1], sys.argv[2])
    with open("measurements.csv", "w", newline="", encoding="utf-8") as f:
        if rows:
            writer = csv.DictWriter(f, fieldnames=rows[0].keys())
            writer.writeheader()
            writer.writerows(rows)
    print(f"saved {len(rows)} rows to measurements.csv")
```

`analysis/analyze.py`:
```python
import sys

import pandas as pd
import plotly.express as px
import plotly.io as pio


def build_report(df: pd.DataFrame) -> str:
    sections = []

    if df.empty:
        sections.append("<p>데이터가 없습니다.</p>")
    else:
        indoor = df[df["location_tag"] == "실내"].copy()

        if not indoor.empty:
            heatmap_df = (
                indoor.groupby(["dong", "floor", "corridor"], dropna=False)["download_mbps"]
                .mean()
                .reset_index()
            )
            fig1 = px.density_heatmap(
                heatmap_df, x="floor", y="corridor", z="download_mbps",
                facet_col="dong", title="동/층/복도별 평균 다운로드 속도(Mbps)",
            )
            sections.append(pio.to_html(fig1, full_html=False, include_plotlyjs="cdn"))

        fig2 = px.box(
            df, x="carrier", y="download_mbps", color="carrier",
            title="통신사별 다운로드 속도 비교(Mbps)",
        )
        sections.append(pio.to_html(fig2, full_html=False, include_plotlyjs=False))

        df["hour"] = pd.to_datetime(df["created_at"]).dt.hour
        hourly = df.groupby("hour")["download_mbps"].mean().reset_index()
        fig3 = px.line(hourly, x="hour", y="download_mbps", title="시간대별 평균 다운로드 속도(Mbps)")
        sections.append(pio.to_html(fig3, full_html=False, include_plotlyjs=False))

        fig4 = px.box(
            df, x="location_tag", y="download_mbps", color="location_tag",
            title="실내 vs 외부 다운로드 속도 비교(Mbps)",
        )
        sections.append(pio.to_html(fig4, full_html=False, include_plotlyjs=False))

    body = "\n".join(sections)
    return f"<html><head><meta charset='utf-8'><title>기숙사 속도 리포트</title></head><body>{body}</body></html>"


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: python analyze.py <measurements.csv>")
        sys.exit(1)
    df = pd.read_csv(sys.argv[1])
    html = build_report(df)
    with open("report.html", "w", encoding="utf-8") as f:
        f.write(html)
    print("wrote report.html")
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd analysis && pytest test_analyze.py -v`
Expected: PASS (2 tests)

- [ ] **Step 6: 커밋**

```bash
git add analysis/requirements.txt analysis/export.py analysis/analyze.py analysis/test_analyze.py
git commit -m "feat: add Python export/analyze scripts producing plotly HTML report"
```

---

### Task 16: README 및 배포 문서화

**Files:**
- Create: `README.md`

- [ ] **Step 1: README 작성**

`README.md`:
```markdown
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

## 배포 (최초 1회)

1. `npx wrangler login`
2. `npx wrangler d1 create dorm_network_check` 실행 후 출력된 `database_id`를
   `wrangler.toml`의 `REPLACE_WITH_D1_DATABASE_ID`에 붙여넣는다.
3. `wrangler.toml`의 `DORM_LAT`/`DORM_LNG`는 이미 기숙사 건물 좌표(35.844103,
   128.625689)로 채워져 있음. 건물이 넓거나 좌표가 실제 중심과 다르면 재측량해서
   조정한다.
4. `npx wrangler secret put EXPORT_SECRET` 실행해 `/api/export` 보호용 비밀 키를 등록한다.
5. `npm run db:migrate:remote`로 원격 D1에 스키마를 적용한다.
6. `npm run deploy`로 배포한다.
7. Cloudflare 대시보드에서 Workers 프로젝트에 커스텀 도메인 `dorm.omm.run`을 연결한다
   (DNS가 이미 Cloudflare에 있다면 `wrangler.toml`의 `[[routes]]` 설정으로 자동 연결됨).
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
```

- [ ] **Step 2: 커밋 및 푸시**

```bash
git add README.md
git commit -m "docs: add README with setup, deploy, and analysis instructions"
git push origin main
```

---

## Self-Review 결과

- **스펙 커버리지:** §3(사용자 플로우) → Task 14, §4(WiFi 차단) → Task 4/8/12, §5(위치 판정) → Task 2/3/12, §6(폼 필드 분기) → Task 12/14, §7(UI 스타일) → Task 14(Pico.css류 클래스리스 프레임워크, 장식 없음), §8(D1 스키마) → Task 1/7, §9(API) → Task 8~13, §10(측정 알고리즘) → Task 6/9/10/11/14, §11(분석 리포트) → Task 15, §12(배포) → Task 1/16, §13(테스트 계획) → Task 14 Step 3. 모두 매핑됨.
- **플레이스홀더 스캔:** `REPLACE_WITH_D1_DATABASE_ID`, `DORM_LAT/DORM_LNG` 초기값 `"0"`, `MOBILE_CARRIER_ORG_KEYWORDS` 시드 목록은 스펙 §12/§4에서 이미 "배포 후 실측으로 검증 필요"라고 명시한 항목이라 남겨둠(코드는 실제로 동작하는 값이고, 실측 후 교정하라는 안내가 README/주석에 명시돼 있음). 그 외 TBD/TODO 없음.
- **타입 일관성:** `RawLocationTag`("실내"/"외부"/"미확인")가 `curfew.ts`, `submit.ts`, `db.ts` 전체에서 동일 문자열로 사용됨. `MeasurementInput` 필드명이 `db.ts` 정의와 `submit.ts` 사용처에서 일치. `computeThroughputMbps`/`computePingStats` 시그니처가 `stats.ts`(Task 6), `submit.test.ts`에서 참고하는 값 형태, `app.js`(Task 14)의 `stats-client.js` 호출부까지 일치.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-22-dorm-mobile-speed-implementation.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
