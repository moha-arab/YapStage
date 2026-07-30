// Fixed-window rate limiter keyed by arbitrary strings ("create:1.2.3.4").
// Windows are swept periodically so the map can't grow unbounded.
interface Window {
  count: number;
  resetAt: number;
}

const windows = new Map<string, Window>();

export function allow(rawKey: string, limit: number, windowMs: number): boolean {
  const key = rawKey.slice(0, 64); // attacker-length keys must not bloat the map
  const now = Date.now();
  const w = windows.get(key);
  if (!w || now >= w.resetAt) {
    // Fail closed under a key-cardinality flood: refusing service to new keys
    // beats letting the map eat the heap.
    if (windows.size > 50_000) return false;
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  w.count += 1;
  return w.count <= limit;
}

setInterval(() => {
  const now = Date.now();
  for (const [key, w] of windows) {
    if (now >= w.resetAt) windows.delete(key);
  }
}, 60_000).unref();
