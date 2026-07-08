import type { Side, Verdict } from './protocol.js';

export interface Participant {
  socketId: string;
  sessionId: string;
  name: string;
  ready: boolean; // consent given + Ready clicked in green room
  rtcReady: boolean; // gUM done, tracks added, handlers registered
  disconnectedAt?: number;
  graceTimer?: NodeJS.Timeout;
}

export interface TranscriptEntry {
  stepIndex: number;
  side: Side;
  text: string;
  at: number;
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
  topic?: string;
  sides?: { host: Side; guest: Side };
  stepIndex: number; // -1 before step 0
  stepStartedAt: number; // epoch ms of the last phase transition
  finishedAt?: number; // epoch ms when step 5 ended
  phaseTimer?: NodeJS.Timeout;
  judgeTimer?: NodeJS.Timeout;
  transcript: TranscriptEntry[];
  debateCompleted: boolean;
  judgeState: 'idle' | 'pending' | 'done' | 'failed';
  verdict?: Verdict;
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
    host: { socketId, sessionId, name, ready: false, rtcReady: false },
    status: 'waiting',
    stepIndex: -1,
    stepStartedAt: 0,
    transcript: [],
    debateCompleted: false,
    judgeState: 'idle',
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
