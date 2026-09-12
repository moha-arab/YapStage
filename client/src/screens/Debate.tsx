import { useEffect, useState } from 'react';
import type { DebateStart, PhaseUpdate, Side } from '../../../server/src/protocol';
import { formatClock, useCountdown } from '../useCountdown';
import { useAudioLevel } from '../useAudioLevel';
import { useElementLevel } from '../useElementLevel';
import { botVoiceElement } from '../botvoice';
import type { CSSProperties } from 'react';
import { useI18n } from '../i18n';
import MicMeter from '../MicMeter';
import VideoTile from '../VideoTile';
import BotAvatar from '../BotAvatar';
import ReportFlag from '../Report';
import Brand from '../Brand';
import FightCard from '../FightCard';

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
  // The bot's ring reads the level straight off its voice element, so it
  // moves with the words rather than looping for the whole clip.
  const botLevel = useElementLevel(botVoiceElement());
  // (Wake lock lives in App now — it must span the verdict screens too.)

  // "Pass the mic" arms 2s into your turn so a click aimed at something else
  // can't yield a turn that just started under the cursor.
  const [passArmed, setPassArmed] = useState(false);
  useEffect(() => {
    setPassArmed(false);
    const id = setTimeout(() => setPassArmed(true), 2000);
    return () => clearTimeout(id);
  }, [phase?.stepIndex]);

  // Before the first phase event: the fight card (both fighters on the
  // lobby's stage; see FightCard.tsx). The first debate:phase replaces it.
  if (!phase) {
    return (
      <FightCard start={start} localStream={localStream} remoteStream={remoteStream} revealMs={revealMs} />
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
      {/* The motion moved into the paper panel, so the bar carries what the bar
          is for: where you are, and who is watching. */}
      <header className="topbar">
        <Brand />
        <span className="live-tag">
          <i />
          {t('liveNow')}
        </span>
        {watchers > 0 ? (
          <span className="watch-pill">{t('specWatching', { n: watchers })}</span>
        ) : null}
      </header>

      {/* Inside a match the house goes dark and ONE warm panel carries the
          motion, the round, the clock and what you are supposed to be doing.
          It used to be six separate strips stacked down the page, each with
          its own border, none of them obviously more important than the rest.
          Now the two faces and one sheet of paper are the whole screen. */}
      <div className="arena">
      <div className="match">
      <div className="tiles">
        <div className="tile-stack">
          <VideoTile
            stream={localStream}
            muted
            mirror
            maskId={start.avatars?.[mySide]}
            level={localLevel}
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
              {/* Scales with the tile, like the masks — a fixed 200px bot in a
                  600px tile was the same "too small" problem twice. */}
              <div className="tile-mask-wrap">
                <div
                  className="mask-ring"
                  style={{ '--lv': botSpeaking && !myTurn ? botLevel : 0 } as CSSProperties}
                >
                  <BotAvatar botId={botOpponent.id} color={botOpponent.color} size="100%" bare />
                </div>
              </div>
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
              maskId={start.avatars?.[peerSide]}
              level={remoteLevel}
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

      <aside className="bill">
        <div className="bill-sec">{t('theMotion')}</div>
        <p className="bill-motion display">{start.topic[lang]}</p>

        <div className="bill-round">
          <b>{t(PHASES.find((p) => p.key === phase.phase)?.labelKey ?? 'openings')}</b>
          <span>{t('turnOf', { n: phase.stepIndex + 1 })}</span>
        </div>

        {/* "thinking..." set at 56px mono is wider than the panel it lives in,
            so anything that is not a clock reads as a line of type instead. */}
        <div
          className={`shot-clock ${phase.activeSpeaker === 'FOR' ? 'clock-for' : 'clock-against'} ${
            botFailed || botThinking ? 'clock-word' : ''
          } ${botFailed ? 'clock-failed' : danger ? 'clock-danger' : ''}`}
        >
          {botFailed
            ? t('botFailedShort')
            : botThinking
            ? t('botThinking')
            : isBot && !myTurn && !botOnClock
              ? formatClock(0) // bot just yielded; next turn lands in a beat
              : formatClock(clockMs)}
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

        <div className={`bill-who ${phase.activeSpeaker === 'FOR' ? 'for' : 'against'}`}>
          {start.names[phase.activeSpeaker]}
          {myTurn ? t('goSuffix') : t('hasTheMic')}
        </div>

        {/* What to actually SAY this round. A first-timer's hardest moment is a
            live mic and a blank mind, so the shape of the turn goes on screen
            while they speak.

            Always on screen, never only on your turn: when the opponent takes
            two turns in a row (their rebuttal, then their defense) a beginner
            has no idea what they are watching. On their turn it describes the
            round; on yours it tells you what to do. */}
        {botFailed ? (
          <p className="bill-how bill-how-failed">
            {t('botFailed', { x: botOpponent?.name ?? '' })}
          </p>
        ) : (
          <p className="bill-how">{t(myTurn ? `howto_${phase.phase}` : `whatis_${phase.phase}`)}</p>
        )}

        {/* AGAINST opens the closings so FOR gets the final word — flag it once
            so the order doesn't read as a bug. */}
        {phase.stepIndex === 6 ? <p className="bill-how">{t('closingOrderNote')}</p> : null}

        {/* "recording" only ever meant audio was being captured, which is what
            made a dead pipeline look healthy: the level bar bounced, the chip
            said recording, and the judge received nothing. This flips only
            once real words have come back from transcription. */}
        <div className={`bill-mic ${myTurn ? (heardWords > 0 ? 'mic-heard' : 'mic-live') : 'mic-off'}`}>
          <i />
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

        {myTurn ? (
          <button
            className="btn pass-mic"
            disabled={!passArmed}
            onClick={() => onPassMic(phase.stepIndex)}
          >
            {t('passMic')}
          </button>
        ) : null}
      </aside>
      </div>

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

      {!isBot ? <ReportFlag /> : null}
      </div>
    </div>
  );
}
