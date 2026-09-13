// The results screen's scorecard and notes, as blocks. The verdict (Verdict.tsx)
// draws them the moment the judge rules, and a past match (Matches.tsx) draws
// the same ones when you open it days later, so a debate reads the same way
// wherever you meet it.
import type { CategoryScores, Side } from '../../server/src/protocol';
import { useI18n } from './i18n';
import './verdict.css';

export interface Category {
  key: keyof CategoryScores;
  labelKey: string;
  descKey: string;
  /** The same line for someone who argued neither side (a watcher), where
      the debater's wording ("your side") would be wrong. */
  watchDescKey?: string;
  max: number;
}

export const CATEGORIES: Category[] = [
  { key: 'argument', labelKey: 'catArgument', descKey: 'catArgumentDesc', watchDescKey: 'catArgumentDescWatch', max: 30 },
  { key: 'evidence', labelKey: 'catEvidence', descKey: 'catEvidenceDesc', max: 20 },
  { key: 'clash', labelKey: 'catClash', descKey: 'catClashDesc', watchDescKey: 'catClashDescWatch', max: 30 },
  { key: 'delivery', labelKey: 'catDelivery', descKey: 'catDeliveryDesc', max: 20 },
];

export function totalOf(s: CategoryScores): number {
  return s.argument + s.evidence + s.clash + s.delivery;
}

/** The judge writes in lower case; every sentence on screen starts with a
    capital (the first letter, and any letter after a full stop, question or
    exclamation mark and a space). */
export function capFirst(s: string): string {
  return s ? s.replace(/(^|[.!?]\s+)(\p{Ll})/gu, (_, lead: string, ch: string) => lead + ch.toUpperCase()) : s;
}

export const sideCls = (s: Side) => (s === 'FOR' ? 'is-for' : 'is-against');

/** The four categories as paired bars, yours over theirs in `order`.
    `progress` (0..1) fills the bars; the verdict rolls it in, a past match
    leaves it at 1. */
export function ScoreBars({
  scores,
  order,
  nameOf,
  progress = 1,
  watcher = false,
}: {
  scores: Record<Side, CategoryScores>;
  order: Side[];
  nameOf: (s: Side) => string;
  progress?: number;
  /** Read by someone who argued neither side: the lines say "their side". */
  watcher?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="vd-score">
      <div className="vd-legend">
        {order.map((s) => (
          <span key={s} className={`vd-key ${sideCls(s)}`}>
            <i aria-hidden="true" />
            {nameOf(s)}
          </span>
        ))}
      </div>
      {CATEGORIES.map((c) => (
        <div className="vd-row" key={c.key}>
          <div className="vd-row-head">
            <span className="vd-cat">
              {t(c.labelKey)}
              <span className="vd-cat-desc">{t(watcher && c.watchDescKey ? c.watchDescKey : c.descKey)}</span>
            </span>
            <span className="vd-cat-max num">/{c.max}</span>
          </div>
          {order.map((s) => (
            <div className="vd-bar-row" key={s}>
              <div className="vd-bar">
                <i className={sideCls(s)} style={{ width: `${(scores[s][c.key] / c.max) * 100 * progress}%` }} />
              </div>
              <span className={`vd-n num ${sideCls(s)}`}>
                <span className="sr-only">{nameOf(s)}: </span>
                {scores[s][c.key]}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** The judge's two notes on one debater: the first is the strongest thing
    they did, the second the thing that cost them. */
export function JudgeNotes({ notes }: { notes: string[] }) {
  const { t } = useI18n();
  if (!notes[0] && !notes[1]) return null;
  return (
    <div className="vd-notes">
      {notes[0] ? (
        <div className="vd-note">
          <span className="vd-label">{t('vdWorked')}</span>
          <p>{capFirst(notes[0])}</p>
        </div>
      ) : null}
      {notes[1] ? (
        <div className="vd-note vd-note-fix">
          <span className="vd-label">{t('vdFix')}</span>
          <p>{capFirst(notes[1])}</p>
        </div>
      ) : null}
    </div>
  );
}
