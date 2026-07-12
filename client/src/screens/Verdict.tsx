import { useEffect, useRef, useState } from 'react';
import type { CategoryScores, Side, Verdict as VerdictData } from '../../../server/src/protocol';
import { isSoundMuted, playCrash, playDrumRoll, playHit, setSoundMuted, speak } from '../sound';

interface Props {
  info: { verdict: VerdictData; names: Record<Side, string> } | null;
  status: { state: 'pending' | 'failed'; message?: string } | null;
  mySide: Side | undefined;
  topic: string;
  remoteStream: MediaStream | null;
  onRetry: () => void;
}

/**
 * The debate screen's <video> unmounts when the verdict shows, but both mics
 * are open for free chat while the judge deliberates — without an element
 * playing the remote stream, everyone talks into dead air.
 */
function RemoteAudio({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
      if (stream) void el.play().catch(() => {});
    }
  }, [stream]);
  return <audio ref={ref} autoPlay />;
}

const CATEGORIES: { key: keyof CategoryScores; label: string; max: number }[] = [
  { key: 'argument', label: 'Argument', max: 30 },
  { key: 'evidence', label: 'Evidence', max: 20 },
  { key: 'clash', label: 'Clash', max: 30 },
  { key: 'delivery', label: 'Delivery', max: 20 },
];

// Reveal order builds drama: light categories first, clash (the "did you
// actually debate them" score) closes the show.
const REVEAL_ORDER: { key: keyof CategoryScores; label: string; max: number }[] = [
  { key: 'evidence', label: 'Evidence', max: 20 },
  { key: 'delivery', label: 'Delivery', max: 20 },
  { key: 'argument', label: 'Argument', max: 30 },
  { key: 'clash', label: 'Clash', max: 30 },
];

// Game-show generous curve — texture, not a transcript.
function grade(score: number, max: number): string {
  const pct = score / max;
  if (pct >= 0.92) return 'A+';
  if (pct >= 0.83) return 'A';
  if (pct >= 0.7) return 'B';
  if (pct >= 0.55) return 'C';
  if (pct >= 0.4) return 'D';
  return 'F';
}

function total(s: CategoryScores): number {
  return s.argument + s.evidence + s.clash + s.delivery;
}

type Stage = 'waiting' | 'scores' | 'drumroll' | 'reveal' | 'details';

const FIRST_CARD_MS = 1200;
const PER_CARD_MS = 2600;

export default function VerdictScreen({ info, status, mySide, topic, remoteStream, onRetry }: Props) {
  const [stage, setStage] = useState<Stage>('waiting');
  const [revealed, setRevealed] = useState(0);
  const [muted, setMuted] = useState(isSoundMuted());

  useEffect(() => {
    if (!info) return;
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    setStage('scores');
    setRevealed(0);

    REVEAL_ORDER.forEach((_, i) => {
      timers.push(
        setTimeout(() => {
          if (!alive) return;
          playHit();
          setRevealed(i + 1);
        }, FIRST_CARD_MS + i * PER_CARD_MS),
      );
    });

    const drumAt = FIRST_CARD_MS + REVEAL_ORDER.length * PER_CARD_MS + 900;
    timers.push(
      setTimeout(() => {
        if (!alive) return;
        setStage('drumroll');
        playDrumRoll(3000);
      }, drumAt),
    );
    timers.push(
      setTimeout(() => {
        if (!alive) return;
        playCrash();
        speak(info.verdict.summary);
        setStage('reveal');
      }, drumAt + 3200),
    );
    timers.push(
      setTimeout(() => {
        if (alive) setStage('details');
      }, drumAt + 4800),
    );

    return () => {
      alive = false;
      timers.forEach(clearTimeout);
    };
  }, [info]);

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    setSoundMuted(next);
  }

  if (!info) {
    return (
      <div className="stage center-col verdict-wait">
        <RemoteAudio stream={remoteStream} />
        <p className="kicker">{topic}</p>
        {status?.state === 'failed' ? (
          <>
            <h1 className="display">The judge hit a snag</h1>
            <p className="subtitle">{status.message ?? 'A technical difficulty — your debate is safe.'}</p>
            <button className="btn btn-primary" onClick={onRetry}>
              Call the judge back
            </button>
          </>
        ) : (
          <>
            <h1 className="display deliberating">The judge is deliberating…</h1>
            <div className="gavel-spinner" aria-hidden="true" />
            <p className="subtitle">Reading the transcript. No pressure.</p>
          </>
        )}
      </div>
    );
  }

  const { verdict, names } = info;
  const winner = verdict.winner;
  const loser: Side = winner === 'FOR' ? 'AGAINST' : 'FOR';
  const youWon = mySide !== undefined && mySide === winner;

  if (stage === 'scores') {
    return (
      <div className="stage center-col verdict-scores">
        <RemoteAudio stream={remoteStream} />
        <p className="kicker">{topic}</p>
        <h1 className="display">The scores are in…</h1>
        <div className="score-reveals">
          {REVEAL_ORDER.slice(0, revealed).map((c) => (
            <div className="score-reveal card" key={c.key}>
              <div className="score-reveal-head">
                <span className="score-reveal-label">{c.label}</span>
                <span className="score-reveal-max">out of {c.max}</span>
              </div>
              <div className="score-reveal-sides">
                <div className="score-reveal-side">
                  <span className="fighter for">{names.FOR}</span>
                  <span className="score-reveal-num">{verdict.scores.FOR[c.key]}</span>
                  <span className={`grade-chip grade-${grade(verdict.scores.FOR[c.key], c.max).replace('+', 'plus')}`}>
                    {grade(verdict.scores.FOR[c.key], c.max)}
                  </span>
                </div>
                <span className="vs">VS</span>
                <div className="score-reveal-side">
                  <span className="fighter against">{names.AGAINST}</span>
                  <span className="score-reveal-num">{verdict.scores.AGAINST[c.key]}</span>
                  <span className={`grade-chip grade-${grade(verdict.scores.AGAINST[c.key], c.max).replace('+', 'plus')}`}>
                    {grade(verdict.scores.AGAINST[c.key], c.max)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
        {revealed >= REVEAL_ORDER.length ? (
          <p className="subtitle">Totals hidden. Judge's decision incoming…</p>
        ) : null}
      </div>
    );
  }

  if (stage === 'drumroll') {
    return (
      <div className="stage center-col verdict-drum">
        <RemoteAudio stream={remoteStream} />
        <h1 className="display huge">THE YAPMASTER IS…</h1>
      </div>
    );
  }

  return (
    <div className="stage center-col verdict">
      <RemoteAudio stream={remoteStream} />
      <p className="kicker">{topic}</p>
      <div className={`stamp ${winner === 'FOR' ? 'for' : 'against'}`}>
        <span className="stamp-label">YAPMASTER</span>
        <span className="stamp-name display">{names[winner]}</span>
        <span className="stamp-side">{winner}</span>
      </div>
      <p className="summary">{verdict.summary}</p>
      {mySide !== undefined ? (
        <p className={`you-result ${youWon ? 'won' : 'lost'}`}>
          {youWon ? "That's you. Wear the crown." : "Run it back when you're ready."}
        </p>
      ) : null}

      {stage === 'details' ? (
        <div className="verdict-details">
          {verdict.injectionDetected ? (
            <div className="banner banner-warn">
              The judge detected an attempt to manipulate the scoring. It did not go well for them.
            </div>
          ) : null}

          <div className="scoreboard card">
            <div className="score-head">
              <span className={`fighter for`}>
                {names.FOR} · {total(verdict.scores.FOR)}
              </span>
              <span className="vs">/100</span>
              <span className={`fighter against`}>
                {names.AGAINST} · {total(verdict.scores.AGAINST)}
              </span>
            </div>
            {CATEGORIES.map((c) => (
              <div className="score-row" key={c.key}>
                <span className="score-num">{verdict.scores.FOR[c.key]}</span>
                <div className="score-bars">
                  <div className="score-bar left">
                    <div
                      className="score-fill fill-for"
                      style={{ width: `${(verdict.scores.FOR[c.key] / c.max) * 100}%` }}
                    />
                  </div>
                  <span className="score-label">
                    {c.label} <em>/{c.max}</em>
                  </span>
                  <div className="score-bar">
                    <div
                      className="score-fill fill-against"
                      style={{ width: `${(verdict.scores.AGAINST[c.key] / c.max) * 100}%` }}
                    />
                  </div>
                </div>
                <span className="score-num">{verdict.scores.AGAINST[c.key]}</span>
              </div>
            ))}
          </div>

          <div className="quotes">
            {(['FOR', 'AGAINST'] as Side[]).map((side) =>
              verdict.bestQuote[side] ? (
                <blockquote key={side} className={`quote ${side === 'FOR' ? 'for' : 'against'}`}>
                  “{verdict.bestQuote[side]}”
                  <cite>— {names[side]}</cite>
                </blockquote>
              ) : null,
            )}
          </div>

          <div className="feedback-cols">
            {(['FOR', 'AGAINST'] as Side[]).map((side) => (
              <div key={side} className="card feedback">
                <h3 className={side === 'FOR' ? 'for' : 'against'}>{names[side]}</h3>
                <ul>
                  {verdict.feedback[side].map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <div className="verdict-actions">
            <button className="btn btn-primary" onClick={() => window.location.assign('/')}>
              Run it back
            </button>
            <button className="btn" onClick={toggleMute}>
              {muted ? 'Unmute stage sound' : 'Mute stage sound'}
            </button>
          </div>
          <p className="footnote">
            Condolences to {names[loser]} — the transcript has already been deleted.
          </p>
        </div>
      ) : null}
    </div>
  );
}
