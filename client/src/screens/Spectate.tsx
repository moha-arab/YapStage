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
import { enqueueSpectateAudio, stopSpectateAudio } from '../specaudio';
import BotAvatar from '../BotAvatar';
import Mask from '../Mask';
import Brand from '../Brand';
import { TileBust } from '../VideoTile';
import { MatchTrack, MotionStrip, ROUND_KEY, SHAPE, debateLeftMs, turnSeconds, useSchedule } from '../MatchTrack';
import '../debate.css';

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

    Since 2026-09-12 a spectator sees the debaters' own layout (see Debate.tsx):
    the track, the two lit frames, the motion on the paper strip. No "you",
    no pass the mic; the strip's buttons are the watcher's own. */
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
  const [aborted, setAborted] = useState<string | null>(null);
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
    const onAborted = (p: { reason: string }) => setAborted(p.reason);
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

  const names = verdict?.names ?? state?.names;
  const total = (s: VerdictData['scores'][Side]) =>
    s.argument + s.evidence + s.clash + s.delivery;

  const topbar = (
    <header className="topbar spec-topbar">
      <Brand />
      <span className="tape spec-live-tape">{t('specLive')}</span>
      <span className="spec-watchers">{t('specWatching', { n: watchers })}</span>
    </header>
  );

  // The end of the line: the debate died, or the judge has spoken.
  if (aborted || verdict) {
    return (
      <div className="stage center-col spectate">
        {topbar}
        <p className="kicker">{state?.topic?.[lang] ?? code}</p>
        {aborted ? (
          <>
            <h1 className="display">{t('specOver')}</h1>
            <button className="btn" onClick={leave}>
              {t('backHome')}
            </button>
          </>
        ) : verdict ? (
          <>
            <div className={`stamp ${verdict.verdict.winner === 'FOR' ? 'for' : 'against'}`}>
              <span className="stamp-label">{t('yapmaster')}</span>
              <span className="stamp-name display">{verdict.names[verdict.verdict.winner]}</span>
              <span className="stamp-side">{t(verdict.verdict.winner)}</span>
            </div>
            <p className="summary">{verdict.verdict.summary}</p>
            <p className="spec-score">
              {verdict.names.FOR} {total(verdict.verdict.scores.FOR)} · {' '}
              {total(verdict.verdict.scores.AGAINST)} {verdict.names.AGAINST}
            </p>
            <button className="btn" onClick={leave}>
              {t('backHome')}
            </button>
          </>
        ) : null}
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
      {topbar}

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
          <button
            className="btn dv-pass"
            onClick={() => {
              socket.emit('spectate:leave');
              stopSpectateAudio();
              onNext();
            }}
          >
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
