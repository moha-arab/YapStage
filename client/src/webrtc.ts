import { socket } from './socket';
import type { IceServer, SignalPayload } from '../../server/src/protocol';

// One peer connection at a time; host is the sole offerer and there is
// deliberately no renegotiation path — tracks are added before the offer.
let pc: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let localStreamPromise: Promise<MediaStream> | null = null;
let pending: RTCIceCandidateInit[] = [];
let onRemote: ((s: MediaStream) => void) | null = null;
let onLocalDead: (() => void) | null = null;
let onRemoteVideoDead: ((dead: boolean) => void) | null = null;

/** UI hooks: local track died (unplugged device, revoked permission) and
    remote video health (opponent's camera died while the connection lives). */
export function setTrackHealthHandlers(
  localDead: (() => void) | null,
  remoteVideoDead: ((dead: boolean) => void) | null,
): void {
  onLocalDead = localDead;
  onRemoteVideoDead = remoteVideoDead;
}

function watchLocalTracks(s: MediaStream): void {
  for (const track of s.getTracks()) {
    track.onended = () => {
      // Only report death of the CURRENT stream — a reacquire stops old tracks.
      if (localStream === s) onLocalDead?.();
    };
  }
}

/** Masked play (all of ranked, and custom when you choose a mask) never asks
    for a camera at all — no permission prompt, no lit camera light, nothing to
    leak. Set BEFORE the first ensureLocalStream call for a session. */
let audioOnly = false;
export function setAudioOnly(on: boolean): void {
  audioOnly = on;
}
export function isAudioOnly(): boolean {
  return audioOnly;
}

export function ensureLocalStream(): Promise<MediaStream> {
  if (localStream) return Promise.resolve(localStream);
  // In-flight dedup: overlapping calls (effect re-runs while the permission
  // prompt is up) must share ONE getUserMedia — a duplicate capture orphans
  // a stream whose tracks are never stopped (camera light stuck on) and can
  // desync setMicEnabled from the track the peer connection actually sends.
  if (!localStreamPromise) {
    localStreamPromise = navigator.mediaDevices
      .getUserMedia({
        video: audioOnly ? false : { width: { ideal: 1280 }, height: { ideal: 720 } },
        // echoCancellation matters twice over: call quality AND keeping the
        // opponent's voice out of this side's speech transcript.
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      .then((s) => {
        localStream = s;
        watchLocalTracks(s);
        return s;
      })
      .catch((err) => {
        localStreamPromise = null; // allow retry after a denial
        throw err;
      });
  }
  return localStreamPromise;
}

export function setupPeer(
  iceServers: IceServer[],
  onRemoteStream: (s: MediaStream) => void,
  onConnectionState?: (s: RTCPeerConnectionState) => void,
): void {
  teardownPeer();
  if (!localStream) throw new Error('local stream not ready');
  onRemote = onRemoteStream;
  pc = new RTCPeerConnection({ iceServers: iceServers as RTCIceServer[] });
  for (const track of localStream.getTracks()) pc.addTrack(track, localStream);
  pc.onicecandidate = (e) => {
    if (e.candidate) socket.emit('rtc:signal', { candidate: e.candidate.toJSON() });
  };
  pc.ontrack = (e) => {
    if (e.streams[0]) onRemote?.(e.streams[0]);
    if (e.track.kind === 'video') {
      // A remote camera dying does NOT change connectionState — without these
      // the opponent just freezes with zero indication.
      e.track.onmute = () => onRemoteVideoDead?.(true);
      e.track.onunmute = () => onRemoteVideoDead?.(false);
      e.track.onended = () => onRemoteVideoDead?.(true);
    }
  };
  // ontrack fires when the OFFER is processed — long before media actually
  // flows. connectionState 'connected' is the real "you can see each other".
  pc.onconnectionstatechange = () => {
    if (pc) onConnectionState?.(pc.connectionState);
  };
  onConnectionState?.('connecting');
  // Tells the server this side's tracks + handlers exist. When both sides
  // have said it, the server sends rtc:go to the host, which offers.
  socket.emit('rtc:ready');
}

export async function beginOffer(): Promise<void> {
  if (!pc) return;
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit('rtc:signal', { description: { type: offer.type, sdp: offer.sdp } });
}

export async function handleSignal(p: SignalPayload): Promise<void> {
  if (!pc) return;
  if ('description' in p) {
    const desc = p.description as RTCSessionDescriptionInit;
    await pc.setRemoteDescription(desc);
    if (desc.type === 'offer') {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('rtc:signal', { description: { type: answer.type, sdp: answer.sdp } });
    }
    // Flush candidates that arrived before the remote description.
    for (const c of pending) {
      try {
        await pc.addIceCandidate(c);
      } catch {
        // ignore individual bad candidates
      }
    }
    pending = [];
  } else if ('candidate' in p) {
    const candidate = p.candidate as RTCIceCandidateInit;
    if (pc.remoteDescription) {
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        // ignore
      }
    } else {
      pending.push(candidate);
    }
  }
}

export function setMicEnabled(on: boolean): void {
  localStream?.getAudioTracks().forEach((t) => {
    t.enabled = on;
  });
}

/** Re-acquire camera+mic after a local track died and hot-swap the new tracks
    into the live peer connection (replaceTrack needs no renegotiation). */
export async function reacquireMedia(): Promise<MediaStream> {
  const old = localStream;
  const micWasOn = old?.getAudioTracks()[0]?.enabled ?? true;
  localStream = null;
  localStreamPromise = null;
  old?.getTracks().forEach((t) => {
    t.onended = null;
    t.stop();
  });
  const fresh = await ensureLocalStream();
  fresh.getAudioTracks().forEach((t) => {
    t.enabled = micWasOn; // keep the Jubilee rule intact mid-turn
  });
  if (pc) {
    for (const track of fresh.getTracks()) {
      const sender = pc.getSenders().find((s) => s.track?.kind === track.kind);
      if (sender) void sender.replaceTrack(track).catch(() => {});
    }
  }
  return fresh;
}

/** ICE restart (host only calls this): recovers a connection that went
    'failed' after a network path change. The guest answers via the normal
    offer-handling path in handleSignal. */
export async function attemptIceRestart(): Promise<void> {
  if (!pc) return;
  try {
    const offer = await pc.createOffer({ iceRestart: true });
    await pc.setLocalDescription(offer);
    socket.emit('rtc:signal', { description: { type: offer.type, sdp: offer.sdp } });
  } catch {
    // a torn-down pc mid-call — nothing to restart
  }
}

export function teardownPeer(): void {
  pending = [];
  if (pc) {
    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.onconnectionstatechange = null;
    pc.close();
    pc = null;
  }
}

export function releaseMedia(): void {
  teardownPeer();
  localStream?.getTracks().forEach((t) => t.stop());
  localStream = null;
  localStreamPromise = null;
}
