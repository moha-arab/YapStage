import type {
  AvatarId,
  Difficulty,
  Framing,
  Pace,
  Side,
  SidePick,
  TopicMode,
  TopicText,
  Verdict,
} from './protocol.js';
import crypto from 'node:crypto';
import { AVATAR_IDS } from './protocol.js';

/** Everyone gets a mask the moment they take a seat; picking a different one
    in the green room is optional. */
export function randomAvatar(): AvatarId {
  return AVATAR_IDS[Math.floor(Math.random() * AVATAR_IDS.length)];
}

export interface Participant {
  socketId: string;
  sessionId: string;
  name: string;
  /** The mask this player wears (always set; ranked shows only masks). */
  avatarId: AvatarId;
  /** True = debating behind the mask, no camera at all. Ranked forces this. */
  masked: boolean;
  /** Where this debate gets filed afterwards: the account's id when signed
      in, the device id a guest plays under otherwise. Until 2026-09-12 only
      signed-in seats carried one ("guests get no history, by design"); that
      was reversed so a guest's games are waiting for them when they sign in
      and the device id is adopted (store.ts linkAccount). Absent only for a
      client too old to send one. */
  playerId?: string;
  rtcReady: boolean; // gUM done, tracks added, handlers registered
  disconnectedAt?: number;
  graceTimer?: NodeJS.Timeout;
}

/** Green-room picks (topic ids), per player. Any change resets both confirmations. */
export interface Pick {
  hostTopicId: string | null;
  guestTopicId: string | null;
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
  /** The host's side, or 'random' for the coin (host-controlled, any mode;
      survives rematch like topicMode). Bot games resolve their side at
      bot:start instead and never read this. */
  hostSide: SidePick;
  pace: Pace; // turn lengths (host-controlled; survives rematch like topicMode)
  /** Set only in bots mode: the AI opponent. host is the human; there's no guest. */
  bot?: { id: string; name: string; difficulty: Difficulty; rank: number; side: Side; lang: 'en' | 'ar' };
  pick: Pick;
  topic?: TopicText;
  /** Dispute mode: what the AI made of the two accounts. */
  framing?: Framing;
  /** Ranked match: the persistent playerIds whose ratings ride on the result. */
  ranked?: { host: string; guest: string };
  /** Tutorial: the YapMaster teaches instead of competes — no judge, a debrief. */
  tutorial?: boolean;
  /** Campaign identity for bots mode: whose ladder this debate can advance.
      botRank 0 = the tutorial itself. */
  campaign?: { playerId: string; botRank: number };
  /** A placement game: one of the three bot games whose verdicts set this
      player's starting rating, the one exception to bot matches being
      unrated. The id is the ladder identity (the same one the ranked queue
      uses); `step` is how many games were on file when it started (0, 1 or
      2) and `rank` the rung the server picked for it. */
  placement?: { playerId: string; step: number; rank: number };
  /** Session ids that already filed a report this debate (one each). */
  reportedBy?: Set<string>;
  /** Host-controlled (custom): whether the code admits watchers. Ranked is
      always spectatable — it's the public sport. Defaults open: the code is
      already a key, but the host can shut the door entirely. */
  spectatorsAllowed: boolean;
  /** Rating movement after a ranked verdict, kept so a re-fetch replays it. */
  eloResult?: Record<Side, { before: number; after: number }>;
  /** Where the placement series stood after this game's verdict, kept for
      the same reason. */
  placementResult?: import('./protocol.js').PlacementResult;
  /** The last debate:phase payload sent, so a mid-debate spectator (or a
      resumed socket) can land on a live clock instead of a blank screen. */
  lastPhase?: import('./protocol.js').PhaseUpdate;
  sides?: { host: Side; guest: Side };
  stepIndex: number; // -1 before step 0
  stepStartedAt: number; // epoch ms of the last phase transition
  /** stepIndex -> when that turn opened. Anti-cheat reads dead air from this. */
  turnStarts: Map<number, number>;
  /** Per-side tab-blur time reported by the client, for the anti-cheat file. */
  blur: Record<Side, { blurMs: number; blurCount: number }>;
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
  /** "Ask the YapMaster" count this debate, PER SIDE (cost/abuse cap): one
      debater using the coach must not spend the other's questions. */
  coachAsks: Record<Side, number>;
  /** The address that opened this room (friend rooms only), for the
      per-IP cap on rooms waiting for somebody to join. */
  hostIp?: string;
  /** When the room last started waiting for a guest (made, or a guest left
      the green room). A room nobody joins expires after WAITING_TTL_MS. */
  waitingSince: number;
  /** Audio bytes accepted from each side this debate (debate.ts caps it). */
  audioBytes: Record<Side, number>;
  /** When the fight-card reveal ends and step 0 starts, so a socket that
      resumes during the card gets the same card (resendState). */
  startsAt?: number;
  /** Bot games: the steps where the bot's turn (or its failure) has been
      sent. bot:done ends only those, so a client cannot skip a bot turn
      the bot never got to speak. */
  botSpoke: Set<number>;
  /** The bot's last turn as it was sent, so a socket that resumes during the
      bot's step gets it again (debate.ts resendState). */
  lastBotTurn?: { stepIndex: number; text: string; mime?: string; audio?: Buffer; failed?: boolean };
  /** The post-verdict destroy timer, kept so a rematch (or a destroy) can
      cancel it: left running, it deleted the lobby ten minutes after the
      FIRST verdict, in the middle of the rematch. */
  cleanupTimer?: NodeJS.Timeout;
  /** A ranked walk-out already cost the leaver their rating (index.ts). */
  forfeitApplied?: boolean;
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

// A room code is a key to the room (and spectate:join lets the holder in),
// so it comes from the CSPRNG, not Math.random.
function generateCode(): string {
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += ALPHABET[crypto.randomInt(ALPHABET.length)];
    }
  } while (lobbies.has(code));
  return code;
}

export function createLobby(socketId: string, sessionId: string, name: string): Lobby {
  const now = Date.now();
  const lobby: Lobby = {
    code: generateCode(),
    host: { socketId, sessionId, name, avatarId: randomAvatar(), masked: false, rtcReady: false },
    status: 'waiting',
    // Random, since 2026-09-12: the settings panel opens on two plain rows
    // (random topic, coin flip) and the host reaches for a category or a
    // motion. It was 'agree', from when the green room opened on the deck;
    // with the panel on the lobby stage that meant every new room walked out
    // with fifty-six motions already unrolled under the fighters.
    topicMode: 'random',
    categoryKey: null,
    hostSide: 'random',
    // Friend rooms open on standard, like ranked (his call, 2026-09-14, back
    // from a day on blitz); the host can still pick blitz or long in the
    // green room.
    pace: 'standard',
    pick: {
      hostTopicId: null,
      guestTopicId: null,
      hostConfirmed: false,
      guestConfirmed: false,
      hostDispute: null,
      guestDispute: null,
      disputeProblem: null,
    },
    stepIndex: -1,
    stepStartedAt: 0,
    turnStarts: new Map(),
    blur: { FOR: { blurMs: 0, blurCount: 0 }, AGAINST: { blurMs: 0, blurCount: 0 } },
    transcript: [],
    audioTurns: [],
    segmentText: [],
    debateCompleted: false,
    judgeState: 'idle',
    judgeAttempts: 0,
    lastJudgeAt: 0,
    rematch: { host: false, guest: false },
    spectatorsAllowed: true,
    botFailures: 0,
    coachAsks: { FOR: 0, AGAINST: 0 },
    coachLog: [],
    waitingSince: now,
    audioBytes: { FOR: 0, AGAINST: 0 },
    botSpoke: new Set(),
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

/** Set once by index.ts: what else has to go when a lobby goes (its
    spectator list and the spectators' audio room). It lives here, on the one
    function every path calls (a leave, a sweep, abort's timer, the judge's
    post-verdict cleanup), so no path can forget it. Runs after the lobby is
    out of the map. */
let onLobbyDestroyed: ((code: string) => void) | null = null;
export function setOnLobbyDestroyed(fn: ((code: string) => void) | null): void {
  onLobbyDestroyed = fn;
}

export function destroyLobby(code: string): void {
  const lobby = lobbies.get(code);
  if (!lobby) return;
  if (lobby.phaseTimer) clearTimeout(lobby.phaseTimer);
  if (lobby.judgeTimer) clearTimeout(lobby.judgeTimer);
  if (lobby.cleanupTimer) clearTimeout(lobby.cleanupTimer);
  if (lobby.host?.graceTimer) clearTimeout(lobby.host.graceTimer);
  if (lobby.guest?.graceTimer) clearTimeout(lobby.guest.graceTimer);
  lobbies.delete(code);
  try {
    onLobbyDestroyed?.(code);
  } catch (err) {
    console.error('[lobby] destroy hook failed', err);
  }
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
/** A room nobody has joined is gone after this long: an open invite is
    worth ten minutes, and a pile of empty rooms is how the lobby cap and
    the per-IP cap get eaten. */
export const WAITING_TTL_MS = 10 * 60 * 1000;

/** Waiting rooms (a friend room nobody has joined yet) opened from `ip`,
    other than the one `exceptCode` names. */
export function waitingRoomsFrom(ip: string, exceptCode?: string): number {
  let n = 0;
  for (const l of lobbies.values()) {
    if (l.status === 'waiting' && l.hostIp === ip && l.code !== exceptCode) n += 1;
  }
  return n;
}

/** A room that holds its players: a green room (a friend room with both
    seats, or a ranked pairing), a debate, or a verdict still being written.
    A waiting room does not count: it costs nothing and the lobby opens one
    whenever the friend tab is on screen. */
export function seatIsLive(l: Lobby): boolean {
  return (
    l.status === 'greenroom' || l.status === 'in_debate' || (l.status === 'judging' && l.judgeState !== 'failed')
  );
}

/** The lobby in which `playerId` holds a live seat through some socket
    other than `exceptSocketId`: a second tab, or another device on the same
    account (a signed-in seat's playerId is the account's). One player, one
    live seat: every start refuses while this finds something (index.ts). */
export function liveSeatOf(playerId: string | undefined, exceptSocketId?: string): Lobby | undefined {
  if (!playerId) return undefined;
  for (const l of lobbies.values()) {
    if (!seatIsLive(l)) continue;
    for (const s of [l.host, l.guest]) {
      if (s && s.playerId === playerId && s.socketId !== exceptSocketId) return l;
    }
  }
  return undefined;
}

/** The guest walked out of a friend room's green room (Leave, or the tab
    closed): the room goes back to waiting under the SAME code, for them to
    come back or for somebody else. The host's settings stay; the guest's
    picks, both confirmations and the host's WebRTC readiness do not, and the
    ten-minute wait for a guest starts again. Ranked rooms never come here
    (a ranked seat belongs to the pairing; index.ts closes those). */
export function reopenForNextGuest(lobby: Lobby): void {
  if (lobby.guest?.graceTimer) clearTimeout(lobby.guest.graceTimer);
  lobby.guest = undefined;
  lobby.status = 'waiting';
  lobby.waitingSince = Date.now();
  // In 'agree' mode the guest's pick is the host's, mirrored (index.ts
  // pick:topic): keep the mirror, or the next guest walks in on a blank one.
  lobby.pick.guestTopicId = lobby.topicMode === 'agree' ? lobby.pick.hostTopicId : null;
  lobby.pick.guestDispute = null;
  lobby.pick.disputeProblem = null;
  lobby.pick.hostConfirmed = false;
  lobby.pick.guestConfirmed = false;
  lobby.rematch = { host: false, guest: false };
  if (lobby.host) lobby.host.rtcReady = false;
  touch(lobby);
}

export function startSweep(onDestroy?: (code: string) => void): void {
  setInterval(() => {
    const now = Date.now();
    const cutoff = now - TTL_MS;
    const waitCutoff = now - WAITING_TTL_MS;
    for (const [code, lobby] of lobbies) {
      if (lobby.touchedAt < cutoff || (lobby.status === 'waiting' && lobby.waitingSince < waitCutoff)) {
        destroyLobby(code);
        onDestroy?.(code);
      }
    }
  }, 60 * 1000).unref();
}

export function lobbyCount(): number {
  return lobbies.size;
}

/** Every live lobby. Used at shutdown so a deploy can tell people what happened
    instead of dropping their sockets mid-sentence. */
export function allLobbies(): Lobby[] {
  return [...lobbies.values()];
}
