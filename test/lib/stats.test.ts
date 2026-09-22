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
