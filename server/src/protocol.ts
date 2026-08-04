// Shared protocol types — single source of truth for client and server.
// The client imports this file with `import type` only, so no server code
// ever enters the browser bundle.

export type Side = 'FOR' | 'AGAINST';
export type Role = 'host' | 'guest';
export type PhaseLabel = 'opening' | 'rebuttal' | 'defense' | 'closing';

// How the debate's topic gets decided (host chooses):
//  agree    — both pick the exact topic + sides (the negotiated flow)
//  category — host picks a category; server rolls a random topic + sides from it
//  random   — server rolls category, topic, and sides
export type TopicMode = 'agree' | 'category' | 'random';

export type Difficulty = 'easy' | 'medium' | 'hard';

// Debate pacing — the same four-round format at three sizes. Turn lengths are
// maximums everywhere: "pass the mic" ends a turn early.
export type Pace = 'standard' | 'blitz' | 'long';

/** Public bot info for the pick screen (no prompt/voice secrets). */
export interface BotInfo {
  id: string;
  name: string;
  tagline: string;
  blurb: string;
  color: string;
  rank: number; // 1 = easiest, ascending
  skill: string; // short strength label
}

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

/** A topic in both languages; players match on the id. */
export interface TopicText {
  id: string;
  en: string;
  ar: string;
}

export interface TopicCategory {
  key: string;
  label: { en: string; ar: string };
  topics: TopicText[];
}

/** Pregame picks (topic ids). The debate starts only when both players
    picked the same topic, opposite sides, and both confirmed. */
export interface PickState {
  yourTopicId: string | null;
  peerTopicId: string | null;
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
  topicMode: TopicMode;
  /** In 'category' mode, the host-chosen category key (else null). */
  categoryKey: string | null;
  pace: Pace;
  pick: PickState;
  iceServers: IceServer[];
  /** Server-side Whisper transcription available: any browser works. */
  sttAvailable: boolean;
}

export interface DebateStart {
  topic: TopicText;
  yourSide: Side;
  names: Record<Side, string>;
  startsAt: number; // epoch ms: reveal countdown ends and step 0 begins
  serverNow: number;
  /** Present only in bots mode — the opponent is this AI, not a human peer. */
  bot?: { id: string; name: string; color: string };
}

export interface PhaseUpdate {
  stepIndex: number; // 0..5
  phase: PhaseLabel;
  activeSpeaker: Side;
  seconds: number; // full duration of this step
  deadline: number; // epoch ms, server clock
  serverNow: number; // epoch ms at send time — client derives clock offset
  /** Bot steps only: the bot's SPEAKING allowance (same as a human turn of
      this phase). The client starts a visible countdown when audio begins and
      hard-cuts the voice when it expires. `seconds` on bot steps is the wider
      server fallback window (thinking + speaking), not the visible clock. */
  speakSeconds?: number;
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

export type JoinError = 'not_found' | 'full' | 'in_progress' | 'bad_name' | 'rate_limited';

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
  'pick:mode': (mode: TopicMode) => void; // host only: how the topic is decided
  'pick:category': (key: string) => void; // host only: category for 'category' mode
  'pick:pace': (pace: Pace) => void; // host only: turn lengths
  'pick:topic': (topicId: string) => void; // set YOUR topic choice (by id)
  'pick:side': (side: Side) => void; // set YOUR side
  'pick:confirm': () => void; // second confirm (with matching picks) starts the debate
  'rtc:ready': () => void;
  'rtc:signal': (p: SignalPayload) => void;
  'speech:chunk': (p: SpeechChunk) => void;
  /** End YOUR OWN current turn early — the mic passes immediately. */
  'turn:done': (p: { stepIndex: number }) => void;
  /** One recorded audio blob per completed speaking turn (server-STT mode). */
  'audio:turn': (p: { stepIndex: number; mime: string; data: ArrayBuffer }) => void;
  'verdict:retry': () => void;
  'rematch': () => void; // want to run it back with the same person
  /** Ask for a shareable link to this verdict. The whole card is encoded in
      the returned URL — nothing is stored server-side. */
  'share:link': (cb: (res: { url: string } | null) => void) => void;
  /** Say anything to the YapMaster about YOUR debate. It coaches when asked and
      defends its ruling when challenged; the score never moves either way. */
  'coach:ask': (p: { question: string }) => void;
  'bot:start': (
    p: {
      sessionId: string;
      name: string;
      botId: string; // the character IS the difficulty
      topicMode: TopicMode;
      categoryKey?: string;
      topicId?: string;
      side?: Side | 'random';
      lang?: 'en' | 'ar';
      pace?: Pace;
    },
    cb: (res: { ok: boolean; error?: JoinError }) => void,
  ) => void;
  'bot:done': (p: { stepIndex: number }) => void; // the bot finished speaking its turn
}

export interface ServerToClient {
  'lobby:update': (u: LobbyUpdate) => void;
  'lobby:closed': (p: { reason: string; vars?: Record<string, string> }) => void;
  'rtc:go': () => void; // sent to HOST only when both peers are rtc-ready
  'rtc:signal': (p: SignalPayload) => void;
  'debate:start': (p: DebateStart) => void;
  'debate:phase': (p: PhaseUpdate) => void;
  'debate:ended': () => void;
  'debate:aborted': (p: { reason: string; vars?: Record<string, string> }) => void;
  'peer:connection': (p: { state: 'lost' | 'restored'; graceDeadline?: number }) => void;
  'verdict:status': (p: { state: 'pending' | 'failed'; message?: string; terminal?: boolean }) => void;
  /** The ruling. `audio` is the YapMaster reading `verdict.summary` in their
      own voice; absent when TTS is off or failed, and the client falls back to
      the browser's built-in speech. */
  'verdict:result': (p: {
    verdict: Verdict;
    names: Record<Side, string>;
    mime?: string;
    audio?: ArrayBuffer;
  }) => void;
  /** Rematch handshake state (per recipient's own view). */
  'rematch:update': (p: { youWant: boolean; peerWant: boolean; peerLeft: boolean }) => void;
  /** Both agreed — reset to the green room for a fresh debate. */
  'rematch:go': () => void;
  /** The YapMaster's coaching answer (sent only to the asker). */
  'coach:reply': (p: { text: string; error?: boolean; done?: boolean }) => void;
  /** The bot's spoken turn: its argument text + optional synthesized audio.
      `failed` means generation broke on our side (API down, out of credits).
      Without it an empty text is indistinguishable from a bot that chose to
      say nothing, which is how an outage once looked like "the bot is mute". */
  'bot:turn': (p: {
    stepIndex: number;
    text: string;
    mime?: string;
    audio?: ArrayBuffer;
    failed?: boolean;
  }) => void;
}

export interface SocketData {
  code?: string;
  role?: Role;
}

// Unicode letters (Arabic mode means Arabic names), digits, underscore.
export const NAME_RE = /^[\p{L}\p{N}_]{3,16}$/u;
