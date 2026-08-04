import type {
  Difficulty,
  Framing,
  Pace,
  Side,
  TopicMode,
  TopicText,
  Verdict,
} from './protocol.js';

export interface Participant {
  socketId: string;
  sessionId: string;
  name: string;
  rtcReady: boolean; // gUM done, tracks added, handlers registered
  disconnectedAt?: number;
  graceTimer?: NodeJS.Timeout;
}

/** Green-room picks (topic ids), per player. Any change resets both confirmations. */
export interface Pick {
  hostTopicId: string | null;
  guestTopicId: string | null;
  hostSide: Side | null;
  guestSide: Side | null;
  hostConfirmed: boolean;
  guestConfirmed: boolean;
  /** Dispute mode: each player's own account of the argument. Private to its
      author until the debate starts — nobody describes anybody else. */
  hostDispute: string | null;
  guestDispute: string | null;
  /** Why we refused to run this one, if we did. */
  disputeProblem: 'no_clash' | 'too_serious' | 'failed' | null;
}

export interface TranscriptEntry {
  stepIndex: number;
  side: Side;
  text: string;
  at: number;
}

export interface AudioTurn {
  stepIndex: number;
  side: Side;
  mime: string;
  data: Buffer;
  /** Order within the turn. Segments arrive while the speaker is still talking. */
  seq: number;
  /** Set once this segment has been through Whisper, so the end-of-turn sweep
      only picks up whatever the live pass missed. */
  transcribed?: boolean;
}

export type LobbyStatus =
  | 'waiting'
  | 'greenroom'
  | 'in_debate'
  | 'judging'
  | 'verdict'
  | 'aborted';

export interface Lobby {
  code: string;
  host?: Participant;
  guest?: Participant;
  status: LobbyStatus;
  topicMode: TopicMode; // how the topic is decided (host-controlled)
  categoryKey: string | null; // chosen category in 'category' mode
  pace: Pace; // turn lengths (host-controlled; survives rematch like topicMode)
  /** Set only in bots mode: the AI opponent. host is the human; there's no guest. */
  bot?: { id: string; name: string; difficulty: Difficulty; side: Side; lang: 'en' | 'ar' };
  pick: Pick;
  topic?: TopicText;
  /** Dispute mode: what the AI made of the two accounts. */
  framing?: Framing;
  sides?: { host: Side; guest: Side };
  stepIndex: number; // -1 before step 0
  stepStartedAt: number; // epoch ms of the last phase transition
  finishedAt?: number; // epoch ms when step 5 ended
  phaseTimer?: NodeJS.Timeout;
  judgeTimer?: NodeJS.Timeout;
  transcript: TranscriptEntry[];
  audioTurns: AudioTurn[];
  /** Per-segment transcription results, kept so a step's line can be rebuilt in
      order as later segments land (and after a retry fills a gap). */
  segmentText: { stepIndex: number; side: Side; seq: number; text: string }[];
  debateCompleted: boolean;
  judgeState: 'idle' | 'pending' | 'done' | 'failed';
  judgeAttempts: number;
  lastJudgeAt: number;
  rematch: { host: boolean; guest: boolean }; // who tapped "run it back"
  /** Bot turns that failed to generate this debate. One is survivable; two
      means the API is down, and the judge runs on the same API, so finishing
      would cost the human three minutes and produce no verdict. */
  botFailures: number;
  coachAsks: number; // "ask the YapMaster" count this debate (cost/abuse cap)
  /** Post-verdict exchange with the YapMaster, per side, so follow-ups and
      appeals build on each other instead of starting cold every time. */
  coachLog: { side: Side; role: 'user' | 'assistant'; content: string }[];
  verdict?: Verdict;
  /** The YapMaster reading the ruling aloud. Synthesized once, replayed on
      re-fetch so a refresh never costs a second TTS call. */
  verdictAudio?: { mime: string; data: Buffer };
  abortInfo?: { reason: string; vars?: Record<string, string> };
  createdAt: number;
  touchedAt: number;
}

const lobbies = new Map<string, Lobby>();

// No ambiguous chars (I/O/0/1)
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(): string {
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
  } while (lobbies.has(code));
  return code;
}

export function createLobby(socketId: string, sessionId: string, name: string): Lobby {
  const now = Date.now();
  const lobby: Lobby = {
    code: generateCode(),
    host: { socketId, sessionId, name, rtcReady: false },
    status: 'waiting',
    topicMode: 'agree',
    categoryKey: null,
    pace: 'standard',
    pick: {
      hostTopicId: null,
      guestTopicId: null,
      hostSide: null,
      guestSide: null,
      hostConfirmed: false,
      guestConfirmed: false,
      hostDispute: null,
      guestDispute: null,
      disputeProblem: null,
    },
    stepIndex: -1,
    stepStartedAt: 0,
    transcript: [],
    audioTurns: [],
    segmentText: [],
    debateCompleted: false,
    judgeState: 'idle',
    judgeAttempts: 0,
    lastJudgeAt: 0,
    rematch: { host: false, guest: false },
    botFailures: 0,
    coachAsks: 0,
    coachLog: [],
    createdAt: now,
    touchedAt: now,
  };
  lobbies.set(lobby.code, lobby);
  return lobby;
}

export function getLobby(code: string): Lobby | undefined {
  return lobbies.get(code.toUpperCase());
}

export function touch(lobby: Lobby): void {
  lobby.touchedAt = Date.now();
}

export function destroyLobby(code: string): void {
  const lobby = lobbies.get(code);
  if (!lobby) return;
  if (lobby.phaseTimer) clearTimeout(lobby.phaseTimer);
  if (lobby.judgeTimer) clearTimeout(lobby.judgeTimer);
  if (lobby.host?.graceTimer) clearTimeout(lobby.host.graceTimer);
  if (lobby.guest?.graceTimer) clearTimeout(lobby.guest.graceTimer);
  lobbies.delete(code);
}

export function participantOf(lobby: Lobby, socketId: string): Participant | undefined {
  if (lobby.host?.socketId === socketId) return lobby.host;
  if (lobby.guest?.socketId === socketId) return lobby.guest;
  return undefined;
}

export function peerOf(lobby: Lobby, socketId: string): Participant | undefined {
  if (lobby.host?.socketId === socketId) return lobby.guest;
  if (lobby.guest?.socketId === socketId) return lobby.host;
  return undefined;
}

export function sideOf(lobby: Lobby, participant: Participant): Side | undefined {
  if (!lobby.sides) return undefined;
  return participant === lobby.host ? lobby.sides.host : lobby.sides.guest;
}

const TTL_MS = 30 * 60 * 1000;

export function startSweep(onDestroy?: (code: string) => void): void {
  setInterval(() => {
    const cutoff = Date.now() - TTL_MS;
    for (const [code, lobby] of lobbies) {
      if (lobby.touchedAt < cutoff) {
        destroyLobby(code);
        onDestroy?.(code);
      }
    }
  }, 5 * 60 * 1000).unref();
}

export function lobbyCount(): number {
  return lobbies.size;
}

/** Every live lobby. Used at shutdown so a deploy can tell people what happened
    instead of dropping their sockets mid-sentence. */
export function allLobbies(): Lobby[] {
  return [...lobbies.values()];
}
