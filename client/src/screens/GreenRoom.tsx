import { useEffect, useRef, useState } from 'react';
import type { LobbyUpdate, Side } from '../../../server/src/protocol';
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
  const [cat, setCat] = useState(0);
  const waiting = lobby.participantCount === 1;
  const link = `${window.location.origin}/?code=${lobby.code}`;
  const connected = rtcState === 'connected';
  const { pick, deck } = lobby;
  const peer = lobby.peerName ?? 'your opponent';

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

  function confirm() {
    initAudio(); // user gesture: unlocks the drum roll for the verdict later
    socket.emit('pick:confirm');
  }

  const topicsMatch = pick.yourTopic !== null && pick.yourTopic === pick.peerTopic;
  const sidesOk =
    pick.yourSide !== null && pick.peerSide !== null && pick.yourSide !== pick.peerSide;
  const agreed = topicsMatch && sidesOk;
  const canConfirm = consent && !!localStream && connected && agreed && !pick.youConfirmed;

  const confirmLabel = pick.youConfirmed
    ? `confirmed. waiting for ${peer}.`
    : !connected
      ? rtcState === 'failed'
        ? 'video link failed'
        : 'connecting video...'
      : !pick.yourTopic
        ? 'pick a topic'
        : !topicsMatch
          ? `waiting for ${peer} to pick the same topic`
          : !pick.yourSide
            ? 'pick your side'
            : !pick.peerSide
              ? `waiting for ${peer} to pick a side`
              : !sidesOk
                ? `you both picked ${pick.yourSide}. one of you has to switch.`
                : 'confirm';

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
        <>
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
        </>
      ) : (
        <>
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
              {localStream ? (
                <MicMeter level={localLevel} label="your mic" warn={micSilent} />
              ) : null}
              {localStream && micSilent ? (
                <p className="meter-hint">say something. flat bar = the judge hears nothing.</p>
              ) : null}
            </div>
            <div className="tile-stack">
              <VideoTile
                stream={remoteStream}
                muted={false}
                label={lobby.peerName ?? 'opponent'}
                sub={pick.peerConfirmed ? 'confirmed' : undefined}
                placeholder="connecting their camera"
              />
              {remoteStream && connected ? (
                <MicMeter level={remoteLevel} label={`${peer} mic`} warn={false} />
              ) : null}
            </div>
          </div>

          <div className="picker card">
            <div className="cat-tabs">
              {deck.map((c, i) => (
                <button
                  key={c.key}
                  className={`cat-tab ${i === cat ? 'cat-active' : ''}`}
                  onClick={() => setCat(i)}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <div className="topic-list">
              {deck[cat]?.topics.map((t) => {
                const mine = pick.yourTopic === t;
                const theirs = pick.peerTopic === t;
                return (
                  <button
                    key={t}
                    className={`topic-btn ${mine && theirs ? 'topic-on-table' : ''}`}
                    onClick={() => socket.emit('pick:topic', t)}
                  >
                    {t}
                    <span className="topic-marks">
                      {mine && theirs ? 'both ✓' : mine ? 'you' : theirs ? peer : ''}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="side-row">
              {(['FOR', 'AGAINST'] as Side[]).map((side) => (
                <button
                  key={side}
                  className={`side-btn ${side === 'FOR' ? 'for' : 'against'} ${
                    pick.yourSide === side ? 'side-mine' : ''
                  }`}
                  onClick={() => socket.emit('pick:side', side)}
                >
                  <span className="side-name">{side}</span>
                  <span className="side-claim">
                    {[pick.yourSide === side ? 'you' : null, pick.peerSide === side ? peer : null]
                      .filter(Boolean)
                      .join(' + ') || ' '}
                  </span>
                </button>
              ))}
            </div>

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

            <button className="btn btn-primary btn-wide" disabled={!canConfirm} onClick={confirm}>
              {confirmLabel}
            </button>
          </div>
        </>
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
    </div>
  );
}
