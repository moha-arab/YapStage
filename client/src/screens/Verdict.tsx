import { useEffect, useState } from 'react';
import type { CategoryScores, Side, TopicText, Verdict as VerdictData } from '../../../server/src/protocol';
import { isSoundMuted, playCrash, playDrumRoll, playHit, setSoundMuted, speak } from '../sound';
import { useI18n } from '../i18n';
import VideoTile from '../VideoTile';

interface Props {
  info: { verdict: VerdictData; names: Record<Side, string> } | null;
  status: { state: 'pending' | 'failed'; message?: string } | null;
  mySide: Side | undefined;
  topic: TopicText | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  rtcConnected: boolean;
  peerName: string;
  myName: string;
  onLeaveCall: () => void;
  onRetry: () => void;
}

/**
 * The call stays open after the debate so you can react to the results
 * together. That must be VISIBLE: an open mic is never allowed to be a
 * hidden audio element. Cameras on screen, plain words, a leave button.
 */
function LiveStrip({
  localStream,
  remoteStream,
  rtcConnected,
  peerName,
  myName,
  onLeaveCall,
}: Pick<Props, 'localStream' | 'remoteStream' | 'rtcConnected' | 'peerName' | 'myName' | 'onLeaveCall'>) {
  const { t } = useI18n();
  if (!localStream) {
    return <p className="live-note">{t('youLeft')}</p>;
  }
  return (
    <div className="live-strip">
      <div className="live-strip-tiles">
        <VideoTile stream={localStream} muted mirror label={myName} sub={t('live')} />
        <VideoTile
          stream={rtcConnected ? remoteStream : null}
          muted={false}
          label={peerName}
          sub={rtcConnected && remoteStream ? t('live') : undefined}
          placeholder={t('leftCall')}
        />
      </div>
      <p className="live-note">{t('stillLive')}</p>
      <button className="btn btn-small" onClick={onLeaveCall}>
        {t('leaveCall')}
      </button>
    </div>
  );
}

interface Category {
  key: keyof CategoryScores;
  labelKey: string;
  descKey: string;
  max: number;
}

const CATEGORIES: Category[] = [
  { key: 'argument', labelKey: 'catArgument', descKey: 'catArgumentDesc', max: 30 },
  { key: 'evidence', labelKey: 'catEvidence', descKey: 'catEvidenceDesc', max: 20 },
  { key: 'clash', labelKey: 'catClash', descKey: 'catClashDesc', max: 30 },
  { key: 'delivery', labelKey: 'catDelivery', descKey: 'catDeliveryDesc', max: 20 },
];

// Reveal order builds drama: light categories first, clash (the "did you
// actually debate them" score) closes the show.
const REVEAL_ORDER: Category[] = [CATEGORIES[1], CATEGORIES[3], CATEGORIES[0], CATEGORIES[2]];

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

export default function VerdictScreen({
  info,
  status,
  mySide,
  topic,
  localStream,
  remoteStream,
  rtcConnected,
  peerName,
  myName,
  onLeaveCall,
  onRetry,
}: Props) {
  const { lang, t } = useI18n();
  const strip = (
    <LiveStrip
      localStream={localStream}
      remoteStream={remoteStream}
      rtcConnected={rtcConnected}
      peerName={peerName}
      myName={myName}
      onLeaveCall={onLeaveCall}
    />
  );
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
        <p className="kicker">{topic?.[lang] ?? ''}</p>
        {status?.state === 'failed' ? (
          <>
            <h1 className="display">{t('judgeFailed')}</h1>
            <p className="subtitle">{t('judgeFailedSub')}</p>
            <button className="btn btn-primary" onClick={onRetry}>
              {t('callJudgeBack')}
            </button>
          </>
        ) : (
          <>
            <h1 className="display deliberating">{t('deliberating')}</h1>
            <div className="gavel-spinner" aria-hidden="true" />
            <p className="subtitle">{t('deliberatingSub')}</p>
          </>
        )}
        {strip}
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
        <p className="kicker">{topic?.[lang] ?? ''}</p>
        <h1 className="display">{t('scoresIn')}</h1>
        <div className="score-reveals">
          {REVEAL_ORDER.slice(0, revealed).map((c) => (
            <div className="score-reveal card" key={c.key}>
              <div className="score-reveal-head">
                <span className="score-reveal-label">{t(c.labelKey)}</span>
                <span className="score-reveal-max">{t('outOf', { n: c.max })}</span>
              </div>
              <p className="score-reveal-desc">{t(c.descKey)}</p>
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
          <p className="subtitle">{t('totalsHidden')}</p>
        ) : null}
        {strip}
      </div>
    );
  }

  if (stage === 'drumroll') {
    return (
      <div className="stage center-col verdict-drum">
        <h1 className="display huge">{t('yapmasterIs')}</h1>
        {strip}
      </div>
    );
  }

  return (
    <div className="stage center-col verdict">
      <p className="kicker">{topic?.[lang] ?? ''}</p>
      <div className={`stamp ${winner === 'FOR' ? 'for' : 'against'}`}>
        <span className="stamp-label">{t('yapmaster')}</span>
        <span className="stamp-name display">{names[winner]}</span>
        <span className="stamp-side">{t(winner)}</span>
      </div>
      <p className="summary">{verdict.summary}</p>
      {mySide !== undefined ? (
        <p className={`you-result ${youWon ? 'won' : 'lost'}`}>
          {youWon ? t('youWon') : t('youLost')}
        </p>
      ) : null}
      {strip}

      {stage === 'details' ? (
        <div className="verdict-details">
          {verdict.injectionDetected ? (
            <div className="banner banner-warn">{t('injection')}</div>
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
                  <span className="score-label" title={t(c.descKey)}>
                    {t(c.labelKey)} <em>/{c.max}</em>
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
              {t('runItBack')}
            </button>
            <button className="btn" onClick={toggleMute}>
              {muted ? t('unmuteStage') : t('muteStage')}
            </button>
          </div>
          <p className="footnote">{t('condolences', { x: names[loser] })}</p>
        </div>
      ) : null}
    </div>
  );
}
