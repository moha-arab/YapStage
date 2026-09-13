// Two guards in front of every Anthropic call (judge, bots, tutor, coach,
// drill, tutorial debrief, dispute framing):
//
//  1. A global hourly budget. However the traffic arrives (a bot farm, a
//     retry loop, a coach chat on repeat), the server never makes more than
//     LLM_HOURLY_CAP model calls in a clock hour. When it trips the call
//     throws before any request goes out, and every caller already turns a
//     throw into the same screen a model outage gives: the judge's retry
//     screen, a bot's "failed" turn, the coach's error line, the drill's
//     "judge is down".
//
//  2. A circuit breaker for outages (an empty credit balance, an API
//     incident). After BREAKER_AFTER consecutive failures of judge or bot
//     calls, new rated, bot and placement starts are refused up front (with
//     'judge_down') instead of letting a player debate for minutes towards a
//     verdict that cannot come. One success closes it, and so does a
//     cool-down, so it probes again on its own.
//
// Its own counter rather than ratelimit.ts: that map fails closed when it
// is flooded with keys, and a key flood must not be able to switch off every
// judge on the box.
import Anthropic from '@anthropic-ai/sdk';
import { event } from './stats.js';

const DEFAULT_CAP = 600;
const HOUR_MS = 3_600_000;

function cap(): number {
  const n = Number(process.env.LLM_HOURLY_CAP);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_CAP;
}

let windowStart = 0;
let used = 0;
let warnedWindow = -1;

export class LlmCapError extends Error {
  constructor() {
    super('llm_cap: hourly model budget spent');
    this.name = 'LlmCapError';
  }
}

/** Spend one call from the hourly budget, or throw LlmCapError. */
export function llmBudget(): void {
  const now = Date.now();
  if (now - windowStart >= HOUR_MS) {
    windowStart = now;
    used = 0;
  }
  if (used >= cap()) {
    if (warnedWindow !== windowStart) {
      warnedWindow = windowStart;
      event('llm_cap_hit', { cap: cap() });
    }
    throw new LlmCapError();
  }
  used += 1;
}

/** For /stats: how much of this hour's budget is gone. */
export function llmUsage(): { used: number; cap: number } {
  return { used: Date.now() - windowStart >= HOUR_MS ? 0 : used, cap: cap() };
}

/* ---------------------------------------------------------------- breaker */

const BREAKER_AFTER = 3;
const BREAKER_COOLDOWN_MS = 5 * 60_000;
let consecutiveFailures = 0;
let openedAt = 0;

/** A judge or bot call came back. */
export function llmOk(): void {
  if (openedAt) event('llm_breaker_closed');
  consecutiveFailures = 0;
  openedAt = 0;
}

/** Whether a thrown error says the model API itself is unreachable or
    refusing us, the only thing the breaker exists for. Network and timeout
    failures, 408, 429, every 5xx (529 is "overloaded"), a revoked key
    (401/403) and an empty credit balance (a 400 that says so) count.
    Everything else is one odd call, not an outage: our own throws on bad
    output (winner/total mismatch, truncation at max_tokens, JSON that will
    not parse, a 50/50 ruling) and LlmCapError, which is our budget talking.
    Counting those let one strange debate refuse every ranked and bot start
    for five minutes. */
export function countsAsOutage(err: unknown): boolean {
  if (err instanceof LlmCapError) return false;
  if (err instanceof Anthropic.APIUserAbortError) return false;
  if (err instanceof Anthropic.APIConnectionError) return true; // includes the timeout subclass
  if (err instanceof Anthropic.APIError) {
    const status = typeof err.status === 'number' ? err.status : 0;
    if (status === 408 || status === 429 || status >= 500) return true;
    if (status === 401 || status === 403) return true;
    // The SDK folds the response body into the message; read both anyway.
    const said = `${String(err.message ?? '')} ${JSON.stringify(err.error ?? '')}`;
    return status === 400 && /credit balance/i.test(said);
  }
  // A fetch-level failure that never became an SDK error.
  const name = (err as { name?: unknown } | null)?.name;
  return name === 'AbortError' || name === 'TimeoutError';
}

/** Shorten model text to at most `max` characters without cutting a word:
    at the last sentence end that fits, else at the last word boundary with
    an ellipsis. The hard slices this replaces put "workplace-pay ar" and
    "proof of y" on the verdict screen. */
export function clipText(s: string, max: number): string {
  const text = s.trim();
  if (text.length <= max) return text;
  let cut = -1;
  const ends = /[.!?؟۔]+["'”’)\]]*(?=\s|$)/g;
  for (let m = ends.exec(text); m && m.index + m[0].length <= max; m = ends.exec(text)) {
    cut = m.index + m[0].length;
  }
  if (cut >= max * 0.4) return text.slice(0, cut).trim();
  const head = text.slice(0, max - 1);
  const space = head.lastIndexOf(' ');
  return `${(space > max * 0.4 ? head.slice(0, space) : head).replace(/[\s,;:]+$/, '')}…`;
}

/** A judge or bot call failed. Callers pass only outages (countsAsOutage). */
export function llmFailed(): void {
  consecutiveFailures += 1;
  if (consecutiveFailures >= BREAKER_AFTER && !openedAt) {
    openedAt = Date.now();
    event('llm_breaker_open', { failures: consecutiveFailures });
  }
}

/** True while new model-backed starts should be refused. */
export function llmDown(): boolean {
  if (!openedAt) return false;
  if (Date.now() - openedAt >= BREAKER_COOLDOWN_MS) {
    // Half-open: let traffic through again; the next failure re-opens it.
    openedAt = 0;
    consecutiveFailures = BREAKER_AFTER - 1;
    return false;
  }
  return true;
}
