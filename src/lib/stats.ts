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
