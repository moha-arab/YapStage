import { useEffect, useRef, useState } from 'react';
import type { LobbyUpdate } from '../../../server/src/protocol';
import { socket } from '../socket';
import { initAudio } from '../sound';
import { useAudioLevel } from '../useAudioLevel';
import VideoTile from '../VideoTile';

interface Props {
  lobby: LobbyUpdate;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  mediaError: string | null;
  speechSupported: boolean;
  rtcState: RTCPeerConnectionState | null;
  onRetryMedia: () => void;
}

function MicMeter({ level, label, warn }: { level: number; label: string; warn: boolean }) {
  return (
    <div className={`meter-row ${warn ? 'meter-warn' : ''}`}>
      <span className="meter-label">{label}</span>
      <div className="meter">
        <div className="meter-fill" style={{ width: `${Math.round(level * 100)}%` }} />
      </div>
    </div>
  );
}

export default function GreenRoom({
  lobby,
  localStream,
  remoteStream,
  mediaError,
  speechSupported,
  rtcState,
  onRetryMedia,
}: Props) {
  const [consent, setConsent] = useState(false);
  const [copied, setCopied] = useState(false);
  const waiting = lobby.participantCount === 1;
  const link = `${window.location.origin}/?code=${lobby.code}`;
  const connected = rtcState === 'connected';

  const localLevel = useAudioLevel(localStream);
  const remoteLevel = useAudioLevel(remoteStream);

  // Mic proof-of-life: if we've had a mic for a while and it has NEVER made
  // the meter move, say so loudly — a debate with a dead mic is unjudgeable.
  const maxLocal = useRef(0);
  if (localLevel > maxLocal.current) maxLocal.current = localLevel;
  const [micSilent, setMicSilent] = useState(false);
  useEffect(() => {
    if (!localStream) return;
    const id = setInterval(() => setMicSilent(maxLocal.current < 0.04), 2500);
    return () => clearInterval(id);
  }, [localStream]);

  function copyLink() {
    void navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function ready() {
    initAudio(); // user gesture: unlocks the drum roll for the verdict later
    socket.emit('greenroom:ready');
  }

  return (
    <div className="stage green-room">
      <header className="topbar">
        <span className="brand">
          YAP<span className="logo-accent">STAGE</span>
        </span>
        <span className="pill">Green room</span>
        <span className="pill pill-code">{lobby.code}</span>
      </header>

      {waiting ? (
        <div className="invite-block">
          <p className="kicker">Your stage is booked</p>
          <h2 className="display code-display">{lobby.code}</h2>
          <p className="subtitle">Send this code — or the link — to exactly one friend.</p>
          <button className="btn" onClick={copyLink}>
            {copied ? 'Copied' : 'Copy invite link'}
          </button>
        </div>
      ) : null}

      <div className="tiles">
        <div className="tile-stack">
          <VideoTile
            stream={localStream}
            muted
            mirror
            label={lobby.yourName}
            sub="you"
            placeholder={mediaError ? 'Camera blocked' : 'Starting camera…'}
          />
          {localStream ? (
            <MicMeter level={localLevel} label="Your mic" warn={micSilent} />
          ) : null}
          {localStream && micSilent ? (
            <p className="meter-hint">
              Say something — this bar should bounce. If it stays flat, your mic is dead and the
              judge won't hear a word you say.
            </p>
          ) : null}
        </div>
        <div className="tile-stack">
          <VideoTile
            stream={remoteStream}
            muted={false}
            label={lobby.peerName ?? 'Opponent'}
            sub={lobby.peerName ? (lobby.peerReady ? 'ready' : 'not ready') : undefined}
            placeholder={waiting ? 'Waiting for your opponent…' : 'Connecting…'}
          />
          {remoteStream && connected ? (
            <MicMeter
              level={remoteLevel}
              label={`${lobby.peerName ?? 'Their'} mic`}
              warn={false}
            />
          ) : null}
        </div>
      </div>

      {mediaError ? (
        <div className="banner banner-error">
          {mediaError}{' '}
          <button className="btn btn-small" onClick={onRetryMedia}>
            Retry
          </button>
        </div>
      ) : null}

      {!waiting && rtcState === 'failed' ? (
        <div className="banner banner-error">
          Your two networks are blocking a direct video link (common on campus or office Wi-Fi).
          This needs the relay server turned on — ping the site owner. Retrying may help on a
          different network or hotspot.
        </div>
      ) : null}

      {!speechSupported ? (
        <div className="banner banner-warn">
          Live transcription isn't supported in this browser — your side of the debate can't be
          judged. Use desktop Chrome for the full show.
        </div>
      ) : null}

      {!waiting ? (
        <div className="consent card">
          <label className="consent-row">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>
              I understand this debate will be transcribed and judged by an AI. Nothing is
              recorded or stored — transcripts vanish after the verdict.
            </span>
          </label>
          <button
            className="btn btn-primary btn-wide"
            disabled={!consent || !localStream || !connected || lobby.youReady}
            onClick={ready}
          >
            {lobby.youReady
              ? 'Waiting for your opponent…'
              : !connected
                ? rtcState === 'failed'
                  ? 'Video link failed'
                  : 'Connecting video…'
                : "I'm ready — take the stage"}
          </button>
          {!connected && !lobby.youReady && rtcState !== 'failed' ? (
            <p className="footnote">
              Ready unlocks once live video is flowing both ways — no point debating a black
              screen.
            </p>
          ) : null}
          {lobby.peerReady && !lobby.youReady ? (
            <p className="footnote">{lobby.peerName} is ready and waiting for you.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
