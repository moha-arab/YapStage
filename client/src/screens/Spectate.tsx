import { useEffect, useState } from 'react';
import type {
  PhaseUpdate,
  Side,
  SpectateState,
  Verdict as VerdictData,
} from '../../../server/src/protocol';
import { socket } from '../socket';
import { useI18n } from '../i18n';
import { formatClock, useCountdown } from '../useCountdown';
import { enqueueSpectateAudio, spectateAudioElement, stopSpectateAudio } from '../specaudio';
import { ScoreBars, capFirst, totalOf } from '../VerdictBlocks';
import BotAvatar from '../BotAvatar';
import Mask from '../Mask';
import Brand from '../Brand';
import { TileBust } from '../VideoTile';
import { MatchTrack, MotionStrip, ROUND_KEY, SHAPE, debateLeftMs, turnSeconds, useSchedule } from '../MatchTrack';
import '../debate.css';

/** Abort reasons whose copy reads right to a watcher. abortGone ("while you
    were away") and debateStopped ("You lost the connection") are written to
    a debater, so a watcher gets the heading alone for those. */
const SPECTATOR_REASONS = new Set(['abortWifi', 'botOutage', 'serverRestart', 'connDied', 'verdictLost']);

interface Props {
  code: string;
  initial: SpectateState | null;
  onLeave: () => void;
  /** Swipe to another live ranked debate. Absent when watching by code —
      a custom lobby is one specific room, not a channel to flip through. */
  onNext?: () => void;
}

/** Watching a debate you are not in: live state and live audio, no cameras
    asked of anyone. Video spectating needs the SFU (PRD Step 4); this screen
    is built to gain video without changing shape.

    A spectator sees the debaters' own layout (see Debate.tsx): the track, the
    two lit frames, the motion on the paper strip. No "you", no pass the mic;
    the strip's buttons are the watcher's own. */
export default function Spectate({ code, initial, onLeave, onNext }: Props) {
  const { lang, t } = useI18n();
  const [state, setState] = useState<SpectateState | null>(initial);
  const [phase, setPhase] = useState<PhaseUpdate | null>(initial?.phase ?? null);
  const [watchers, setWatchers] = useState(initial?.watchers ?? 1);
  const [verdict, setVerdict] = useState<{
    verdict: VerdictData;
    names: Record<Side, string>;
  } | null>(null);
  const [judging, setJudging] = useState(false);
  const [aborted, setAborted] = useState<{ reason: string; vars?: Record<string, string> } | null>(null);
  // The debaters' voices, on or off. The clips keep arriving and playing in
  // order either way, so unmuting lands you live, not a minute behind.
  const [muted, setMuted] = useState(false);
  useEffect(() => {
    spectateAudioElement().muted = muted;
  }, [muted]);
  useEffect(
    () => () => {
      spectateAudioElement().muted = false;
    },
    [],
  );
  const msLeft = useCountdown(phase?.deadline, phase?.serverNow);
  const schedule = useSchedule(phase);

  useEffect(() => {
    const onState = (s: SpectateState) => {
      setState(s);
      if (s.phase) setPhase(s.phase);
      setWatchers(s.watchers);
    };
    const onPhase = (p: PhaseUpdate) => {
      setJudging(false);
      setPhase(p);
    };
    const onAudio = (p: { data: ArrayBuffer; mime: string }) =>
      enqueueSpectateAudio(p.data, p.mime);
    const onCount = (p: { n: number }) => setWatchers(p.n);
    const onEnded = () => setJudging(true);
    const onVerdict = (p: { verdict: VerdictData; names: Record<Side, string> }) => {
      setJudging(false);
      setVerdict(p);
    };
    const onAborted = (p: { reason: string; vars?: Record<string, string> }) => setAborted(p);
    socket.on('spectate:state', onState);
    socket.on('debate:phase', onPhase);
    socket.on('spectate:audio', onAudio);
    socket.on('spectate:count', onCount);
    socket.on('debate:ended', onEnded);
    socket.on('verdict:result', onVerdict);
    socket.on('debate:aborted', onAborted);
    return () => {
      socket.off('spectate:state', onState);
      socket.off('debate:phase', onPhase);
      socket.off('spectate:audio', onAudio);
      socket.off('spectate:count', onCount);
      socket.off('debate:ended', onEnded);
      socket.off('verdict:result', onVerdict);
      socket.off('debate:aborted', onAborted);
      stopSpectateAudio();
    };
  }, []);

  function leave() {
    socket.emit('spectate:leave');
    stopSpectateAudio();
    onLeave();
  }

  // A room can be over before you arrive: opened by code after the judge
  // ruled, or after it was called off. The snapshot says so (status and its
  // verdict or abort), and a live room says so with the same two events.
  const ended =
    verdict ??
    (state?.status === 'verdict' && state.verdict && state.names
      ? { verdict: state.verdict, names: state.names }
      : null);
  const abortInfo = aborted ?? (state?.status === 'aborted' ? (state.abort ?? { reason: 'abortGone' }) : null);
  const names = ended?.names ?? state?.names;

  function next() {
    socket.emit('spectate:leave');
    stopSpectateAudio();
    onNext?.();
  }

  // Live marks only while there is something live: a finished room has no
  // audience count and no voices to mute.
  const topbar = (live: boolean) => (
    <header className="topbar spec-topbar">
      <Brand />
      {live ? (
        <>
          {/* The debaters' own live mark. It was an amber block, and amber is FOR. */}
          <span className="live-tag">
            <i />
            {t('liveNow')}
          </span>
          <span className="spec-watchers">{t('specWatching', { n: watchers })}</span>
          <button className="btn btn-small ghost spec-mute" aria-pressed={muted} onClick={() => setMuted((m) => !m)}>
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              <path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor" />
              {muted ? (
                <path d="M11 6l4 4M15 6l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              ) : (
                <path
                  d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.5a6 6 0 0 1 0 9"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              )}
            </svg>
            {muted ? t('specUnmute') : t('specMute')}
          </button>
        </>
      ) : null}
    </header>
  );

  // The end of the line: the judge has spoken, or the debate died. Either
  // way the one thing to do is the next debate (or leave), so the buttons
  // sit right under the headline, above the detail.
  if (ended || abortInfo) {
    const topic = state?.topic?.[lang] ?? code;
    const actions = (
      <div className="spec-actions">
        {onNext ? (
          <button className="btn btn-primary" onClick={next}>
            {t('feedNext')}
          </button>
        ) : null}
        <button className={`btn ${onNext ? '' : 'btn-primary'}`} onClick={leave}>
          {t('specLeave')}
        </button>
      </div>
    );

    if (ended) {
      // A compact result in the results screen's language: who won as a
      // sentence (a watcher did not win, so no gold), both totals, the
      // judge's line and the four categories.
      const v = ended.verdict;
      const n = ended.names;
      const ruling = v.ruling;
      const finalOf = (s: Side) => (ruling ? `${ruling.split[s]}%` : String(totalOf(v.scores[s])));
      const reason = ruling?.decree || v.summary;
      return (
        <div className="stage center-col spectate spec-end">
          {topbar(false)}
          <p className="kicker vd-topic">{topic}</p>
          <h1 className="display vd-word neutral">{t('vdWins', { x: n[v.winner] })}</h1>
          <p className="spec-final">
            <span className="is-for">{n.FOR}</span> <b className="num">{finalOf('FOR')}</b>
            <span className="spec-final-sep" aria-hidden="true">
              ·
            </span>
            <b className="num">{finalOf('AGAINST')}</b> <span className="is-against">{n.AGAINST}</span>
          </p>
          {actions}
          <div className="spec-why">
            {reason ? (
              <div className="vd-reason">
                <span className="vd-label">{t('vdJudge')}</span>
                <p>{capFirst(reason)}</p>
              </div>
            ) : null}
            {!ruling ? (
              <ScoreBars scores={v.scores} order={['FOR', 'AGAINST']} nameOf={(s) => n[s]} watcher />
            ) : null}
          </div>
        </div>
      );
    }

    const why = abortInfo && SPECTATOR_REASONS.has(abortInfo.reason) ? t(abortInfo.reason, abortInfo.vars) : null;
    return (
      <div className="stage center-col spectate spec-end">
        {topbar(false)}
        <p className="kicker vd-topic">{topic}</p>
        <h1 className="display spec-end-word">{t('specEndedEarly')}</h1>
        {why ? <p className="subtitle">{why}</p> : null}
        {actions}
      </div>
    );
  }

  // A room that has not started (a friend's green room, opened by its code):
  // no motion, no names and nothing live yet. It used to draw the match with
  // the room code as the motion, "..." for both names and a LIVE tag. The
  // server sends a fresh snapshot the moment the debate begins, and the
  // first phase follows, so this turns into the match on its own.
  const notStarted =
    !phase && !judging && (!state || state.status === 'waiting' || state.status === 'greenroom' || !state.topic);
  if (notStarted) {
    return (
      <div className="stage center-col spectate spec-end">
        <header className="topbar spec-topbar">
          <Brand />
          <span className="spec-watchers">{t('specWatching', { n: watchers })}</span>
        </header>
        <h1 className="display spec-end-word">{t('specRoomWaiting')}</h1>
        <p className="subtitle">{t('specRoomWaitingSub')}</p>
        <div className="spec-actions">
          <button className="btn btn-primary" onClick={leave}>
            {t('specLeave')}
          </button>
        </div>
      </div>
    );
  }

  const live = phase && !judging;
  const active: Side | null = live ? phase.activeSpeaker : null;
  // Once the judge is out, every turn has been spoken.
  const step = judging ? SHAPE.length : phase ? phase.stepIndex : -1;
  const turnMs = phase ? turnSeconds(phase) * 1000 : 1;
  // A bot's step runs a wider server window than its turn; cap at the turn.
  const turnLeft = Math.min(msLeft, turnMs);

  const fighter = (side: Side) => {
    const isBot = state?.bot?.side === side;
    const art =
      isBot && state?.bot ? (
        <BotAvatar botId={state.bot.id} color={state.bot.color} size="100%" bare />
      ) : state?.avatars?.[side] ? (
        // Humans wear masks here. Watching a ranked debate you see exactly
        // this and nothing else: the mask IS the face of the sport.
        <Mask id={state.avatars[side]!} size="100%" bare />
      ) : null;
    // The debaters' own frame: the character stands on the bottom edge and the
    // tile of whoever has the floor lights in their colour (.tile-active).
    return (
      <div
        className={`tile tile-masked ${side === 'FOR' ? 'tile-for' : 'tile-against'} ${
          active === side ? 'tile-active' : ''
        }`}
      >
        {art ? <TileBust>{art}</TileBust> : <span className="spec-fighter-glyph">?</span>}
        <div className="tag">
          <span className="tag-name">{names?.[side] ?? '...'}</span>
          <span className="tag-sub">{t(side)}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="stage debate spectate">
      {topbar(true)}

      <MatchTrack
        schedule={schedule}
        step={step}
        fill={1 - turnLeft / turnMs}
        label={
          live ? (
            <>
              {t('turnOf', { n: phase.stepIndex + 1 })} · <b>{t(ROUND_KEY[phase.phase])}</b>
            </>
          ) : (
            <b>{judging ? t('specDeliberating') : t('specWaitingStart')}</b>
          )
        }
        clock={live ? formatClock(msLeft) : null}
        clockSide={phase?.activeSpeaker}
        clockDanger={msLeft < 10_000}
        sub={
          live
            ? phase.stepIndex >= SHAPE.length - 1
              ? t('dvLastTurn')
              : t('dvTotalLeft', { t: formatClock(debateLeftMs(schedule, phase.stepIndex, turnLeft)) })
            : null
        }
      />

      <div className="dv-stage">
        {/* FOR on the left, AGAINST on the right, as the track reads. */}
        <div className="dv-tiles">
          {fighter('FOR')}
          {fighter('AGAINST')}
        </div>
        <div
          className={`dv-status ${active === 'AGAINST' ? 'dv-status-end' : 'dv-status-start'} ${
            active === 'AGAINST' ? 'dv-against' : 'dv-for'
          }`}
          aria-live="polite"
        >
          {active ? <b>{t('dvSpeaking', { x: names?.[active] ?? '...' })}</b> : null}
        </div>
      </div>

      <MotionStrip kicker={t('theMotion')} motion={state?.topic?.[lang] ?? code}>
        {onNext ? (
          <button className="btn dv-pass" onClick={next}>
            {t('feedNext')}
          </button>
        ) : null}
        <button className="btn dv-quiet" onClick={leave}>
          {t('specLeave')}
        </button>
      </MotionStrip>
    </div>
  );
}
