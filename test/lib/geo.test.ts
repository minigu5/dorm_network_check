import { describe, it, expect } from "vitest";
import { haversineDistanceMeters, isWithinGeofence } from "../../src/lib/geo";

describe("haversineDistanceMeters", () => {
  it("returns 0 for identical points", () => {
    expect(haversineDistanceMeters(37.5, 127.0, 37.5, 127.0)).toBeCloseTo(0, 3);
  });

  it("returns ~157km between Seoul and Busan-ish coords", () => {
    // 서울시청(37.5665, 126.9780) ~ 대전시청(36.3504, 127.3845) 대략 141km
    const d = haversineDistanceMeters(37.5665, 126.978, 36.3504, 127.3845);
    expect(d).toBeGreaterThan(139000);
    expect(d).toBeLessThan(142000);
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
