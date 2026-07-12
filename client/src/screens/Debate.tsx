import type { DebateStart, PhaseUpdate, Side } from '../../../server/src/protocol';
import { formatClock, useCountdown } from '../useCountdown';
import VideoTile from '../VideoTile';

interface Props {
  start: DebateStart;
  phase: PhaseUpdate | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  peerLostUntil: number | null;
  rtcState: RTCPeerConnectionState | null;
  speechHeard: boolean;
  speechSupported: boolean;
}

const PHASES: { key: string; label: string }[] = [
  { key: 'opening', label: 'Openings' },
  { key: 'rebuttal', label: 'Rebuttals' },
  { key: 'closing', label: 'Closings' },
];

export default function Debate({
  start,
  phase,
  localStream,
  remoteStream,
  peerLostUntil,
  rtcState,
  speechHeard,
  speechSupported,
}: Props) {
  const mySide = start.yourSide;
  const peerSide: Side = mySide === 'FOR' ? 'AGAINST' : 'FOR';
  const revealMs = useCountdown(start.startsAt, start.serverNow);
  const msLeft = useCountdown(phase?.deadline, phase?.serverNow);
  const graceMs = useCountdown(peerLostUntil ?? undefined, peerLostUntil ? Date.now() : undefined);

  // Before the first phase event: the fight card.
  if (!phase) {
    return (
      <div className="stage center-col reveal">
        <p className="kicker">Tonight's motion</p>
        <h1 className="display motion">{start.topic}</h1>
        <div className="versus">
          <span className="fighter for">{start.names.FOR}</span>
          <span className="vs">VS</span>
          <span className="fighter against">{start.names.AGAINST}</span>
        </div>
        <div className={`side-badge ${mySide === 'FOR' ? 'for' : 'against'}`}>
          you argue {mySide}
        </div>
        <p className="subtitle">
          yes, that side. no, you can't switch. {start.names.FOR} opens in{' '}
          {Math.max(1, Math.ceil(revealMs / 1000))}...
        </p>
      </div>
    );
  }

  const myTurn = phase.activeSpeaker === mySide;
  // Hear the opponent ONLY on their turn — belt-and-suspenders with their
  // own mic being disabled on our turn.
  const remoteMuted = phase.activeSpeaker !== peerSide;
  const danger = msLeft < 10_000;

  return (
    <div className="stage debate">
      <header className="topbar">
        <span className="brand">
          YAP<span className="logo-accent">STAGE</span>
        </span>
        <span className="motion-banner">{start.topic}</span>
      </header>

      <div className="round-card">
        {PHASES.map((p) => (
          <span key={p.key} className={`round ${phase.phase === p.key ? 'round-now' : ''}`}>
            {p.label}
          </span>
        ))}
        <span className="round-step">turn {phase.stepIndex + 1} of 6</span>
      </div>

      <div className="tiles">
        <VideoTile
          stream={localStream}
          muted
          mirror
          label={start.names[mySide]}
          sub={`you · ${mySide}`}
          side={mySide}
          active={myTurn}
        />
        <VideoTile
          stream={remoteStream}
          muted={remoteMuted}
          label={start.names[peerSide]}
          sub={peerSide}
          side={peerSide}
          active={!myTurn}
          placeholder="they froze. hold on."
        />
      </div>

      <div className="clock-row">
        <div className={`speaker-chip ${phase.activeSpeaker === 'FOR' ? 'for' : 'against'}`}>
          {start.names[phase.activeSpeaker]}{myTurn ? '. go.' : ' has the mic'}
        </div>
        <div className={`shot-clock ${danger ? 'clock-danger' : ''}`}>{formatClock(msLeft)}</div>
        <div className={`mic-chip ${myTurn ? 'mic-live' : 'mic-off'}`}>
          {myTurn
            ? speechSupported
              ? speechHeard
                ? 'mic live · the judge hears you'
                : 'mic live · say it louder'
              : 'mic live'
            : 'mic off. be wrong quietly.'}
        </div>
      </div>

      <div className="clock-track">
        <div
          className={`clock-fill ${phase.activeSpeaker === 'FOR' ? 'fill-for' : 'fill-against'}`}
          style={{ width: `${Math.min(100, (msLeft / (phase.seconds * 1000)) * 100)}%` }}
        />
      </div>

      {peerLostUntil ? (
        <div className="banner banner-warn">
          opponent reconnecting... {Math.max(0, Math.ceil(graceMs / 1000))}s. the clock does not care.
        </div>
      ) : null}

      {!peerLostUntil && (rtcState === 'disconnected' || rtcState === 'failed') ? (
        <div className="banner banner-warn">video link dropped. trying to get it back.</div>
      ) : null}
    </div>
  );
}
