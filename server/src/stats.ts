// Lightweight usage counters + structured event log. Counters reset on each
// deploy; the JSON lines in Railway's log stream are the durable record.
//
// The ring buffer exists because diagnosing "it's bugged" used to mean writing
// throwaway socket probes and pointing generated speech at prod. Recent events
// are kept in memory so /stats can answer "what actually happened in lobby
// ABC123" in one request.
const counters = new Map<string, number>();
const startedAt = Date.now();

interface LoggedEvent {
  evt: string;
  t: string;
  [k: string]: unknown;
}

const RING = 400;
const recent: LoggedEvent[] = [];

export function event(name: string, meta?: Record<string, unknown>): void {
  counters.set(name, (counters.get(name) ?? 0) + 1);
  const row: LoggedEvent = { evt: name, t: new Date().toISOString(), ...meta };
  console.log(JSON.stringify(row));
  recent.push(row);
  if (recent.length > RING) recent.shift();
}

/** The last N events, newest first. `code` narrows to one lobby, which is how
    you follow a single debate end to end. */
export function recentEvents(limit = 100, code?: string): LoggedEvent[] {
  const rows = code ? recent.filter((r) => r.code === code) : recent;
  return rows.slice(-limit).reverse();
}

export function statsSnapshot(): Record<string, unknown> {
  return {
    since: new Date(startedAt).toISOString(),
    uptimeHours: Math.round(((Date.now() - startedAt) / 36e5) * 10) / 10,
    counts: Object.fromEntries(counters),
  };
}

// Restart-notice verification: a live debate was held open on prod while this
// deployed, to prove SIGTERM reaches the shutdown handler on Railway.

// (restart-notice test marker)

// (shutdown-record test marker)

// (client disconnect-notice verification marker)
