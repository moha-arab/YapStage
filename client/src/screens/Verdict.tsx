// AFTER THE DEBATE (redesigned 2026-09-12). His brief: "Rethink the results
// menu and after the debate", "simple, user friendly, not overwhelming", with
// chess.com as the bar: one big thing to look at, one obvious thing to do.
//
// The test it is built against: a first-time sixteen-year-old sees in one
// second whether they won, in five seconds why, and knows what to press.
//
// So the old show is gone. It held the result back for about seventeen
// seconds (four score cards at 2.6s each, then a three-second drum roll, then
// "the yapmaster is..."), which is exactly the wait that question forbids.
// Now the result is on screen from the first frame: VICTORY or DEFEAT, both
// fighters with the winner lit and large, the totals. The drama that is left
// is a second of totals counting up and bars filling, and a tap skips it.
//
// Reading order, top to bottom (left column then right on a wide screen):
//   the result, what it did to your rating, what to press next
//   the judge's sentence, the four categories as paired bars, your two notes
//   then the coach, their notes, share, report
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { CategoryScores, Framing, Side, TopicText, Verdict as VerdictData } from '../../../server/src/protocol';
import { isSoundMuted, playCrash, setSoundMuted, speak } from '../sound';
import { socket } from '../socket';
import { useI18n } from '../i18n';
import VideoTile from '../VideoTile';
import ReportFlag from '../Report';
import { signIn, whoAmI } from '../player';
import { playBotTurn, stopBotVoice } from '../botvoice';
import BotAvatar from '../BotAvatar';
import Mask from '../Mask';
import Cone from '../Cone';
import '../verdict.css';

const COACH_LIMIT = 6;
interface CoachMsg {
  role: 'you' | 'coach';
  text: string;
  error?: boolean;
}

interface Props {
  info: {
    verdict: VerdictData;
    names: Record<Side, string>;
    mime?: string;
    audio?: ArrayBuffer;
    heard?: Record<Side, number>;
    /** Ranked only: what the match did to each side's rating. */
    elo?: Record<Side, { before: number; after: number }>;
    /** The placement match only: the starting rating it set. */
    placement?: { rating: number };
  } | null;
  /** Settle-it: the argument and both accounts, for the ruling screen. */
  framing?: Framing | null;
  status: { state: 'pending' | 'failed'; message?: string; terminal?: boolean } | null;
  mySide: Side | undefined;
  topic: TopicText | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  rtcConnected: boolean;
  peerName: string;
  myName: string;
  onLeaveCall: () => void;
  onRetry: () => void;
  onRematch: () => void;
  rematch: { youWant: boolean; peerWant: boolean; peerLeft: boolean } | null;
  botOpponent?: { id: string; name: string; color: string } | null;
  /** Ranked hides rematch: the queue is how you go again, so two accounts
      cannot sit in a loop trading rating. */
  ranked?: boolean;
  /** Campaign: the win moved your frontier. Announce the new challenger. */
  unlocked?: { level: number; unlocked: string | null } | null;
  /** Masks by side (an entry = that side is masked), so the post-verdict call
      still shows a face for players who never had a camera. */
  avatars?: Partial<Record<Side, string>> | null;
  /** What the opponent was rated, so the delta can explain its own size. */
  opponentRating?: number;
  /** Bot matches: the same bot, the same setup, straight into a new match.
      Absent when there is nothing to replay (placement, a resumed page). */
  onPlayAgain?: () => void;
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

function total(s: CategoryScores): number {
  return s.argument + s.evidence + s.clash + s.delivery;
}

/* The one bit of show left. The result itself never waits on this: it is on
   screen from the first frame, and only the numbers roll in under it. */
const REVEAL_DELAY_MS = 250;
const REVEAL_MS = 1100;
const VOICE_AT_MS = 700;

const ease = (p: number) => 1 - Math.pow(1 - p, 3);

/** "now {n}" with the number set in the mono face, wherever the language
    puts it in the sentence. */
function withNum(template: string, n: number): ReactNode {
  const [a, b = ''] = template.split('{n}');
  return (
    <>
      {a}
      <b className="elo">{n}</b>
      {b}
    </>
  );
}

const sideCls = (s: Side) => (s === 'FOR' ? 'is-for' : 'is-against');
const delay = (s: number) => ({ '--d': `${s}s` }) as CSSProperties;

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
  onRematch,
  rematch,
  botOpponent,
  ranked,
  unlocked,
  avatars,
  framing,
  opponentRating,
  onPlayAgain,
}: Props) {
  const { lang, t } = useI18n();
  const [muted, setMuted] = useState(isSoundMuted());
  const [coachLog, setCoachLog] = useState<CoachMsg[]>([]);
  const [coachThinking, setCoachThinking] = useState(false);
  const [coachAsks, setCoachAsks] = useState(0);
  const [coachInput, setCoachInput] = useState('');
  const [shareState, setShareState] = useState<'idle' | 'working' | 'copied' | 'failed'>('idle');
  const [starting, setStarting] = useState(false);
  const coachRef = useRef<HTMLDivElement>(null);
  // Signed-out and just handed a real verdict: the one moment an account ask
  // is a gift rather than a toll.
  const [saveNudge, setSaveNudge] = useState(false);
  useEffect(() => {
    void whoAmI().then((me) => setSaveNudge(me.google && !me.signedIn));
  }, []);

  useEffect(() => {
    const onReply = (p: { text: string; error?: boolean; done?: boolean }) => {
      setCoachThinking(false);
      if (p.done) return; // cap reached: the input is already hidden
      setCoachLog((l) => [...l, { role: 'coach', text: p.text, error: p.error }]);
    };
    socket.on('coach:reply', onReply);
    return () => {
      socket.off('coach:reply', onReply);
    };
  }, []);

  function askCoach(q: string) {
    const question = q.trim();
    if (!question || coachThinking || coachAsks >= COACH_LIMIT) return;
    setCoachLog((l) => [...l, { role: 'you', text: question }]);
    setCoachThinking(true);
    setCoachAsks((n) => n + 1);
    setCoachInput('');
    socket.emit('coach:ask', { question });
  }

  // The reveal: 0 to 1 over about a second, driving the totals and the bars.
  // A tap anywhere lands it at 1. Reduced motion starts it at 1.
  const [progress, setProgress] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const skipRef = useRef(false);
  useEffect(() => {
    if (!info) return;
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (still) {
      setProgress(1);
      setSkipped(true);
      return;
    }
    skipRef.current = false;
    setProgress(0);
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      if (skipRef.current) return setProgress(1);
      const k = Math.min(1, Math.max(0, (now - t0 - REVEAL_DELAY_MS) / REVEAL_MS));
      setProgress(k);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [info]);

  function skip() {
    if (skipRef.current) return;
    skipRef.current = true;
    setProgress(1);
    setSkipped(true);
  }

  // The sound of the result, then the YapMaster reads their line. Falls back
  // to the browser voice when the server had no TTS. In settle-it the decree
  // is the line that gets read, not the hype summary.
  useEffect(() => {
    if (!info) return;
    playCrash();
    const spoken = info.verdict.ruling?.decree || info.verdict.summary;
    const voice = setTimeout(() => {
      if (!spoken) return;
      if (info.audio && !isSoundMuted()) {
        playBotTurn(spoken, info.audio, info.mime, lang, () => {});
      } else {
        speak(spoken);
      }
    }, VOICE_AT_MS);
    return () => clearTimeout(voice);
  }, [info]);

  // Ask the server for a link, then hand it to the OS share sheet on mobile or
  // the clipboard on desktop. The share sheet can be dismissed, which is not a
  // failure, so a cancel just resets quietly.
  function share() {
    if (shareState === 'working') return;
    setShareState('working');
    socket.emit('share:link', (res) => {
      if (!res?.url) {
        setShareState('failed');
        return;
      }
      const url = new URL(res.url, window.location.origin).toString();
      const title = info ? `${info.names[info.verdict.winner]} won on YapStage` : 'YapStage';
      if (navigator.share) {
        navigator
          .share({ title, url })
          .then(() => setShareState('idle'))
          .catch(() => setShareState('idle'));
        return;
      }
      navigator.clipboard
        ?.writeText(url)
        .then(() => setShareState('copied'))
        .catch(() => setShareState('failed'));
    });
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    setSoundMuted(next);
    // setSoundMuted cancels browser speech but knows nothing about the
    // YapMaster's audio element, so silence that here too.
    if (next) stopBotVoice();
  }

  const home = () => window.location.assign('/');

  // You on the left, them on the right, in both the wait and the result, so
  // the bars below read "yours against theirs" in the same order.
  const me: Side = mySide ?? 'FOR';
  const them: Side = me === 'FOR' ? 'AGAINST' : 'FOR';
  const order: Side[] = [me, them];
  const nameOf = (s: Side) => (info ? info.names[s] : s === me ? myName : peerName);
  const gel = { '--gel': me === 'FOR' ? 'var(--amber)' : 'var(--turq)' } as CSSProperties;

  // The call stays open after the debate so you can react to the result
  // together, and an open mic must be VISIBLE, never a hidden audio element.
  // So the fighters ARE the call: a live tile (a character, or a face on
  // camera) that also carries the other person's voice, plus one plain line
  // and a leave button. No stream means you left, or never had a mic.
  const callOn = !botOpponent && Boolean(localStream);

  const isBot = (side: Side) => Boolean(botOpponent) && side !== me;
  const streamOf = (side: Side) =>
    callOn && !isBot(side) ? (side === me ? localStream : rtcConnected ? remoteStream : null) : null;
  // A face on camera stands in a frame, not a cone: a square photo in a
  // spotlight reads as a picture hung in a lamp.
  const onCamera = (side: Side) =>
    !isBot(side) && !avatars?.[side] && Boolean(streamOf(side)?.getVideoTracks().length);

  const art = (side: Side) => {
    if (botOpponent && isBot(side)) {
      return <BotAvatar botId={botOpponent.id} color={botOpponent.color} size="100%" bare />;
    }
    const mask = avatars?.[side];
    const mine = side === me;
    const stream = streamOf(side);
    if (stream) {
      return <VideoTile stream={stream} muted={mine} mirror={mine} maskId={mask} label={nameOf(side)} />;
    }
    if (mask) return <Mask id={mask} size="100%" bare />;
    // On camera and off the call: no character to stand in the light.
    return (
      <span className="vd-mono" aria-hidden="true">
        {nameOf(side).slice(0, 1)}
      </span>
    );
  };

  const fighter = (side: Side, o: { big?: boolean; dim?: boolean; score?: ReactNode; gold?: boolean } = {}) => (
    <div
      key={side}
      className={`vd-fighter ${sideCls(side)} ${o.big ? 'vd-big' : ''} ${o.dim ? 'vd-dim' : ''} ${
        o.gold ? 'vd-gold' : ''
      } ${onCamera(side) ? 'vd-cam' : ''}`}
    >
      <div className="vd-lit">
        <Cone color={side === 'FOR' ? '#F0821E' : '#1FC2D4'} id={`vdCone${side}`} />
        <div className="vd-art">{art(side)}</div>
      </div>
      <div className="vd-name">
        {mySide !== undefined && side === me ? <span className="vd-you">{t('you')}</span> : null}
        <span className="vd-name-text">{nameOf(side)}</span>
      </div>
      {callOn && side === them && !rtcConnected ? <span className="vd-left">{t('leftCall')}</span> : null}
      {o.score !== undefined ? <div className="vd-total num">{o.score}</div> : null}
    </div>
  );

  const callLine = botOpponent ? null : callOn ? (
    <div className="vd-call">
      <span className="vd-call-dot" aria-hidden="true" />
      <span>{t(avatars?.[me] ? 'stillLiveMasked' : 'stillLive')}</span>
      <button className="btn btn-small" onClick={onLeaveCall}>
        {t('leaveCall')}
      </button>
    </div>
  ) : (
    <p className="vd-call-off">{t('youLeft')}</p>
  );

  /* ------------------------------ the wait ------------------------------ */

  if (!info) {
    const failed = status?.state === 'failed' ? status : null;
    return (
      <div className="stage vd vd-wait" style={gel}>
        <p className="kicker vd-topic">{topic?.[lang] ?? ''}</p>
        <div className="vd-stage">{order.map((s) => fighter(s))}</div>
        {failed ? (
          <>
            <h1 className="display vd-deciding">{t('judgeFailed')}</h1>
            <p className="subtitle">{t(failed.message ?? 'judgeFailedSub')}</p>
            <div className="vd-actions">
              {!failed.terminal ? (
                <button className="btn btn-primary" onClick={onRetry}>
                  {t('callJudgeBack')}
                </button>
              ) : null}
              <button className={`btn ${failed.terminal ? 'btn-primary' : ''}`} onClick={home}>
                {t('backHome')}
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className="display vd-deciding">{t('deliberating')}</h1>
            {/* Honest: it moves, it never claims a percentage it cannot know. */}
            <div className="vd-progress" role="progressbar" aria-label={t('deliberating')}>
              <i />
            </div>
          </>
        )}
        {callLine}
      </div>
    );
  }

  /* ------------------------------ the result ---------------------------- */

  const { verdict, names } = info;
  const winner = verdict.winner;
  const ruling = verdict.ruling;
  // Zero words from you means the mic never reached the judge. Say that
  // plainly instead of VICTORY or DEFEAT, otherwise it reads as a defeat you
  // earned, and the only way to find out was to ask the coach and be told
  // "I heard nothing", which is how this surfaced in the first place.
  const notHeard = mySide !== undefined && info.heard?.[mySide] === 0;
  const youWon = mySide !== undefined && mySide === winner;
  const outcome = mySide === undefined || notHeard ? 'neutral' : youWon ? 'won' : 'lost';
  const e = ease(progress);
  const score = (s: Side) =>
    ruling ? `${Math.round(ruling.split[s] * e)}%` : Math.round(total(verdict.scores[s]) * e);

  // What the match did to your rating, in one line.
  let rating: ReactNode = null;
  if (mySide !== undefined && !notHeard) {
    const elo = info.elo?.[mySide];
    if (elo) {
      const delta = elo.after - elo.before;
      // One line of Elo literacy when we know who you played, which kills
      // "why did I only get six points" for good.
      const favoured = opponentRating !== undefined ? elo.before > opponentRating : null;
      const why =
        favoured === null
          ? null
          : youWon
            ? t(favoured ? 'eloFavored' : 'eloUnderdog')
            : t(favoured ? 'eloUpsetLoss' : 'eloExpectedLoss');
      rating = (
        <div className="vd-rating-wrap vd-in" style={delay(0.2)}>
          <p className={`vd-rating ${delta > 0 ? 'up' : ''}`}>
            <b className="elo">{delta > 0 ? `+${delta}` : delta < 0 ? `−${-delta}` : '0'}</b>
            <span>{withNum(t('vdNow'), elo.after)}</span>
          </p>
          {why ? <p className="vd-rating-sub">{why}</p> : null}
        </div>
      );
    } else if (info.placement) {
      // A measurement, not a prize: paper, never gold, win or lose.
      rating = (
        <div className="vd-rating-wrap vd-in" style={delay(0.2)}>
          <p className="vd-rating">
            <span>{withNum(t('vdStartAt'), info.placement.rating)}</span>
          </p>
          <p className="vd-rating-sub">{t('placedLine')}</p>
        </div>
      );
    } else if (botOpponent) {
      rating = (
        <p className="vd-rating-note vd-in" style={delay(0.2)}>
          {t('vdBotUnrated')}
        </p>
      );
    }
  }

  // Next steps: one loud button, the same mode again where that exists.
  const friendRoom = !botOpponent && !ranked;
  let again: ReactNode = null;
  if (friendRoom && !rematch?.peerLeft) {
    again = rematch?.youWant ? (
      <button className="btn btn-primary" disabled>
        {t('rematchWaiting', { x: peerName })}
      </button>
    ) : (
      <button className="btn btn-primary" onClick={onRematch}>
        {rematch?.peerWant ? t('rematchAccept', { x: peerName }) : t('rematch')}
      </button>
    );
  } else if (botOpponent && onPlayAgain && !info.placement) {
    again = (
      <button
        className="btn btn-primary"
        disabled={starting}
        onClick={() => {
          setStarting(true);
          onPlayAgain();
        }}
      >
        {starting ? t('vdStarting') : t('vdPlayAgain', { x: botOpponent.name })}
      </button>
    );
  }
  const coachOn = mySide !== undefined;

  const myNotes = mySide !== undefined ? verdict.feedback[me] ?? [] : [];
  const myQuote = mySide !== undefined ? verdict.bestQuote[me] : '';
  const reason = ruling?.decree || verdict.summary;
  const noteSides: Side[] = mySide !== undefined ? [them] : ['FOR', 'AGAINST'];

  return (
    <div className={`stage vd vd-${outcome} ${skipped ? 'vd-skip' : ''}`} style={gel} onPointerDown={skip}>
      <p className="kicker vd-topic">{topic?.[lang] ?? ''}</p>

      <div className="vd-grid">
        <section className="vd-result">
          <h1 className={`display vd-word vd-in ${outcome}`}>
            {outcome === 'won' ? t('youWon') : outcome === 'lost' ? t('youLost') : t('vdWins', { x: names[winner] })}
          </h1>

          <div className="vd-stage vd-in" style={delay(0.06)}>
            {order.map((s) =>
              fighter(s, {
                big: s === winner,
                dim: s !== winner,
                score: score(s),
                gold: s === winner && outcome === 'won',
              }),
            )}
          </div>

          {notHeard ? (
            <div className="vd-notheard vd-in" style={delay(0.2)}>
              <p className="vd-notheard-line">{t('notHeard')}</p>
              <p className="vd-notheard-fix">{t('notHeardFix')}</p>
            </div>
          ) : null}
          {rating}
          {unlocked ? (
            <p className="vd-unlock vd-in" style={delay(0.25)}>
              {unlocked.unlocked ? t('unlockedTape', { x: unlocked.unlocked }) : t('campaignDone')}
            </p>
          ) : null}

          <div className="vd-actions vd-in" style={delay(0.3)}>
            {again ?? (
              <button className="btn btn-primary" onClick={home}>
                {t('backHome')}
              </button>
            )}
            <div className="vd-actions-row">
              {again ? (
                <button className="btn" onClick={home}>
                  {t('backHome')}
                </button>
              ) : null}
              {coachOn ? (
                <button
                  className="btn"
                  onClick={() => coachRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                >
                  {t('coachTitle')}
                </button>
              ) : null}
            </div>
            {friendRoom && rematch?.peerLeft ? (
              <p className="vd-action-note">{t('rematchPeerLeft', { x: peerName })}</p>
            ) : null}
          </div>

          {saveNudge ? (
            <div className="vd-save vd-in" style={delay(0.35)}>
              <p>{t('saveThisNudge')}</p>
              <button className="btn btn-small btn-google" onClick={signIn}>
                {t('signInGoogle')}
              </button>
            </div>
          ) : null}
          {callLine}
        </section>

        <section className="vd-why vd-in" style={delay(0.35)}>
          {verdict.injectionDetected ? <div className="banner banner-warn">{t('injection')}</div> : null}

          {reason ? (
            <div className="vd-reason">
              <span className="vd-label">{t('vdJudge')}</span>
              <p>{reason}</p>
            </div>
          ) : null}

          {ruling && ruling.orders.length > 0 ? (
            <div className="vd-orders">
              <span className="vd-label">{t('theOrders')}</span>
              {ruling.orders.map((o, i) => (
                <p key={i}>{o}</p>
              ))}
            </div>
          ) : null}

          {ruling && framing ? (
            <div className="vd-said">
              <span className="vd-label">{t('vdSaid')}</span>
              {order.map((s) => (
                <div className="vd-said-one" key={s}>
                  <span className={`vd-said-who ${sideCls(s)}`}>{names[s]}</span>
                  <p>&ldquo;{framing.said[s]}&rdquo;</p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="vd-score">
            <div className="vd-legend">
              {order.map((s) => (
                <span key={s} className={`vd-key ${sideCls(s)}`}>
                  <i aria-hidden="true" />
                  {mySide !== undefined && s === me ? t('you') : names[s]}
                </span>
              ))}
            </div>
            {CATEGORIES.map((c) => (
              <div className="vd-row" key={c.key}>
                <div className="vd-row-head">
                  <span className="vd-cat">
                    {t(c.labelKey)}
                    <span className="vd-cat-desc">{t(c.descKey)}</span>
                  </span>
                  <span className="vd-cat-max num">/{c.max}</span>
                </div>
                {order.map((s) => (
                  <div className="vd-bar-row" key={s}>
                    <div className="vd-bar">
                      <i
                        className={sideCls(s)}
                        style={{ width: `${(verdict.scores[s][c.key] / c.max) * 100 * e}%` }}
                      />
                    </div>
                    <span className={`vd-n num ${sideCls(s)}`}>{verdict.scores[s][c.key]}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* The judge writes two notes per debater: bullet one is the
              strongest thing they did, bullet two the thing that cost them. */}
          {myNotes.length > 0 ? (
            <div className="vd-notes">
              {myNotes[0] ? (
                <div className="vd-note">
                  <span className="vd-label">{t('vdWorked')}</span>
                  <p>{myNotes[0]}</p>
                </div>
              ) : null}
              {myNotes[1] ? (
                <div className="vd-note vd-note-fix">
                  <span className="vd-label">{t('vdFix')}</span>
                  <p>{myNotes[1]}</p>
                </div>
              ) : null}
            </div>
          ) : null}

          {myQuote ? (
            <blockquote className="vd-quote">
              <span className="vd-label">{t('vdBestLine')}</span>
              <p>&ldquo;{myQuote}&rdquo;</p>
            </blockquote>
          ) : null}
        </section>
      </div>

      <section className="vd-more">
        {coachOn ? (
          <div className="coach-card card vd-coach" ref={coachRef}>
            <h3 className="coach-title">{t('coachTitle')}</h3>
            {/* one chat, not two. the note is what tells you arguing with the
                ruling is on the table at all, no mode switch needed. */}
            <p className="coach-note">{t('coachNote')}</p>
            {coachLog.length > 0 || coachThinking ? (
              <div className="coach-log">
                {coachLog.map((m, i) => (
                  <p key={i} className={`coach-msg ${m.role}`}>
                    {m.error ? t('coachError') : m.text}
                  </p>
                ))}
                {coachThinking ? <p className="coach-msg coach thinking">{t('coachThinking')}</p> : null}
              </div>
            ) : null}

            {coachAsks < COACH_LIMIT ? (
              <>
                <div className="coach-presets">
                  {[youWon ? 'coachHowWon' : 'coachWhyLost', 'coachImprove', 'coachChallenge'].map((key) => (
                    <button
                      key={key}
                      className="btn btn-small"
                      disabled={coachThinking}
                      onClick={() => askCoach(t(key))}
                    >
                      {t(key)}
                    </button>
                  ))}
                </div>
                <div className="coach-input-row">
                  <input
                    className="input"
                    value={coachInput}
                    placeholder={t('coachPlaceholder')}
                    maxLength={300}
                    onChange={(ev) => setCoachInput(ev.target.value)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter') askCoach(coachInput);
                    }}
                  />
                  <button
                    className="btn"
                    disabled={coachThinking || !coachInput.trim()}
                    onClick={() => askCoach(coachInput)}
                  >
                    {t('coachSend')}
                  </button>
                </div>
              </>
            ) : (
              <p className="coach-done">{t('coachDone')}</p>
            )}
          </div>
        ) : null}

        {noteSides.map((s) =>
          verdict.feedback[s]?.length || verdict.bestQuote[s] ? (
            <div className="vd-theirs" key={s}>
              <span className="vd-label">{t('vdTheirNotes', { x: names[s] })}</span>
              {verdict.bestQuote[s] ? <p className="vd-theirs-quote">&ldquo;{verdict.bestQuote[s]}&rdquo;</p> : null}
              <ul>
                {(verdict.feedback[s] ?? []).map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          ) : null,
        )}

        {/* Opt-in per debate. Nothing leaves until you press it, and even
            then the result rides inside the link rather than a database. */}
        <div className="vd-util">
          <button className="btn btn-small" disabled={shareState === 'working'} onClick={share}>
            {shareState === 'copied' ? t('shareCopied') : t('shareBtn')}
          </button>
          <button className="btn btn-small ghost" onClick={toggleMute}>
            {muted ? t('unmuteStage') : t('muteStage')}
          </button>
        </div>
        <p className="vd-util-note">{shareState === 'failed' ? t('shareFailed') : t('shareNote')}</p>

        {!botOpponent ? <ReportFlag /> : null}
        <p className="footnote">{t('condolences', { x: names[winner === 'FOR' ? 'AGAINST' : 'FOR'] })}</p>
      </section>
    </div>
  );
}
