import type { Difficulty, Side, TopicMode, TopicText, Verdict } from './protocol.js';

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
  /** Set only in bots mode: the AI opponent. host is the human; there's no guest. */
  bot?: { id: string; name: string; difficulty: Difficulty; side: Side; lang: 'en' | 'ar' };
  pick: Pick;
  topic?: TopicText;
  sides?: { host: Side; guest: Side };
  stepIndex: number; // -1 before step 0
  stepStartedAt: number; // epoch ms of the last phase transition
  finishedAt?: number; // epoch ms when step 5 ended
  phaseTimer?: NodeJS.Timeout;
  judgeTimer?: NodeJS.Timeout;
  transcript: TranscriptEntry[];
  audioTurns: AudioTurn[];
  debateCompleted: boolean;
  judgeState: 'idle' | 'pending' | 'done' | 'failed';
  judgeAttempts: number;
  lastJudgeAt: number;
  rematch: { host: boolean; guest: boolean }; // who tapped "run it back"
  coachAsks: number; // "ask the YapMaster" count this debate (cost/abuse cap)
  verdict?: Verdict;
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
    pick: {
      hostTopicId: null,
      guestTopicId: null,
      hostSide: null,
      guestSide: null,
      hostConfirmed: false,
      guestConfirmed: false,
    },
    stepIndex: -1,
    stepStartedAt: 0,
    transcript: [],
    audioTurns: [],
    debateCompleted: false,
    judgeState: 'idle',
    judgeAttempts: 0,
    lastJudgeAt: 0,
    rematch: { host: false, guest: false },
    coachAsks: 0,
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
