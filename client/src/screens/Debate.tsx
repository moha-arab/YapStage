import { useEffect, useRef, useState } from 'react';
import type { DebateStart, PhaseUpdate, Side } from '../../../server/src/protocol';
import { formatClock, useCountdown } from '../useCountdown';
import { useAudioLevel } from '../useAudioLevel';
import { useI18n } from '../i18n';
import VideoTile, { TileBust } from '../VideoTile';
import BotAvatar from '../BotAvatar';
import ReportFlag from '../Report';
import Brand from '../Brand';
import FightCard from '../FightCard';
import { MatchTrack, MotionStrip, ROUND_KEY, SHAPE, debateLeftMs, useSchedule } from '../MatchTrack';
import '../debate.css';

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

/** Below this level the mic counts as silent: the green room's line
    (GreenRoom.tsx, micSilent), so both screens mean the same by "flat". */
const QUIET_LEVEL = 0.04;
/** Silent this long on your own turn, with nothing reaching the judge yet,
    and the mic line turns into a warning. */
const SILENT_MS = 4000;
const BARS = 5;

/* THE MATCH (rebuilt 2026-09-12). His note: "the motion should be at the
   bottom, not on the side ... make it simple, user friendly, not
   overwhelming ... the user clearly should see the progression of the game
   each round and how long is left". Top to bottom, each band answers one
   question a first-timer has:
     the track     how far through are we, how long is left (MatchTrack.tsx)
     the stage     who is talking, and is it me (the lit tile, the status)
     the strip     what are we arguing, which side am I, what do I press,
                   and is my mic working
   The old paper panel beside the tiles held all of that in one column, next
   to half a screen of nothing. */
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
  // YOUR MIC, the whole match long (his note, 2026-09-12: "make sure there's
  // a way to tell if your mic is working mid debate"). The Jubilee rule mutes
  // you between turns by disabling the track (webrtc.ts, setMicEnabled), and
  // a disabled track reads as dead silence to a meter. So the meter listens
  // to a local copy of the track that is never muted, never sent and never
  // recorded: it can show your mic working while the real one stays off.
  const meterStream = useMeterStream(localStream);
  const localLevel = useAudioLevel(meterStream);
  const quietMs = useQuietMs(localLevel, phase?.stepIndex);
  const schedule = useSchedule(phase);
  // Your side, on your own tile for the whole match. Settle-it's sides are
  // sentences, too long for a badge; the tag under the face carries those.
  const youBadge = { label: t('you'), side: start.framing ? undefined : t(mySide) };

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
  // The bot just yielded; the next turn lands in a beat.
  const botYielded = isBot && !myTurn && !botOnClock && !botThinking;
  const clockMs = botOnClock ? botMsLeft : msLeft;
  const danger = clockMs < 10_000 && (myTurn || botOnClock || !isBot);

  // This turn, in ms still to go. Thinking has not started the clock yet;
  // a bot that yielded or failed has nothing left.
  const turnMs = schedule[phase.stepIndex] * 1000;
  const turnLeft = botThinking ? turnMs : botYielded || botFailed ? 0 : Math.min(clockMs, turnMs);
  const lastTurn = phase.stepIndex >= SHAPE.length - 1;

  const peerName = start.names[peerSide];
  const activeSide = phase.activeSpeaker;

  // The mic line keeps the exact ladder it had in the paper panel: it only
  // says the judge hears you once real words have come back from
  // transcription, which is what caught the dead pipeline that looked fine.
  const ladder = sttServer
    ? heardWords > 0
      ? t('micHeard')
      : speechHeard
        ? t('micRecording')
        : t('micLive')
    : speechSupported
      ? speechHeard
        ? t('micHears')
        : t('micLouder')
      : t('micLive');
  // Proof the judge is getting words, from the same two signals.
  const judgeHears = sttServer ? heardWords > 0 : speechSupported && speechHeard;
  // Flat for four seconds with nothing confirmed: say so while it can still
  // be fixed. A pause after the judge has your words is a pause, not a fault.
  const micSilent = myTurn && !judgeHears && quietMs >= SILENT_MS;
  const mic: { tone: MicTone; text: string } = mediaError
    ? { tone: 'error', text: t(mediaError) }
    : !myTurn
      ? { tone: 'off', text: t('dvMicOff') }
      : micSilent
        ? { tone: 'warn', text: t('dvMicSilent') }
        : judgeHears
          ? { tone: 'heard', text: ladder }
          : { tone: !sttServer && speechSupported ? 'warn' : 'live', text: ladder };

  return (
    <div className="stage debate">
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

      <MatchTrack
        schedule={schedule}
        step={phase.stepIndex}
        fill={1 - turnLeft / turnMs}
        label={
          <>
            {t('turnOf', { n: phase.stepIndex + 1 })} · <b>{t(ROUND_KEY[phase.phase])}</b>
          </>
        }
        clock={
          botFailed
            ? t('botFailedShort')
            : botThinking
              ? t('botThinking')
              : botYielded
                ? formatClock(0)
                : formatClock(clockMs)
        }
        clockSide={activeSide}
        clockWord={botFailed || botThinking}
        clockDanger={danger}
        clockFailed={botFailed}
        sub={lastTurn ? t('dvLastTurn') : t('dvTotalLeft', { t: formatClock(debateLeftMs(schedule, phase.stepIndex, turnLeft)) })}
      />

      {!isBot && peerLostUntil ? (
        <div className="banner banner-warn">
          {t('reconnecting', { n: Math.max(0, Math.ceil(graceMs / 1000)) })}
        </div>
      ) : null}

      {!isBot && !peerLostUntil && (rtcState === 'disconnected' || rtcState === 'failed') ? (
        <div className="banner banner-warn">{t('videoDropped')}</div>
      ) : null}

      <div className="dv-stage">
        <div className="dv-tiles">
          <VideoTile
            stream={localStream}
            muted
            mirror
            maskId={start.avatars?.[mySide]}
            label={start.names[mySide]}
            sub={label(mySide)}
            you={youBadge}
            side={mySide}
            active={myTurn}
            pill={false}
          />
          {isBot && botOpponent ? (
            // The same frame as a masked player's: the animal stands on the
            // tile's bottom edge and the tile lights on its turn.
            <div className={`tile tile-masked bot-tile tile-${peerSide === 'FOR' ? 'for' : 'against'} ${!myTurn ? 'tile-active' : ''}`}>
              <TileBust>
                <BotAvatar botId={botOpponent.id} color={botOpponent.color} size="100%" bare />
              </TileBust>
              <div className="tag">
                <span className="tag-name">{botOpponent.name}</span>
                <span className="tag-sub">{label(peerSide)}</span>
              </div>
            </div>
          ) : (
            <VideoTile
              stream={remoteStream}
              muted={remoteMuted}
              maskId={start.avatars?.[peerSide]}
              label={peerName}
              sub={label(peerSide)}
              side={peerSide}
              active={!myTurn}
              placeholder={t('theyFroze')}
              dead={remoteVideoDead}
              pill={false}
            />
          )}
        </div>

        {/* Who has the floor, in words, under the lit tile. On your turn the
            one line of what this round is for rides under it: a first-timer's
            hardest moment is a live mic and a blank mind. */}
        <div
          className={`dv-status ${myTurn ? 'dv-status-start' : 'dv-status-end'} ${
            activeSide === 'FOR' ? 'dv-for' : 'dv-against'
          } ${botFailed ? 'is-failed' : ''}`}
          aria-live="polite"
        >
          <b>
            {myTurn
              ? t('dvYourTurn')
              : botFailed
                ? t('botFailed', { x: peerName })
                : botThinking
                  ? t('dvThinking', { x: peerName })
                  : t('dvSpeaking', { x: peerName })}
          </b>
          {myTurn ? <span>{t(`howto_${phase.phase}`)}</span> : null}
        </div>
      </div>

      <MotionStrip
        motion={start.topic[lang]}
        kicker={
          <span className={`dv-side ${mySide === 'FOR' ? 'dv-for' : 'dv-against'} ${start.framing ? 'dv-side-long' : ''}`}>
            {start.framing ? t('youreArguingThat') : t('youreArguing')} <b>{label(mySide)}</b>
          </span>
        }
      >
        <MicCheck
          level={localLevel}
          tone={mic.tone}
          text={mic.text}
          retry={mediaError ? { label: t('retry'), onClick: onRetryMedia } : undefined}
        />
        {myTurn ? (
          <button className="btn dv-pass" disabled={!passArmed} onClick={() => onPassMic(phase.stepIndex)}>
            {t('passMic')}
          </button>
        ) : null}
      </MotionStrip>

      {!isBot ? (
        <div className="dv-report">
          <ReportFlag />
        </div>
      ) : null}
    </div>
  );
}

type MicTone = 'heard' | 'live' | 'warn' | 'off' | 'error';

/** A copy of your mic's audio for the meter alone. Cloned tracks keep their
    own `enabled` flag, so the copy stays on while the Jubilee rule mutes the
    original. It is analysed here and goes nowhere else. Where a browser will
    not clone, the meter reads the real track and is flat while muted. */
function useMeterStream(stream: MediaStream | null): MediaStream | null {
  const [meter, setMeter] = useState<MediaStream | null>(null);
  useEffect(() => {
    const tracks = stream?.getAudioTracks() ?? [];
    if (!stream || tracks.length === 0) {
      setMeter(null);
      return;
    }
    let clones: MediaStreamTrack[] = [];
    try {
      clones = tracks.map((track) => {
        const copy = track.clone();
        copy.enabled = true;
        return copy;
      });
      setMeter(new MediaStream(clones));
    } catch {
      setMeter(stream);
    }
    return () => clones.forEach((c) => c.stop());
  }, [stream]);
  return meter;
}

/** Milliseconds since the mic last rose above QUIET_LEVEL, counted from the
    start of the turn (`turn` changing resets it). Ticks on its own, since a
    flat meter never re-renders anything. */
function useQuietMs(level: number, turn: number | undefined): number {
  const since = useRef(Date.now());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    since.current = Date.now();
  }, [turn]);
  if (level > QUIET_LEVEL) since.current = now;
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  return Math.max(0, now - since.current);
}

/** Your mic, always on screen: an icon, five bars that move with your voice,
    and one line of what that means right now. A blocked or failed mic shows
    its error and the Retry here, where you would look for it. */
function MicCheck({
  level,
  tone,
  text,
  retry,
}: {
  level: number;
  tone: MicTone;
  text: string;
  retry?: { label: string; onClick: () => void };
}) {
  const lit = level <= 0.02 ? 0 : Math.min(BARS, Math.ceil(level * 10));
  return (
    <div className={`dv-mic dv-mic-${tone}`} role="status">
      <svg className="dv-mic-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
        <rect x="5.25" y="1" width="5.5" height="9" rx="2.75" fill="currentColor" />
        <path
          d="M3 7.5a5 5 0 0 0 10 0M8 12.5V15M5.5 15h5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {tone === 'off' ? (
          <>
            <path d="M2.5 1.5l11 13" stroke="#efe8d8" strokeWidth="3.5" strokeLinecap="round" />
            <path d="M2.5 1.5l11 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </>
        ) : null}
      </svg>
      <span className="dv-bars" aria-hidden="true">
        {Array.from({ length: BARS }, (_, i) => (
          <i key={i} className={i < lit ? 'on' : ''} />
        ))}
      </span>
      <span className="dv-mic-text">{text}</span>
      {retry ? (
        <button className="btn btn-small dv-retry" onClick={retry.onClick}>
          {retry.label}
        </button>
      ) : null}
    </div>
  );
}
