// Your record. Every debate you've played, filterable, and every row OPENS —
// the full verdict with scores, quotes, feedback, and the YapMaster still
// available to argue with days later. This is the screen the old home page's
// "your corner" box was pretending to be.
import { useEffect, useState } from 'react';
import type { CategoryScores, Side, Verdict as VerdictData } from '../../../server/src/protocol';
import { useI18n } from '../i18n';

export interface MatchRow {
  id: number;
  mode: 'ranked' | 'custom' | 'bots';
  topic: string;
  my_side: Side;
  won: boolean;
  my_total: number;
  their_total: number;
  opponent: string;
  at: string;
}

interface FullMatch extends MatchRow {
  verdict: VerdictData;
  transcript: { side: Side; stepIndex: number; text: string }[];
}

type Filter = 'all' | 'ranked' | 'custom' | 'bots';
const FILTERS: Filter[] = ['all', 'ranked', 'custom', 'bots'];

const CATS: { key: keyof CategoryScores; labelKey: string; max: number }[] = [
  { key: 'argument', labelKey: 'catArgument', max: 30 },
  { key: 'evidence', labelKey: 'catEvidence', max: 20 },
  { key: 'clash', labelKey: 'catClash', max: 30 },
  { key: 'delivery', labelKey: 'catDelivery', max: 20 },
];

interface Props {
  onBack: () => void;
}

export default function Matches({ onBack }: Props) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<Filter>('all');
  const [rows, setRows] = useState<MatchRow[] | null>(null);
  const [open, setOpen] = useState<FullMatch | null>(null);

  useEffect(() => {
    setRows(null);
    const q = filter === 'all' ? '' : `?mode=${filter}`;
    void fetch(`/matches${q}`)
      .then((r) => r.json())
      .then((d) => setRows(d.matches ?? []))
      .catch(() => setRows([]));
  }, [filter]);

  if (open) return <MatchDetail match={open} onBack={() => setOpen(null)} />;

  const wins = (rows ?? []).filter((r) => r.won).length;

  return (
    <div className="stage matches">
      <header className="topbar">
        <button className="btn btn-small" onClick={onBack}>
          {t('back')}
        </button>
        <span className="brand">
          YAP<span className="logo-accent">STAGE</span>
        </span>
        <span className="pill">{t('matchesPill')}</span>
      </header>

      <h1 className="display page-title">{t('matchesTitle')}</h1>
      {rows && rows.length > 0 ? (
        <p className="page-sub">{t('matchesRecord', { w: wins, l: rows.length - wins })}</p>
      ) : null}

      <div className="chip-row filter-row">
        {FILTERS.map((f) => (
          <button
            key={f}
            className={`cat-tab ${filter === f ? 'cat-active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {t(`filter_${f}`)}
          </button>
        ))}
      </div>

      {rows === null ? (
        <p className="page-sub">{t('loading')}</p>
      ) : rows.length === 0 ? (
        <p className="page-sub empty-note">{t('matchesEmpty')}</p>
      ) : (
        <div className="match-list">
          {rows.map((r) => (
            <button
              key={r.id}
              className="match-row"
              onClick={() => {
                void fetch(`/matches/${r.id}`)
                  .then((res) => res.json())
                  .then((d) => d.match && setOpen({ ...r, ...d.match }));
              }}
            >
              <span className={`match-mark ${r.won ? 'bout-w' : 'bout-l'}`}>
                {r.won ? 'W' : 'L'}
              </span>
              <span className="match-main">
                <span className="match-topic">{r.topic}</span>
                <span className="match-meta">
                  {t(`filter_${r.mode}`)} · {t('vsName', { x: r.opponent })}
                </span>
              </span>
              <span className="match-score">
                {r.my_total}
                <em>–{r.their_total}</em>
              </span>
              <span className="match-date">{new Date(r.at).toLocaleDateString('en-US')}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** One finished debate, re-opened: the scoreboard, what the judge said, and a
    live line back to the YapMaster about it. */
function MatchDetail({ match, onBack }: { match: FullMatch; onBack: () => void }) {
  const { t } = useI18n();
  const v = match.verdict;
  const mySide = match.my_side;
  const theirSide: Side = mySide === 'FOR' ? 'AGAINST' : 'FOR';
  const [log, setLog] = useState<{ role: 'you' | 'coach'; text: string }[]>([]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);

  async function ask(q: string) {
    const question = q.trim();
    if (!question || thinking) return;
    setLog((l) => [...l, { role: 'you', text: question }]);
    setInput('');
    setThinking(true);
    try {
      const history = log.map((m) => ({
        role: m.role === 'you' ? ('user' as const) : ('assistant' as const),
        content: m.text,
      }));
      const res = await fetch(`/matches/${match.id}/coach`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question, history }),
      });
      const d = (await res.json()) as { text?: string };
      setLog((l) => [...l, { role: 'coach', text: d.text || t('coachError') }]);
    } catch {
      setLog((l) => [...l, { role: 'coach', text: t('coachError') }]);
    } finally {
      setThinking(false);
    }
  }

  return (
    <div className="stage matches">
      <header className="topbar">
        <button className="btn btn-small" onClick={onBack}>
          {t('back')}
        </button>
        <span className="brand">
          YAP<span className="logo-accent">STAGE</span>
        </span>
        <span className="pill">{t(`filter_${match.mode}`)}</span>
      </header>

      <p className="kicker">{match.topic}</p>
      <h1 className={`display page-title ${match.won ? 'won' : 'lost'}`}>
        {match.won ? t('youWon') : t('youLost')}
      </h1>
      <p className="page-sub">
        {t('vsName', { x: match.opponent })} · {match.my_total}–{match.their_total}
      </p>

      <div className="card detail-card">
        <p className="summary">{v.summary}</p>

        <div className="scoreboard">
          <div className="score-head">
            <span className="fighter for">
              {match.my_side === 'FOR' ? 'you' : match.opponent} · {v.scores.FOR.argument + v.scores.FOR.evidence + v.scores.FOR.clash + v.scores.FOR.delivery}
            </span>
            <span className="vs">/100</span>
            <span className="fighter against">
              {match.my_side === 'AGAINST' ? 'you' : match.opponent} · {v.scores.AGAINST.argument + v.scores.AGAINST.evidence + v.scores.AGAINST.clash + v.scores.AGAINST.delivery}
            </span>
          </div>
          {CATS.map((c) => (
            <div className="score-row" key={c.key}>
              <span className="score-num">{v.scores.FOR[c.key]}</span>
              <div className="score-bars">
                <div className="score-bar left">
                  <div
                    className="score-fill fill-for"
                    style={{ width: `${(v.scores.FOR[c.key] / c.max) * 100}%` }}
                  />
                </div>
                <span className="score-label">
                  {t(c.labelKey)} <em>/{c.max}</em>
                </span>
                <div className="score-bar">
                  <div
                    className="score-fill fill-against"
                    style={{ width: `${(v.scores.AGAINST[c.key] / c.max) * 100}%` }}
                  />
                </div>
              </div>
              <span className="score-num">{v.scores.AGAINST[c.key]}</span>
            </div>
          ))}
        </div>

        {v.feedback[mySide]?.length ? (
          <div className="detail-feedback">
            <span className="tape">{t('yourNotes')}</span>
            <ul>
              {v.feedback[mySide].map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {v.bestQuote[mySide] ? (
          <blockquote className={`quote ${mySide === 'FOR' ? 'for' : 'against'}`}>
            “{v.bestQuote[mySide]}”
          </blockquote>
        ) : null}
      </div>

      <div className="card coach-card">
        <h3 className="coach-title">{t('coachTitle')}</h3>
        <p className="coach-note">{t('coachNoteLater')}</p>
        {log.length > 0 || thinking ? (
          <div className="coach-log">
            {log.map((m, i) => (
              <p key={i} className={`coach-msg ${m.role}`}>
                {m.text}
              </p>
            ))}
            {thinking ? <p className="coach-msg coach thinking">{t('coachThinking')}</p> : null}
          </div>
        ) : null}
        <div className="coach-presets">
          {[match.won ? 'coachHowWon' : 'coachWhyLost', 'coachImprove', 'coachChallenge'].map(
            (k) => (
              <button key={k} className="btn btn-small" disabled={thinking} onClick={() => void ask(t(k))}>
                {t(k)}
              </button>
            ),
          )}
        </div>
        <div className="coach-input-row">
          <input
            className="input"
            value={input}
            placeholder={t('coachPlaceholder')}
            maxLength={300}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void ask(input);
            }}
          />
          <button className="btn" disabled={thinking || !input.trim()} onClick={() => void ask(input)}>
            {t('coachSend')}
          </button>
        </div>
      </div>
    </div>
  );
}
