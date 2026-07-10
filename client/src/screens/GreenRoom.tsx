import { useState } from 'react';
import type { LobbyUpdate } from '../../../server/src/protocol';
import { socket } from '../socket';
import { initAudio } from '../sound';
import VideoTile from '../VideoTile';

interface Props {
  lobby: LobbyUpdate;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  mediaError: string | null;
  speechSupported: boolean;
  onRetryMedia: () => void;
}

export default function GreenRoom({
  lobby,
  localStream,
  remoteStream,
  mediaError,
  speechSupported,
  onRetryMedia,
}: Props) {
  const [consent, setConsent] = useState(false);
  const [copied, setCopied] = useState(false);
  const waiting = lobby.participantCount === 1;
  const link = `${window.location.origin}/?code=${lobby.code}`;

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
        <VideoTile
          stream={localStream}
          muted
          mirror
          label={lobby.yourName}
          sub="you"
          placeholder={mediaError ? 'Camera blocked' : 'Starting camera…'}
        />
        <VideoTile
          stream={remoteStream}
          muted={false}
          label={lobby.peerName ?? 'Opponent'}
          sub={lobby.peerName ? (lobby.peerReady ? 'ready' : 'not ready') : undefined}
          placeholder={waiting ? 'Waiting for your opponent…' : 'Connecting…'}
        />
      </div>

      {mediaError ? (
        <div className="banner banner-error">
          {mediaError}{' '}
          <button className="btn btn-small" onClick={onRetryMedia}>
            Retry
          </button>
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
            disabled={!consent || !localStream || !remoteStream || lobby.youReady}
            onClick={ready}
          >
            {lobby.youReady
              ? 'Waiting for your opponent…'
              : !remoteStream
                ? 'Connecting video…'
                : "I'm ready — take the stage"}
          </button>
          {!remoteStream && !lobby.youReady ? (
            <p className="footnote">
              Ready unlocks once you can see {lobby.peerName ?? 'your opponent'} — no point debating
              a black screen.
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
