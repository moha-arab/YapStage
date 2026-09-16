// PLACEMENT IS A THREE GAME SERIES AGAINST BOTS (his call, 2026-09-16,
// replacing the one game against Clover from 2026-09-12). One game was a
// coin toss dressed as a measurement: a single judge call on a single motion
// decided where somebody started. Three games that adapt to the result find
// the right part of the ladder instead of guessing it from one margin.
//
// Everything here is pure and has no imports beyond the roster, so the unit
// checks (scripts/security-unit.mjs) and the smoke suite can pin it directly.
//
//   game 1: rank 4 (Clover, 1400), the middle of the ladder
//   game 2: rank 6 (Rocco, 2200) after a win, rank 2 (Moss, 600) after a loss
//   game 3: one rung up from game 2 after a win, one down after a loss,
//           so always one of ranks 1, 3, 5, 7
//
// The server picks every opponent (index.ts bot:start); the client's botId
// is ignored for placement.
import { BOTS, type Bot } from './bots.js';

/** How many games the series is. */
export const PLACEMENT_GAMES = 3;

/** The ladder's range (Nib to Vesper). */
export const LADDER_MIN = 200;
export const LADDER_MAX = 3000;

/** The lowest starting rating: the ranked floor (store.ts RATING_FLOOR,
    mirrored here so this file stays import-free). Placing someone at 222
    only for their first ranked loss to lift them to 500 made the number
    they were shown after placement meaningless (2026-09-16). */
export const PLACED_MIN = 500;

/** One finished placement game, as stored in players.placement (store.ts).
    `margin` is the judge's point margin: the player's total minus the bot's. */
export interface PlacementGame {
  rank: number;
  won: boolean;
  margin: number;
}

/** The rank of the next opponent, or null when the series is done. */
export function nextPlacementRank(games: readonly Pick<PlacementGame, 'rank' | 'won'>[]): number | null {
  if (games.length === 0) return 4;
  if (games.length === 1) return games[0].won ? 6 : 2;
  if (games.length === 2) return games[1].rank + (games[1].won ? 1 : -1);
  return null;
}

/** The visible roster bot at a rank. */
export function botAtRank(rank: number): Bot | undefined {
  return BOTS.find((b) => !b.hidden && b.rank === rank);
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** One game's score from its margin: a logistic on the judge's 100 point
    scale, 15 points of margin per unit, clamped so no single game is ever a
    certainty. A dead even game is 0.5; a win by 15 is about 0.73; a win by
    45 or more hits the 0.95 cap. */
export function placementGameScore(margin: number): number {
  const m = Number.isFinite(margin) ? margin : 0;
  return clamp(1 / (1 + Math.exp(-m / 15)), 0.05, 0.95);
}

/** The starting rating after the series: a margin-aware performance rating.
    The mean of the three opponents' ratings, moved by the Elo gap that the
    mean score says the player performed at (400 * log10(S / (1 - S))), then
    rounded and clamped to the ladder. The clamps on each game and on the mean
    keep the gap under about 511 points either way, so a perfect sweep
    against ranks 4, 6 and 7 lands near 2580, and a whitewash against 4, 2
    and 1 (about 220 on the formula) starts at the ranked floor, PLACED_MIN.
    `oppRating` is taken from the roster at the time of the game (see
    seriesRating below). */
export function placementRating(games: readonly { oppRating: number; margin: number }[]): number {
  if (games.length === 0) return clamp(1400, PLACED_MIN, LADDER_MAX);
  const avgOpp = games.reduce((s, g) => s + g.oppRating, 0) / games.length;
  const S = clamp(games.reduce((s, g) => s + placementGameScore(g.margin), 0) / games.length, 0.05, 0.95);
  return clamp(Math.round(avgOpp + 400 * Math.log10(S / (1 - S))), PLACED_MIN, LADDER_MAX);
}

/** The rating for a stored series, reading each opponent's rating off the
    roster by rank. A rank the roster no longer has (a bot retired between
    the game and now) reads as the middle of the ladder rather than throwing. */
export function seriesRating(games: readonly PlacementGame[]): number {
  return placementRating(games.map((g) => ({ oppRating: botAtRank(g.rank)?.elo ?? 1400, margin: g.margin })));
}

/** Shape whatever came out of the jsonb column into games, dropping anything
    malformed. Never trusts the column to be an array of the right shape. */
export function parseSeries(raw: unknown): PlacementGame[] {
  if (!Array.isArray(raw)) return [];
  const out: PlacementGame[] = [];
  for (const g of raw) {
    if (!g || typeof g !== 'object') continue;
    const r = g as Record<string, unknown>;
    const rank = Number(r.rank);
    const margin = Number(r.margin);
    if (!Number.isInteger(rank) || !Number.isFinite(margin)) continue;
    out.push({ rank, won: r.won === true, margin });
  }
  return out.slice(0, PLACEMENT_GAMES);
}

/** What a client may see of a series: which rungs were played and whether
    each was won, and who is next. No margins: the verdicts have those. */
export interface SeriesView {
  done: number;
  results: { rank: number; won: boolean }[];
  next: { id: string; name: string; rank: number; elo: number; color: string } | null;
}

export function seriesView(games: readonly PlacementGame[]): SeriesView {
  const rank = nextPlacementRank(games);
  const bot = rank === null ? undefined : botAtRank(rank);
  return {
    done: Math.min(games.length, PLACEMENT_GAMES),
    results: games.slice(0, PLACEMENT_GAMES).map((g) => ({ rank: g.rank, won: g.won })),
    next: bot ? { id: bot.id, name: bot.name, rank: bot.rank, elo: bot.elo, color: bot.color } : null,
  };
}

/** What one placement verdict counts as. Pure, so the rules are pinned by the
    unit checks rather than by reading judge.ts.
      - A game the bot did not really play (a failed bot turn, or the bot
        barely heard) is void: nothing is recorded and the same step is played
        again. A broken bot hands the player a margin they did not earn.
      - A player the judge heard nothing from at all takes a loss. It is on
        the verdict screen as "the judge heard nothing", and a series that a
        muted mic could stall forever would be a way to replay a hard rung.
      - Anything else counts as judged: won is the judge's winner, margin is
        the player's total minus the bot's. */
export function placementOutcome(v: {
  heardPlayer: number;
  heardBot: number;
  botFailures: number;
  playerTotal: number;
  botTotal: number;
  playerWon: boolean;
  minWords: number;
}): { counted: false } | { counted: true; won: boolean; margin: number } {
  if (v.botFailures > 0 || v.heardBot < v.minWords) return { counted: false };
  const margin = v.playerTotal - v.botTotal;
  if (v.heardPlayer === 0) return { counted: true, won: false, margin: Math.min(margin, -1) };
  return { counted: true, won: v.playerWon, margin };
}
