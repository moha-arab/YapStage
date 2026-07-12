import { useEffect, useRef, useState } from 'react';
import type { LobbyUpdate } from '../../../server/src/protocol';
import { socket } from '../socket';
import { initAudio } from '../sound';
import { useAudioLevel } from '../useAudioLevel';
import MicMeter from '../MicMeter';
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

  // Mic proof-of-life: if the mic has never moved the meter, say so before
  // the debate, not after the verdict comes back with one side missing.
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
        <span className="pill">green room</span>
        <span className="pill pill-code">{lobby.code}</span>
      </header>

      {waiting ? (
        <div className="invite-block">
          <div className="ticket">
            <div className="ticket-main">
              <p className="ticket-label">yapstage · admit two</p>
              <p className="ticket-code">{lobby.code}</p>
              <p className="ticket-fine">section yap · row 1 · no refunds</p>
            </div>
            <div className="ticket-stub" aria-hidden="true" />
          </div>
          <button className="btn" onClick={copyLink}>
            {copied ? 'copied.' : 'copy invite link'}
          </button>
          <p className="subtitle">send it to exactly one friend. the confident one.</p>
        </div>
      ) : null}

      {waiting ? (
        <div className="tile-stack tile-solo">
          <span className="tape">mic check</span>
          <VideoTile
            stream={localStream}
            muted
            mirror
            label={lobby.yourName}
            sub="you"
            placeholder={mediaError ? 'camera blocked' : 'camera warming up'}
          />
          {localStream ? <MicMeter level={localLevel} label="your mic" warn={micSilent} /> : null}
          {localStream && micSilent ? (
            <p className="meter-hint">say something. flat bar = the judge hears nothing.</p>
          ) : null}
        </div>
      ) : (
        <div className="tiles">
          <div className="tile-stack">
            <VideoTile
              stream={localStream}
              muted
              mirror
              label={lobby.yourName}
              sub="you"
              placeholder={mediaError ? 'camera blocked' : 'camera warming up'}
            />
            {localStream ? <MicMeter level={localLevel} label="your mic" warn={micSilent} /> : null}
            {localStream && micSilent ? (
              <p className="meter-hint">say something. flat bar = the judge hears nothing.</p>
            ) : null}
          </div>
          <div className="tile-stack">
            <VideoTile
              stream={remoteStream}
              muted={false}
              label={lobby.peerName ?? 'opponent'}
              sub={lobby.peerName ? (lobby.peerReady ? 'ready' : 'not ready') : undefined}
              placeholder="connecting their camera"
            />
            {remoteStream && connected ? (
              <MicMeter level={remoteLevel} label={`${lobby.peerName ?? 'their'} mic`} warn={false} />
            ) : null}
          </div>
        </div>
      )}

      {mediaError ? (
        <div className="banner banner-error">
          {mediaError}{' '}
          <button className="btn btn-small" onClick={onRetryMedia}>
            retry
          </button>
        </div>
      ) : null}

      {!waiting && rtcState === 'failed' ? (
        <div className="banner banner-error">
          your networks refuse to shake hands. hotspot one phone and rematch.
        </div>
      ) : null}

      {!speechSupported ? (
        <div className="banner banner-warn">
          this browser can't transcribe you, so the judge can't score you. use chrome on a laptop.
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
              the ai judge reads a transcript of this debate. nothing is recorded, nothing is
              stored. it all burns after the verdict.
            </span>
          </label>
          <button
            className="btn btn-primary btn-wide"
            disabled={!consent || !localStream || !connected || lobby.youReady}
            onClick={ready}
          >
            {lobby.youReady
              ? 'waiting on your opponent. rehearsing, probably.'
              : !connected
                ? rtcState === 'failed'
                  ? 'video link failed'
                  : 'connecting video...'
                : 'take the stage'}
          </button>
          {lobby.peerReady && !lobby.youReady ? (
            <p className="footnote">{lobby.peerName} is ready and staring at you.</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
