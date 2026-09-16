// The placement series as three marks: a game won, a game lost, the game
// that is next, and one still to come. Used on the ranked stage, in locked
// watch mode and on the verdict after a placement game.
//
// Never gold: placement is a measurement, not a prize (the verdict's rule).
// A win is a filled mark with a tick, a loss a hollow one with a cross, the
// next game is ringed in your own amber, and a later one is a faint ring.
import { useI18n } from './i18n';

export const PLACEMENT_GAMES = 3;

/** Where a series stands, as /rating and verdict:result describe it. */
export interface SeriesInfo {
  done: number;
  results: { rank: number; won: boolean }[];
  next: { id: string; name: string; rank: number; elo: number; color: string } | null;
}

/** Read a series off the wire, or null when it is not there or not one. */
export function seriesOf(raw: unknown): SeriesInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const results = Array.isArray(r.results)
    ? r.results
        .filter((g): g is { rank: number; won: boolean } => Boolean(g) && typeof g === 'object')
        .map((g) => ({ rank: Number(g.rank), won: g.won === true }))
    : [];
  const n = r.next as Record<string, unknown> | null | undefined;
  return {
    done: Math.max(0, Math.min(PLACEMENT_GAMES, Number(r.done) || results.length)),
    results: results.slice(0, PLACEMENT_GAMES),
    next:
      n && typeof n === 'object' && typeof n.name === 'string'
        ? {
            id: String(n.id ?? ''),
            name: n.name,
            rank: Number(n.rank) || 0,
            elo: Number(n.elo) || 0,
            color: String(n.color ?? 'against'),
          }
        : null,
  };
}

export default function PlacementMarks({ results, className = '' }: { results: SeriesInfo['results']; className?: string }) {
  const { t } = useI18n();
  const marks = Array.from({ length: PLACEMENT_GAMES }, (_, i) => {
    const g = results[i];
    const state = g ? (g.won ? 'won' : 'lost') : i === results.length ? 'next' : 'later';
    return { i, state };
  });
  return (
    <ol className={`pm ${className}`} aria-label={t('pmLabel')}>
      {marks.map(({ i, state }) => (
        <li key={i} className={`pm-mark pm-${state}`}>
          <span className="pm-dot" aria-hidden="true">
            {state === 'won' ? (
              <svg viewBox="0 0 16 16" width="14" height="14">
                <path d="M3.5 8.4l3 3 6-6.6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : state === 'lost' ? (
              <svg viewBox="0 0 16 16" width="12" height="12">
                <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            ) : (
              <span className="pm-n">{i + 1}</span>
            )}
          </span>
          <span className="sr-only">{t(`pm_${state}`, { n: i + 1 })}</span>
        </li>
      ))}
    </ol>
  );
}
