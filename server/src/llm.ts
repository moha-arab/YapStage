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

/** A judge or bot call failed. */
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
