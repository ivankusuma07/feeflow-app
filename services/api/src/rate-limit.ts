/**
 * Fixed-window limiter, in memory. The API runs as one process on the VPS (brief §Hosting), so
 * per-IP and per-X-id counters don't need shared storage.
 */
export function createRateLimiter(limit: number, windowMs: number, now: () => number = Date.now) {
  const hits = new Map<string, { start: number; count: number }>();
  return {
    /** True if the call is allowed (and counted). */
    take(key: string): boolean {
      const t = now();
      const w = hits.get(key);
      if (!w || t - w.start >= windowMs) {
        if (hits.size > 50_000) {
          for (const [k, v] of hits) if (t - v.start >= windowMs) hits.delete(k);
        }
        hits.set(key, { start: t, count: 1 });
        return true;
      }
      if (w.count >= limit) return false;
      w.count += 1;
      return true;
    },
  };
}

export type RateLimiter = ReturnType<typeof createRateLimiter>;
