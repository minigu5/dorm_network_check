import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { handleLocationCheck } from "../../src/handlers/locationCheck";

const testEnv = { ...env, DORM_LAT: "37.5", DORM_LNG: "127.0" };

describe("handleLocationCheck", () => {
  it("입소 시간대 + 반경 안 좌표면 실내", () => {
    const req = new Request("https://example.com/api/location-check?lat=37.5001&lng=127.0");
    const res = handleLocationCheck(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    return res.json().then((body) => expect(body).toEqual({ tag: "실내", dormLat: 37.5, dormLng: 127.0 }));
  });

  it("반경 밖 좌표면 외부", () => {
    const req = new Request("https://example.com/api/location-check?lat=37.6&lng=127.0");
    const res = handleLocationCheck(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    return res.json().then((body) => expect(body).toEqual({ tag: "외부", dormLat: 37.5, dormLng: 127.0 }));
  });

  it("입소 시간대 밖이면 반경 안이어도 외부", () => {
    const req = new Request("https://example.com/api/location-check?lat=37.5001&lng=127.0");
    const res = handleLocationCheck(req, testEnv, new Date("2026-09-22T05:00:00.000Z"));
    return res.json().then((body) => expect(body).toEqual({ tag: "외부", dormLat: 37.5, dormLng: 127.0 }));
  });

  it("좌표가 없으면 미확인", () => {
    const req = new Request("https://example.com/api/location-check");
    const res = handleLocationCheck(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    return res.json().then((body) => expect(body).toEqual({ tag: "미확인", dormLat: 37.5, dormLng: 127.0 }));
  });

  it("좌표가 숫자가 아니면 미확인", () => {
    const req = new Request("https://example.com/api/location-check?lat=abc&lng=127.0");
    const res = handleLocationCheck(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    return res.json().then((body) => expect(body).toEqual({ tag: "미확인", dormLat: 37.5, dormLng: 127.0 }));
  });

  it("입소 시간대엔 반경(40m)을 넘어도 GPS 오차 감안 범위(200m) 안이면 실내", () => {
    // 기준점에서 위도로 약 100m 떨어진 좌표 (0.000898deg * 111320m/deg ≈ 100m)
    const req = new Request("https://example.com/api/location-check?lat=37.500898&lng=127.0");
    const res = handleLocationCheck(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    return res.json().then((body) => expect(body).toEqual({ tag: "실내", dormLat: 37.5, dormLng: 127.0 }));
  });

  it("입소 시간대엔 GPS 오차(accuracy)를 감안해서 실내로 인정한다", () => {
    // 실제 거리 약 250m(0.002245deg), GPS 오차 100m -> 유효거리 약 150m -> 실내
    const req = new Request(
      "https://example.com/api/location-check?lat=37.502245&lng=127.0&accuracy=100"
    );
    const res = handleLocationCheck(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    return res.json().then((body) => expect(body).toEqual({ tag: "실내", dormLat: 37.5, dormLng: 127.0 }));
  });

  it("입소 시간대라도 오차를 감안해도 확실히 멀면 외부", () => {
    // 실제 거리 약 600m(0.00539deg), GPS 오차 100m -> 유효거리 약 500m -> 외부
    const req = new Request(
      "https://example.com/api/location-check?lat=37.50539&lng=127.0&accuracy=100"
    );
    const res = handleLocationCheck(req, testEnv, new Date("2026-09-22T14:30:00.000Z"));
    return res.json().then((body) => expect(body).toEqual({ tag: "외부", dormLat: 37.5, dormLng: 127.0 }));
  });
});
