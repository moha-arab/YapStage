// Shared protocol types — single source of truth for client and server.
// The client imports this file with `import type` only, so no server code
// ever enters the browser bundle.

export type Side = 'FOR' | 'AGAINST';
export type Role = 'host' | 'guest';
export type PhaseLabel = 'opening' | 'rebuttal' | 'closing';

// Structural stand-ins for DOM WebRTC types (server tsconfig has no DOM lib).
export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface SessionDescription {
  type: string;
  sdp?: string;
}

export interface IceCandidate {
  candidate?: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export type SignalPayload =
  | { description: SessionDescription }
  | { candidate: IceCandidate };

export interface TopicCategory {
  key: string;
  label: string;
  topics: string[];
}

/** Pregame picks. The debate starts only when both players picked the same
    topic, opposite sides, and both confirmed. */
export interface PickState {
  yourTopic: string | null;
  peerTopic: string | null;
  yourSide: Side | null;
  peerSide: Side | null;
  youConfirmed: boolean;
  peerConfirmed: boolean;
}

export interface LobbyUpdate {
  code: string;
  role: Role;
  yourName: string;
  peerName?: string;
  participantCount: 1 | 2;
  locked: boolean;
  deck: TopicCategory[];
  pick: PickState;
  iceServers: IceServer[];
}

export interface DebateStart {
  topic: string;
  yourSide: Side;
  names: Record<Side, string>;
  startsAt: number; // epoch ms — reveal countdown ends and step 0 begins
  serverNow: number;
}

export interface PhaseUpdate {
  stepIndex: number; // 0..5
  phase: PhaseLabel;
  activeSpeaker: Side;
  seconds: number; // full duration of this step
  deadline: number; // epoch ms, server clock
  serverNow: number; // epoch ms at send time — client derives clock offset
}

export interface SpeechChunk {
  stepIndex: number;
  text: string; // FINAL speech-recognition results only
}

export interface CategoryScores {
  argument: number; // 0-30
  evidence: number; // 0-20
  clash: number; // 0-30
  delivery: number; // 0-20
}

export interface Verdict {
  winner: Side;
  summary: string; // one-line hype ruling, read aloud at the reveal
  scores: Record<Side, CategoryScores>;
  bestQuote: Record<Side, string>;
  feedback: Record<Side, string[]>; // 2 bullets each
  injectionDetected: boolean;
}

export type JoinError = 'not_found' | 'full' | 'in_progress' | 'bad_name';

export type CreateResult =
  | { ok: true; update: LobbyUpdate }
  | { ok: false; error: JoinError };

export interface ClientToServer {
  'lobby:create': (
    p: { sessionId: string; name: string },
    cb: (res: CreateResult) => void,
  ) => void;
  'lobby:join': (
    p: { code: string; sessionId: string; name: string },
    cb: (res: CreateResult) => void,
  ) => void;
  'lobby:resume': (
    p: { code: string; sessionId: string },
    cb: (res: { ok: boolean }) => void,
  ) => void;
  'pick:topic': (topic: string) => void; // set YOUR topic choice
  'pick:side': (side: Side) => void; // set YOUR side
  'pick:confirm': () => void; // second confirm (with matching picks) starts the debate
  'rtc:ready': () => void;
  'rtc:signal': (p: SignalPayload) => void;
  'speech:chunk': (p: SpeechChunk) => void;
  'verdict:retry': () => void;
}

export interface ServerToClient {
  'lobby:update': (u: LobbyUpdate) => void;
  'lobby:closed': (p: { reason: string }) => void;
  'rtc:go': () => void; // sent to HOST only when both peers are rtc-ready
  'rtc:signal': (p: SignalPayload) => void;
  'debate:start': (p: DebateStart) => void;
  'debate:phase': (p: PhaseUpdate) => void;
  'debate:ended': () => void;
  'debate:aborted': (p: { reason: string }) => void;
  'peer:connection': (p: { state: 'lost' | 'restored'; graceDeadline?: number }) => void;
  'verdict:status': (p: { state: 'pending' | 'failed'; message?: string }) => void;
  'verdict:result': (p: { verdict: Verdict; names: Record<Side, string> }) => void;
}

export interface SocketData {
  code?: string;
  role?: Role;
}

export const NAME_RE = /^[a-zA-Z0-9_]{3,16}$/;
