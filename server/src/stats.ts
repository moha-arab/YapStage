// Lightweight usage counters + structured event log. Counters reset on each
// deploy; the JSON lines in Railway's log stream are the durable record.
const counters = new Map<string, number>();
const startedAt = Date.now();

export function event(name: string, meta?: Record<string, unknown>): void {
  counters.set(name, (counters.get(name) ?? 0) + 1);
  console.log(JSON.stringify({ evt: name, t: new Date().toISOString(), ...meta }));
}

export function statsSnapshot(): Record<string, unknown> {
  return {
    since: new Date(startedAt).toISOString(),
    uptimeHours: Math.round(((Date.now() - startedAt) / 36e5) * 10) / 10,
    counts: Object.fromEntries(counters),
  };
}
