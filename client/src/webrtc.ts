import { socket } from './socket';
import type { IceServer, SignalPayload } from '../../server/src/protocol';

// One peer connection at a time; host is the sole offerer and there is
// deliberately no renegotiation path — tracks are added before the offer.
let pc: RTCPeerConnection | null = null;
let localStream: MediaStream | null = null;
let pending: RTCIceCandidateInit[] = [];
let onRemote: ((s: MediaStream) => void) | null = null;

export async function ensureLocalStream(): Promise<MediaStream> {
  if (localStream) return localStream;
  localStream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 1280 }, height: { ideal: 720 } },
    // echoCancellation matters twice over: call quality AND keeping the
    // opponent's voice out of this side's speech transcript.
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  return localStream;
}

export function setupPeer(iceServers: IceServer[], onRemoteStream: (s: MediaStream) => void): void {
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
  };
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

export function teardownPeer(): void {
  pending = [];
  if (pc) {
    pc.onicecandidate = null;
    pc.ontrack = null;
    pc.close();
    pc = null;
  }
}

export function releaseMedia(): void {
  teardownPeer();
  localStream?.getTracks().forEach((t) => t.stop());
  localStream = null;
}
