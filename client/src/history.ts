// Receipts: a short summary of recent debates, kept on THIS device only
// (localStorage), for the pattern read-out below. The server keeps its own
// match history for signed-in players and guests (the verdict, the scores and
// the transcript); these receipts are separate and never leave the device.

import type { CategoryScores } from '../../server/src/protocol';

export interface Receipt {
  at: number;
  topic: string;
  me: string;
  them: string;
  won: boolean;
  myTotal: number;
  theirTotal: number;
  /** YOUR four category scores. Optional: receipts saved before this existed
      simply don't have it, and the read-out ignores them. */
  scores?: CategoryScores;
}

const MAX_BY_CAT: CategoryScores = { argument: 30, evidence: 20, clash: 30, delivery: 20 };
export const CATEGORIES = ['argument', 'evidence', 'clash', 'delivery'] as const;
export type Category = (typeof CATEGORIES)[number];

/** Minimum scored debates before we claim a pattern. Two games is noise. */
export const PATTERN_MIN = 3;

export interface Pattern {
  /** How many receipts actually carried category scores. */
  counted: number;
  best: Category;
  worst: Category;
  /** Percent of max, 0-100, per category — comparable across categories that
      are scored out of 30 vs 20. */
  pct: Record<Category, number>;
  /** Raw average of the weakest category, for showing "9/20". */
  worstAvg: number;
  worstMax: number;
}

/** What you are consistently good and bad at, across your scored debates.
    The judge's per-debate feedback is sharp but disposable; this is the part
    that only shows up if someone remembers across games. */
export function readPattern(receipts: Receipt[]): Pattern | null {
  const scored = receipts.filter((r) => r.scores);
  if (scored.length < PATTERN_MIN) return null;

  const pct = {} as Record<Category, number>;
  const avg = {} as Record<Category, number>;
  for (const c of CATEGORIES) {
    const mean = scored.reduce((n, r) => n + (r.scores as CategoryScores)[c], 0) / scored.length;
    avg[c] = mean;
    pct[c] = (mean / MAX_BY_CAT[c]) * 100;
  }
  const ranked = [...CATEGORIES].sort((a, b) => pct[b] - pct[a]);
  const best = ranked[0];
  const worst = ranked[ranked.length - 1];
  return {
    counted: scored.length,
    best,
    worst,
    pct,
    worstAvg: Math.round(avg[worst] * 10) / 10,
    worstMax: MAX_BY_CAT[worst],
  };
}

const KEY = 'yapstage.receipts';
const LEGACY_KEY = 'yapstage.bouts';
const MAX = 10;

export function loadReceipts(): Receipt[] {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Receipt[];
    return Array.isArray(parsed) ? parsed.slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function saveReceipt(receipt: Receipt): void {
  try {
    const receipts = [receipt, ...loadReceipts()].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(receipts));
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // storage full or blocked: receipts are a luxury, not a requirement
  }
}
