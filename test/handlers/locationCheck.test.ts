import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { handleLocationCheck } from "../../src/handlers/locationCheck";

const testEnv = { ...env, DORM_LAT: "37.5", DORM_LNG: "127.0" };

describe("handleLocationCheck", () => {
  it("입소 시간대 + 반경 안 좌표면 실내", () => {
    const req = new Request("https://example.com/api/location-check?lat=37.5001&lng=127.0");
    const res = handleLocationCheck(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    return res.json().then((body) => expect(body).toEqual({ tag: "실내" }));
  });

  it("반경 밖 좌표면 외부", () => {
    const req = new Request("https://example.com/api/location-check?lat=37.6&lng=127.0");
    const res = handleLocationCheck(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    return res.json().then((body) => expect(body).toEqual({ tag: "외부" }));
  });

  it("입소 시간대 밖이면 반경 안이어도 외부", () => {
    const req = new Request("https://example.com/api/location-check?lat=37.5001&lng=127.0");
    const res = handleLocationCheck(req, testEnv, new Date("2026-09-22T05:00:00.000Z"));
    return res.json().then((body) => expect(body).toEqual({ tag: "외부" }));
  });

  it("좌표가 없으면 미확인", () => {
    const req = new Request("https://example.com/api/location-check");
    const res = handleLocationCheck(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    return res.json().then((body) => expect(body).toEqual({ tag: "미확인" }));
  });

  it("좌표가 숫자가 아니면 미확인", () => {
    const req = new Request("https://example.com/api/location-check?lat=abc&lng=127.0");
    const res = handleLocationCheck(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    return res.json().then((body) => expect(body).toEqual({ tag: "미확인" }));
  });
});
