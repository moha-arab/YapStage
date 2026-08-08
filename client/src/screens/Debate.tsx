import { useEffect, useState } from 'react';
import type { DebateStart, PhaseUpdate, Side } from '../../../server/src/protocol';
import { formatClock, useCountdown } from '../useCountdown';
import { useAudioLevel } from '../useAudioLevel';
import { useI18n } from '../i18n';
import MicMeter from '../MicMeter';
import VideoTile from '../VideoTile';
import BotAvatar from '../BotAvatar';

interface Props {
  start: DebateStart;
  phase: PhaseUpdate | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  remoteVideoDead: boolean;
  peerLostUntil: number | null;
  rtcState: RTCPeerConnectionState | null;
  speechHeard: boolean;
  speechSupported: boolean;
  sttServer: boolean;
  mediaError: string | null;
  onRetryMedia: () => void;
  botOpponent?: { id: string; name: string; color: string } | null;
  botTurn?: { stepIndex: number; text: string } | null;
  botSpeaking?: boolean;
  botSpeakDeadline?: number | null;
  /** The bot's turn failed to generate: our outage, not its silence. */
  botFailed?: boolean;
  /** How many of YOUR words the judge has actually transcribed this turn. Not
      shown as text on purpose: a debate is not a dictation app, and subtitles
      running seconds behind your own mouth pull your eyes off the fight. */
  heardWords?: number;
  /** People spectating this debate. Debaters must always know. */
  watchers?: number;
  onPassMic: (stepIndex: number) => void;
}

const PHASES: { key: string; labelKey: string }[] = [
  { key: 'opening', labelKey: 'openings' },
  { key: 'rebuttal', labelKey: 'rebuttals' },
  { key: 'defense', labelKey: 'defenses' },
  { key: 'closing', labelKey: 'closings' },
];

export default function Debate({
  start,
  phase,
  localStream,
  remoteStream,
  remoteVideoDead,
  peerLostUntil,
  rtcState,
  speechHeard,
  speechSupported,
  sttServer,
  mediaError,
  onRetryMedia,
  botOpponent,
  botTurn,
  botSpeaking,
  botSpeakDeadline,
  botFailed,
  heardWords = 0,
  watchers = 0,
  onPassMic,
}: Props) {
  const { lang, t } = useI18n();
  const isBot = Boolean(botOpponent);
  const mySide = start.yourSide;
  // Settle-it replaces FOR/AGAINST with what each person is actually arguing.
  const label = (side: Side) => start.framing?.positions[side] ?? t(side);
  const peerSide: Side = mySide === 'FOR' ? 'AGAINST' : 'FOR';
  const revealMs = useCountdown(start.startsAt, start.serverNow);
  const msLeft = useCountdown(phase?.deadline, phase?.serverNow);
  // Client-local deadline for the bot's speaking clock (no server offset).
  const botMsLeft = useCountdown(
    botSpeakDeadline ?? undefined,
    botSpeakDeadline ? Date.now() : undefined,
  );
  const graceMs = useCountdown(peerLostUntil ?? undefined, peerLostUntil ? Date.now() : undefined);
  const localLevel = useAudioLevel(localStream);
  const remoteLevel = useAudioLevel(remoteStream);
  // (Wake lock lives in App now — it must span the verdict screens too.)

  // "Pass the mic" arms 2s into your turn so a click aimed at something else
  // can't yield a turn that just started under the cursor.
  const [passArmed, setPassArmed] = useState(false);
  useEffect(() => {
    setPassArmed(false);
    const id = setTimeout(() => setPassArmed(true), 2000);
    return () => clearTimeout(id);
  }, [phase?.stepIndex]);

  // Before the first phase event: the fight card.
  if (!phase) {
    return (
      <div className="stage center-col reveal">
        <p className="kicker">{t('tonightsMotion')}</p>
        <h1 className="display motion">{start.topic[lang]}</h1>
        <div className="versus">
          <span className="fighter for">{start.names.FOR}</span>
          <span className="vs">VS</span>
          <span className="fighter against">{start.names.AGAINST}</span>
        </div>
        <div className={`side-badge ${mySide === 'FOR' ? 'for' : 'against'}`}>
          {t('youArgue', { x: label(mySide) })}
        </div>
        <p className="subtitle">
          {t('noTakebacks', { x: start.names.FOR, n: Math.max(1, Math.ceil(revealMs / 1000)) })}
        </p>
      </div>
    );
  }

  const myTurn = phase.activeSpeaker === mySide;
  // Hear the opponent ONLY on their turn — belt-and-suspenders with their
  // own mic being disabled on our turn.
  const remoteMuted = phase.activeSpeaker !== peerSide;
  // The bot's argument for THIS turn (null while it's still generating).
  const botText = botTurn && botTurn.stepIndex === phase.stepIndex ? botTurn.text : null;
  const botThinking = isBot && !myTurn && !botText && !botFailed;
  // While the bot SPEAKS it runs the same visible shot clock a human gets.
  const botOnClock = isBot && !myTurn && Boolean(botSpeakDeadline) && !botThinking;
  const clockMs = botOnClock ? botMsLeft : msLeft;
  const clockTotalSec = botOnClock ? (phase.speakSeconds ?? phase.seconds) : phase.seconds;
  const danger = clockMs < 10_000 && (myTurn || botOnClock || !isBot);

  return (
    <div className="stage debate">
      <header className="topbar">
        <span className="brand">
          YAP<span className="logo-accent">STAGE</span>
        </span>
        <span className="motion-banner">{start.topic[lang]}</span>
      </header>

      <div className="arena">
      <div className="round-card">
        {PHASES.map((p) => (
          <span key={p.key} className={`round ${phase.phase === p.key ? 'round-now' : ''}`}>
            {t(p.labelKey)}
          </span>
        ))}
        <span className="round-step">{t('turnOf', { n: phase.stepIndex + 1 })}</span>
        {watchers > 0 ? <span className="watch-pill">{t('specWatching', { n: watchers })}</span> : null}
      </div>

      <div className="tiles">
        <div className="tile-stack">
          <VideoTile
            stream={localStream}
            muted
            mirror
            label={start.names[mySide]}
            sub={`${t('you')} · ${label(mySide)}`}
            side={mySide}
            active={myTurn}
          />
          <MicMeter level={localLevel} label={t('yourMic')} />
        </div>
        {isBot && botOpponent ? (
          <div className="tile-stack">
            <div className={`tile bot-tile tile-${peerSide === 'FOR' ? 'for' : 'against'} ${!myTurn ? 'tile-active' : ''}`}>
              <BotAvatar
                botId={botOpponent.id}
                color={botOpponent.color}
                speaking={Boolean(botSpeaking) && !myTurn}
                size={200}
              />
              <div className="tag">
                <span className="tag-name">{botOpponent.name}</span>
                <span className="tag-sub">{label(peerSide)}</span>
              </div>
              {!myTurn ? (
                <div className="live-pill">{botThinking ? t('botThinking') : t('onTheMic')}</div>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="tile-stack">
            <VideoTile
              stream={remoteStream}
              muted={remoteMuted}
              label={start.names[peerSide]}
              sub={label(peerSide)}
              side={peerSide}
              active={!myTurn}
              placeholder={t('theyFroze')}
              dead={remoteVideoDead}
            />
            <MicMeter level={remoteLevel} label={t('peerMic', { x: start.names[peerSide] })} />
          </div>
        )}
      </div>

      <div className="clock-row">
        <div className={`speaker-chip ${phase.activeSpeaker === 'FOR' ? 'for' : 'against'}`}>
          {start.names[phase.activeSpeaker]}
          {myTurn ? t('goSuffix') : t('hasTheMic')}
        </div>
        <div className={`shot-clock ${botFailed ? 'clock-failed' : danger ? 'clock-danger' : ''}`}>
          {botFailed
            ? t('botFailedShort')
            : botThinking
            ? t('botThinking')
            : isBot && !myTurn && !botOnClock
              ? formatClock(0) // bot just yielded; next turn lands in a beat
              : formatClock(clockMs)}
        </div>
        {/* "recording" only ever meant audio was being captured, which is what
            made a dead pipeline look healthy: the level bar bounced, the chip
            said recording, and the judge received nothing. This now flips only
            once real words have come back from transcription. */}
        <div className={`mic-chip ${myTurn ? (heardWords > 0 ? 'mic-heard' : 'mic-live') : 'mic-off'}`}>
          {myTurn
            ? sttServer
              ? heardWords > 0
                ? t('micHeard')
                : speechHeard
                  ? t('micRecording')
                  : t('micLive')
              : speechSupported
                ? speechHeard
                  ? t('micHears')
                  : t('micLouder')
                : t('micLive')
            : t('micOff')}
        </div>
      </div>

      <div className="clock-track">
        <div
          className={`clock-fill ${phase.activeSpeaker === 'FOR' ? 'fill-for' : 'fill-against'}`}
          style={{
            // While the bot thinks there's no clock to drain — the bar waits
            // full until it starts talking, then ticks down like anyone else's.
            width: botThinking
              ? '100%'
              : isBot && !myTurn && !botOnClock
                ? '0%'
                : `${Math.min(100, (clockMs / (clockTotalSec * 1000)) * 100)}%`,
          }}
        />
      </div>

      {/* What to actually SAY this round. A first-timer's hardest moment is a
          live mic and a blank mind, so the shape of the turn goes on screen
          while they speak. The defense line doubles as an early warning that
          new arguments are about to stop being allowed. */}
      {/* Always on screen, never only on your turn: when the opponent takes two
          turns in a row (their rebuttal, then their defense) a beginner has no
          idea what they're watching. On their turn it describes the round; on
          yours it tells you what to do. */}
      {botFailed ? (
        <p className="phase-rule phase-rule-failed">
          {t('botFailed', { x: botOpponent?.name ?? '' })}
        </p>
      ) : (
        <p className={`phase-rule ${myTurn && phase.phase === 'closing' ? 'phase-rule-live' : ''}`}>
          {t(myTurn ? `howto_${phase.phase}` : `whatis_${phase.phase}`)}
        </p>
      )}

      {/* AGAINST opens the closings so FOR gets the final word — flag it once
          so the order doesn't read as a bug. */}
      {phase.stepIndex === 6 ? <p className="phase-rule">{t('closingOrderNote')}</p> : null}

      {myTurn ? (
        <div className="pass-row">
          <button
            className="btn btn-small pass-mic"
            disabled={!passArmed}
            onClick={() => onPassMic(phase.stepIndex)}
          >
            {t('passMic')}
          </button>
        </div>
      ) : null}

      {mediaError ? (
        <div className="banner banner-error">
          {t(mediaError)}{' '}
          <button className="btn btn-small" onClick={onRetryMedia}>
            {t('retry')}
          </button>
        </div>
      ) : null}

      {!isBot && peerLostUntil ? (
        <div className="banner banner-warn">
          {t('reconnecting', { n: Math.max(0, Math.ceil(graceMs / 1000)) })}
        </div>
      ) : null}

      {!isBot && !peerLostUntil && (rtcState === 'disconnected' || rtcState === 'failed') ? (
        <div className="banner banner-warn">{t('videoDropped')}</div>
      ) : null}
      </div>
    </div>
  );
}
