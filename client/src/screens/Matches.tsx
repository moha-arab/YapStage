// Your record. Every debate you've played, filterable, and every row opens:
// the judge's reason, the scorecard and your two notes in the same blocks the
// results screen draws (VerdictBlocks.tsx), and the YapMaster still there to
// argue with days later. Below the verdict, the debate itself: the saved
// transcript, both sides, turn by turn, which is what the coach reads too.
import { useEffect, useState, type CSSProperties } from 'react';
import type { Side, Verdict as VerdictData } from '../../../server/src/protocol';
import { useI18n } from '../i18n';
import Brand from '../Brand';
import { JudgeNotes, ScoreBars, capFirst, sideCls } from '../VerdictBlocks';

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

interface Line {
  side: Side;
  stepIndex: number;
  text: string;
}

interface FullMatch extends MatchRow {
  verdict: VerdictData;
  /** Empty on a row filed while transcripts were not kept (2026-09-12). */
  transcript?: Line[];
}

/** The saved lines as turns: in step order, and the chunks of one turn
    (browser speech arrives a sentence at a time) joined back into one. */
function turnsOf(transcript: Line[] | undefined): Line[] {
  const sorted = (Array.isArray(transcript) ? transcript : [])
    .filter((e) => e && (e.side === 'FOR' || e.side === 'AGAINST') && typeof e.text === 'string' && e.text.trim())
    .sort((a, b) => a.stepIndex - b.stepIndex);
  const out: Line[] = [];
  for (const e of sorted) {
    const last = out[out.length - 1];
    if (last && last.stepIndex === e.stepIndex && last.side === e.side) last.text = `${last.text} ${e.text.trim()}`;
    else out.push({ side: e.side, stepIndex: e.stepIndex, text: e.text.trim() });
  }
  return out;
}

type Filter = 'all' | 'ranked' | 'custom' | 'bots';
const FILTERS: Filter[] = ['all', 'ranked', 'custom', 'bots'];

type T = (key: string, vars?: Record<string, string | number>) => string;

/** "3d ago", in the same words as the rest of the app (HomeFeed.tsx). */
function ago(iso: string, t: T): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return '';
  const mins = Math.max(0, Math.round(ms / 60000));
  if (mins < 1) return t('agoNow');
  if (mins < 60) return t('agoMin', { n: mins });
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return t('agoHour', { n: hrs });
  return t('agoDay', { n: Math.round(hrs / 24) });
}

interface Props {
  onBack: () => void;
  /** The empty record's one button. Without it the button goes back to the
      lobby, where the bots are one tap away. */
  onPlayBot?: () => void;
}

export default function Matches({ onBack, onPlayBot }: Props) {
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
      <header className="topbar scr-bar">
        <Brand />
        <button className="scr-btn" onClick={onBack}>
          {t('back')}
        </button>
      </header>

      <h1 className="display page-title">{t('matchesTitle')}</h1>
      {rows && rows.length > 0 ? (
        <p className="page-sub">{t('matchesRecord', { w: wins, l: rows.length - wins })}</p>
      ) : null}

      <div className="mh-filters">
        {FILTERS.map((f) => (
          <button
            key={f}
            className={`mh-chip ${filter === f ? 'mh-on' : ''}`}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {t(`filter_${f}`)}
          </button>
        ))}
      </div>

      {rows === null ? (
        // The shape of the list, not the word "Loading": the rows land where
        // the eye is already looking.
        <div className="match-list" role="status">
          <span className="sr-only">{t('loading')}</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="match-row mh-skel" aria-hidden="true">
              <span className="mh-skel-mark" />
              <span className="match-main">
                <span className="mh-skel-line" />
                <span className="mh-skel-line mh-skel-short" />
              </span>
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="mh-empty">
          <p className="page-sub">{t('matchesEmpty')}</p>
          <button className="btn btn-primary" onClick={onPlayBot ?? onBack}>
            {t('matchesPlayBot')}
          </button>
        </div>
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
              <span className={`match-mark ${r.won ? 'bout-w' : 'bout-l'}`}>{r.won ? 'W' : 'L'}</span>
              <span className="match-main">
                <span className="match-topic">{capFirst(r.topic)}</span>
                <span className="match-meta">
                  {t(`filter_${r.mode}`)} · {t('vsName', { x: r.opponent })} · {ago(r.at, t)}
                </span>
              </span>
              <span className="match-score num">
                {r.my_total}
                <em>–{r.their_total}</em>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** One finished debate, re-opened: what the judge said, the scorecard, and a
    live line back to the YapMaster about it. */
function MatchDetail({ match, onBack }: { match: FullMatch; onBack: () => void }) {
  const { t } = useI18n();
  const v = match.verdict;
  const mySide = match.my_side;
  const theirSide: Side = mySide === 'FOR' ? 'AGAINST' : 'FOR';
  const gel = { '--gel': mySide === 'FOR' ? 'var(--amber)' : 'var(--turq)' } as CSSProperties;
  const turns = turnsOf(match.transcript);
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
    <div className="stage matches mh-detail" style={gel}>
      <header className="topbar scr-bar">
        <Brand />
        <button className="scr-btn" onClick={onBack}>
          {t('back')}
        </button>
      </header>

      <p className="kicker mh-topic">{match.topic}</p>
      <h1 className={`display vd-word ${match.won ? 'won' : ''}`}>{match.won ? t('youWon') : t('youLost')}</h1>
      <p className="page-sub">
        {t('vsName', { x: match.opponent })} · <span className="num">{match.my_total}–{match.their_total}</span> ·{' '}
        {t(`filter_${match.mode}`)} · {ago(match.at, t)}
      </p>

      <div className="mh-why">
        {v.summary ? (
          <div className="vd-reason">
            <span className="vd-label">{t('vdJudge')}</span>
            <p>{capFirst(v.summary)}</p>
          </div>
        ) : null}
        <ScoreBars
          scores={v.scores}
          order={[mySide, theirSide]}
          nameOf={(s) => (s === mySide ? t('you') : match.opponent)}
        />
        <JudgeNotes notes={v.feedback[mySide] ?? []} />
        {v.bestQuote[mySide] ? (
          <blockquote className="vd-quote">
            <span className="vd-label">{t('vdBestLine')}</span>
            <p>&ldquo;{v.bestQuote[mySide]}&rdquo;</p>
          </blockquote>
        ) : null}
        {turns.length > 0 ? (
          <div className="vd-said mh-said">
            <span className="vd-label">{t('vdSaid')}</span>
            {turns.map((e, i) => (
              <div className="vd-said-one" key={i}>
                <span className={`vd-said-who ${sideCls(e.side)}`}>
                  {e.side === mySide ? t('you') : match.opponent}
                </span>
                <p>{capFirst(e.text)}</p>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="card coach-card">
        <h3 className="coach-title">{t('coachTitle')}</h3>
        <p className="coach-note">{t('coachNoteLater')}</p>
        <div className="coach-log" aria-live="polite">
          {log.map((m, i) => (
            <p key={i} className={`coach-msg ${m.role}`}>
              {m.text}
            </p>
          ))}
          {thinking ? <p className="coach-msg coach thinking">{t('coachThinking')}</p> : null}
        </div>
        <div className="coach-presets">
          {[match.won ? 'coachHowWon' : 'coachWhyLost', 'coachImprove', 'coachChallenge'].map((k) => (
            <button key={k} className="btn btn-small" disabled={thinking} onClick={() => void ask(t(k))}>
              {t(k)}
            </button>
          ))}
        </div>
        <div className="coach-input-row">
          <input
            className="input"
            value={input}
            placeholder={t('coachPlaceholder')}
            aria-label={t('coachPlaceholder')}
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
