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

/** What a failure log may say about an error: its class, an HTTP status or
    error code, and our OWN fixed messages. Never an arbitrary message: a
    JSON.parse error quotes the model output it choked on, and a judge error
    can carry verdict text, and neither belongs in a log line. */
const SAFE_MESSAGE = /^(Judge|Dispute ruling|Drill judge|Debrief|coach|framing|llm_cap|token exchange|no id_token|no sub|aud mismatch)[\w\s/:,().-]*$/;
export function errTag(err: unknown): string {
  const e = (err ?? {}) as { name?: unknown; status?: unknown; code?: unknown; message?: unknown };
  const parts = [typeof e.name === 'string' ? e.name.slice(0, 40) : 'Error'];
  if (typeof e.status === 'number') parts.push(String(e.status));
  if (typeof e.code === 'string' && /^[\w.-]{1,40}$/.test(e.code)) parts.push(e.code);
  if (typeof e.message === 'string' && SAFE_MESSAGE.test(e.message)) parts.push(e.message.slice(0, 160));
  return parts.join(' ');
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
