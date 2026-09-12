import { useEffect, useState, type CSSProperties } from 'react';
import { useElementLevel } from '../useElementLevel';
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
import BotAvatar from '../BotAvatar';
import Mask from '../Mask';
import Brand from '../Brand';

interface Props {
  code: string;
  initial: SpectateState | null;
  onLeave: () => void;
  /** Swipe to another live ranked debate. Absent when watching by code —
      a custom lobby is one specific room, not a channel to flip through. */
  onNext?: () => void;
}

const PHASES: { key: string; labelKey: string }[] = [
  { key: 'opening', labelKey: 'openings' },
  { key: 'rebuttal', labelKey: 'rebuttals' },
  { key: 'defense', labelKey: 'defenses' },
  { key: 'closing', labelKey: 'closings' },
];

/** Watching a debate you are not in: live state and live audio, no cameras
    asked of anyone. Video spectating needs the SFU (PRD Step 4); this screen
    is built to gain video without changing shape. */
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
  // The ring follows the clip the spectator is actually hearing, which runs a
  // segment behind the live turn. Better in sync with the ear than with the
  // clock: a mouth that moved during silence was the old complaint.
  const specLevel = useElementLevel(spectateAudioElement());

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

  const fighter = (side: Side) => {
    const isBot = state?.bot?.side === side;
    const active = phase?.activeSpeaker === side && !verdict && !judging;
    return (
      <div className={`spec-fighter ${side === 'FOR' ? 'for' : 'against'} ${active ? 'spec-live' : ''}`}>
        <div className="mask-ring spec-ring" style={{ '--lv': active ? specLevel : 0 } as CSSProperties}>
          {isBot && state?.bot ? (
            <BotAvatar botId={state.bot.id} color={state.bot.color} size="100%" bare />
          ) : state?.avatars?.[side] ? (
            // Humans wear masks here. Watching a ranked debate you see exactly
            // this and nothing else — the mask IS the face of the sport.
            <Mask id={state.avatars[side]!} size="100%" bare />
          ) : (
            <span className="spec-fighter-glyph">?</span>
          )}
        </div>
        <span className="spec-fighter-name">{names?.[side] ?? '...'}</span>
        <span className="spec-fighter-side">{t(side)}</span>
        {active ? <span className="live-pill">{t('onTheMic')}</span> : null}
      </div>
    );
  };

  return (
    <div className="stage center-col spectate">
      <header className="topbar spec-topbar">
        <Brand />
        <span className="tape spec-live-tape">{t('specLive')}</span>
        <span className="spec-watchers">{t('specWatching', { n: watchers })}</span>
      </header>

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
      ) : (
        <>
          {phase ? (
            <div className="round-card">
              {PHASES.map((p) => (
                <span key={p.key} className={`round ${phase.phase === p.key ? 'round-now' : ''}`}>
                  {t(p.labelKey)}
                </span>
              ))}
              <span className="round-step">{t('turnOf', { n: phase.stepIndex + 1 })}</span>
            </div>
          ) : null}

          <div className="spec-fighters">
            {fighter('FOR')}
            <span className="vs">VS</span>
            {fighter('AGAINST')}
          </div>

          {judging ? (
            <p className="deliberating display spec-deliberating">{t('specDeliberating')}</p>
          ) : phase ? (
            <div className="shot-clock">{formatClock(msLeft)}</div>
          ) : (
            <p className="subtitle">{t('specWaitingStart')}</p>
          )}

          <div className="spec-actions">
            {onNext ? (
              <button
                className="btn btn-primary"
                onClick={() => {
                  socket.emit('spectate:leave');
                  stopSpectateAudio();
                  onNext();
                }}
              >
                {t('feedNext')}
              </button>
            ) : null}
            <button className="btn btn-small" onClick={leave}>
              {t('specLeave')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
