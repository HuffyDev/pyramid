/** Tiny fixed-window limiter keyed by ip+bucket. Good enough for a single VM. */
export function createLimiter() {
  const hits = new Map<string, { n: number; reset: number }>();
  return (key: string, max: number, windowMs: number): boolean => {
    const now = Date.now();
    const h = hits.get(key);
    if (!h || h.reset < now) {
      hits.set(key, { n: 1, reset: now + windowMs });
      if (hits.size > 10_000) for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
      return true;
    }
    h.n++;
    return h.n <= max;
  };
}
