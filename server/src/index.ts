import './env.js'; // MUST be first: populates process.env before any module that reads it at load time
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { Server } from 'socket.io';
import {
  NAME_RE,
  type ClientToServer,
  type LobbyUpdate,
  type ServerToClient,
  type SocketData,
} from './protocol.js';
import { REFRESH_MS, getIceServers, refreshIceServers, turnMode } from './turn.js';
import {
  createLobby,
  destroyLobby,
  getLobby,
  allLobbies,
  lobbyCount,
  participantOf,
  peerOf,
  sideOf,
  startSweep,
  touch,
  type Lobby,
  type Participant,
} from './lobby.js';
import {
  abort,
  acceptAudioTurn,
  acceptChunk,
  advance,
  endTurnEarly,
  resendState,
  scriptFor,
  setOnDebateStarted,
  startBotDebate,
  startDebate,
  startDispute,
  type Io,
} from './debate.js';
import { BOT_BY_ID, publicBots } from './bots.js';
import { sttConfigured } from './stt.js';
import { namesOf, runJudge, scoreTranscript } from './judge.js';
import { coachReply } from './coach.js';
import { cardFrom, renderCard } from './share.js';
import { DISPUTE_MAX } from './dispute.js';
import {
  getPlayer,
  initStore,
  lastShutdown,
  loadCard,
  recordShutdown,
  saveCard,
  storeReady,
} from './store.js';
import { TOPIC_BY_ID, TOPIC_CATEGORIES } from './topics.js';
import { event, recentEvents, statsSnapshot } from './stats.js';
import { allow } from './ratelimit.js';

// Deployed on Railway via Dockerfile (see railway.json). Fastify serves the
// built client from client/dist and hosts the Socket.IO signaling server.
// (.env is loaded by ./env.js, imported first above.)
const here = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 3000;
const GRACE_MS = 15_000;
const MAX_LOBBIES = 500;
// Fast mode is test-only (never set in production). The smoke test creates many
// lobbies from one IP, so the create/join limiter is off in fast mode.
const FAST = process.env.DEBATE_SPEED === 'fast';

// Backstop: one malformed packet must never take down every live debate.
// All lobby state is in-memory, so a crash is a mass abort.
process.on('uncaughtException', (err) => console.error('[fatal]', err));
process.on('unhandledRejection', (err) => console.error('[fatal-rejection]', err));

await refreshIceServers();
setInterval(() => void refreshIceServers(), REFRESH_MS).unref();

// Optional: without a database, share links just stay self-contained.
await initStore();

// Exactly one proxy hop (Railway's edge) — trusting the whole XFF chain would
// let clients spoof their own rate-limit identity.
// maxParamLength defaults to 100, which silently 404s every share card: the
// whole verdict is encoded into the /v/:token param and runs ~500 chars in
// English, ~700 in Arabic.
const app = Fastify({ logger: false, trustProxy: 1, maxParamLength: 4200 });

const clientDist = path.resolve(here, '../../client/dist');
if (fs.existsSync(clientDist)) {
  await app.register(fastifyStatic, { root: clientDist });
} else {
  console.warn(`[server] client build not found at ${clientDist} — API/socket only`);
}

// Shareable verdict card. The result is encoded in the path, so this route
// reads nothing and stores nothing — it just renders what the link carries.
// Registered before the static handler so /v/... never looks for a file.
app.get<{ Params: { token: string } }>('/v/:token', async (req, reply) => {
  const card = await loadCard(String(req.params.token ?? ''));
  if (!card) {
    return reply.code(404).type('text/html').send(
      `<!doctype html><meta charset="utf-8"><title>YapStage</title>` +
        `<body style="background:#151210;color:#f2e8d5;font-family:system-ui;text-align:center;padding:60px">` +
        `<p>that link is not a verdict.</p><p><a style="color:#d4af37" href="/">go to YapStage</a></p>`,
    );
  }
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const origin = `${proto}://${req.headers.host ?? 'www.yapstage.com'}`;
  event('share_view');
  return reply.type('text/html').send(renderCard(card, origin));
});

app.get('/healthz', async () => ({
  ok: true,
  lobbies: lobbyCount(),
  turn: turnMode(),
  stt: sttConfigured() ? 'cloudflare' : 'browser',
  tts: process.env.ELEVENLABS_API_KEY ? 'elevenlabs' : 'browser',
  share: storeReady() ? 'stored' : 'in-link',
  commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
}));

app.get('/bots', async () => ({ bots: publicBots(), topics: TOPIC_CATEGORIES }));

// Gate with STATS_KEY when set (404 so the endpoint doesn't advertise itself);
// public when unset — zero-config for casual use, lockable in one env var.
app.get<{ Querystring: { key?: string } }>('/stats', async (req, reply) => {
  if (process.env.STATS_KEY && req.query.key !== process.env.STATS_KEY) {
    return reply.code(404).send({ error: 'Not Found' });
  }
  return { ...statsSnapshot(), lobbies: lobbyCount() };
});

// The event trail behind the counters. `?code=ABC123` follows one debate end to
// end, which is the question that actually gets asked when something breaks:
// did their audio arrive, how big was it, and how many words came back.
app.get<{ Querystring: { key?: string; code?: string; limit?: string } }>(
  '/stats/events',
  async (req, reply) => {
    if (process.env.STATS_KEY && req.query.key !== process.env.STATS_KEY) {
      return reply.code(404).send({ error: 'Not Found' });
    }
    const limit = Math.min(400, Math.max(1, Number(req.query.limit) || 100));
    return {
      // How the PREVIOUS instance died. Present means the shutdown handler ran.
      previousShutdown: await lastShutdown(),
      events: recentEvents(limit, req.query.code?.toUpperCase()),
    };
  },
);

// Uncaught client errors phone home here so breakage on someone's device is
// visible in the logs without them having to report it.
app.post<{ Body: { msg?: string; stack?: string; url?: string; ua?: string } }>(
  '/client-error',
  { bodyLimit: 8192 },
  async (req, reply) => {
    // Per-IP limit plus a global fuse: a distributed spray must not be able to
    // bury the real errors this endpoint exists to surface.
    if (!allow(`cerr:${req.ip}`, 10, 60_000) || !allow('cerr:global', 300, 60_000)) {
      return reply.code(429).send({ ok: false });
    }
    const b = req.body ?? {};
    // Strip control chars so injected text can't fake its own log lines.
    const clean = (v: unknown, max: number) =>
      String(v ?? '')
        .replace(/[\u0000-\u001f\u007f]/g, ' ')
        .slice(0, max);
    event('client_error', {
      msg: clean(b.msg, 500),
      stack: clean(b.stack, 2000),
      url: clean(b.url, 200),
      ua: clean(b.ua, 200),
    });
    return { ok: true };
  },
);

// Test-only (fast mode never runs in production): score a synthetic transcript
// directly so the fairness eval can hammer the judge without full debates.
if (FAST) {
  app.post<{
    Body: {
      motion?: { en?: string; ar?: string };
      lines?: { stepIndex: number; side: 'FOR' | 'AGAINST'; text: string }[];
      composedSide?: 'FOR' | 'AGAINST';
    };
  }>('/judge-eval', { bodyLimit: 400_000 }, async (req, reply) => {
    const b = req.body ?? {};
    try {
      const verdict = await scoreTranscript(b.motion ?? {}, Array.isArray(b.lines) ? b.lines : [], {
        composedSide:
          b.composedSide === 'FOR' || b.composedSide === 'AGAINST' ? b.composedSide : undefined,
      });
      return { ok: true, verdict };
    } catch (err) {
      return reply.code(500).send({ ok: false, error: String(err).slice(0, 200) });
    }
  });
}

await app.ready();

const io: Io = new Server<ClientToServer, ServerToClient, Record<string, never>, SocketData>(
  app.server,
  // maxHttpBufferSize must sit ABOVE the audio:turn app-level cap (3MB): the
  // engine.io default of 1MB would hard-disconnect a speaker mid-upload
  // instead of letting the handler reject the blob.
  { serveClient: false, maxHttpBufferSize: 4_000_000 },
);

// ---- ranked matchmaking queue ----
// In-memory like the lobbies. An entry is one waiting socket; pairing is
// strictly first-come-first-served (rating-window matchmaking is pointless
// until there are enough concurrent players for a window to select from).
interface QueueEntry {
  socketId: string;
  sessionId: string;
  playerId: string;
  name: string;
  rating: number;
}
const rankedQueue: QueueEntry[] = [];

function dropFromQueue(socketId: string): void {
  const i = rankedQueue.findIndex((q) => q.socketId === socketId);
  if (i >= 0) rankedQueue.splice(i, 1);
}

function broadcastQueue(): void {
  for (const q of rankedQueue) {
    io.to(q.socketId).emit('queue:update', { waiting: rankedQueue.length, rating: q.rating });
  }
}

/** Pair the two longest-waiting players into a ranked green room. */
function tryMatch(): void {
  while (rankedQueue.length >= 2) {
    const a = rankedQueue.shift()!;
    const b = rankedQueue.shift()!;
    const sa = io.sockets.sockets.get(a.socketId);
    const sb = io.sockets.sockets.get(b.socketId);
    // A ghost entry (socket died between heartbeats) must not eat a real one.
    if (!sa || !sb) {
      if (sa) rankedQueue.unshift(a);
      if (sb) rankedQueue.unshift(b);
      if (!sa && !sb) continue;
      break;
    }
    const lobby = createLobby(a.socketId, a.sessionId, a.name);
    lobby.guest = { socketId: b.socketId, sessionId: b.sessionId, name: b.name, rtcReady: false };
    lobby.status = 'greenroom';
    lobby.topicMode = 'random'; // strangers never negotiate a topic
    lobby.ranked = { host: a.playerId, guest: b.playerId };
    sa.data.code = lobby.code;
    sa.data.role = 'host';
    sb.data.code = lobby.code;
    sb.data.role = 'guest';
    void sa.join(lobby.code);
    void sb.join(lobby.code);
    event('ranked_matched', { code: lobby.code });
    io.to(a.socketId).emit('queue:matched', { update: updateFor(lobby, lobby.host!) });
    io.to(b.socketId).emit('queue:matched', { update: updateFor(lobby, lobby.guest!) });
  }
  broadcastQueue();
}

// ---- spectators ----
// Not participants: no seat, no camera, no mic. They sit in BOTH the lobby's
// socket room (free live state: phases, verdicts, aborts) and a spec room
// (audio relays). Debaters always see the watcher count.
const spectators = new Map<string, Set<string>>(); // code -> socketIds
const SPECTATOR_CAP = 20;

function spectatorCount(code: string): number {
  return spectators.get(code)?.size ?? 0;
}

function broadcastWatchers(code: string): void {
  const n = spectatorCount(code);
  io.to(code).emit('spectate:count', { n });
  io.to(`spec:${code}`).emit('spectate:count', { n });
}

function dropSpectator(socketId: string, code: string): void {
  const set = spectators.get(code);
  if (!set?.delete(socketId)) return;
  if (set.size === 0) spectators.delete(code);
  broadcastWatchers(code);
}

function spectateStateFor(lobby: Lobby): import('./protocol.js').SpectateState {
  return {
    code: lobby.code,
    status:
      lobby.status === 'aborted'
        ? 'verdict'
        : (lobby.status as 'waiting' | 'greenroom' | 'in_debate' | 'judging' | 'verdict'),
    topic: lobby.topic,
    names: lobby.sides ? namesOf(lobby) : undefined,
    bot: lobby.bot
      ? {
          id: lobby.bot.id,
          name: lobby.bot.name,
          color: BOT_BY_ID.get(lobby.bot.id)?.color ?? 'gold',
          side: lobby.bot.side,
        }
      : undefined,
    phase: lobby.status === 'in_debate' ? lobby.lastPhase : undefined,
    watchers: spectatorCount(lobby.code),
  };
}

function updateFor(lobby: Lobby, receiver: Participant): LobbyUpdate {
  const isHost = receiver === lobby.host;
  const peer = isHost ? lobby.guest : lobby.host;
  const { pick } = lobby;
  return {
    code: lobby.code,
    role: isHost ? 'host' : 'guest',
    yourName: receiver.name,
    peerName: peer?.name,
    participantCount: lobby.host && lobby.guest ? 2 : 1,
    locked: Boolean(lobby.host && lobby.guest),
    deck: TOPIC_CATEGORIES,
    topicMode: lobby.topicMode,
    categoryKey: lobby.categoryKey,
    pace: lobby.pace,
    pick: {
      yourTopicId: isHost ? pick.hostTopicId : pick.guestTopicId,
      peerTopicId: isHost ? pick.guestTopicId : pick.hostTopicId,
      yourSide: isHost ? pick.hostSide : pick.guestSide,
      peerSide: isHost ? pick.guestSide : pick.hostSide,
      youConfirmed: isHost ? pick.hostConfirmed : pick.guestConfirmed,
      peerConfirmed: isHost ? pick.guestConfirmed : pick.hostConfirmed,
      // You get YOUR OWN account back, and only whether theirs has landed.
      // Seeing what the other person wrote before you write yours would turn
      // an honest description into a rebuttal.
      yourDispute: isHost ? pick.hostDispute : pick.guestDispute,
      peerDisputeReady: Boolean(isHost ? pick.guestDispute : pick.hostDispute),
      disputeProblem: pick.disputeProblem,
    },
    iceServers: getIceServers(),
    sttAvailable: sttConfigured(),
    ranked: Boolean(lobby.ranked),
  };
}

function broadcastLobbyUpdate(lobby: Lobby): void {
  for (const p of [lobby.host, lobby.guest]) {
    if (p && !p.disconnectedAt) io.to(p.socketId).emit('lobby:update', updateFor(lobby, p));
  }
}

// Each side gets its OWN view of the rematch handshake (you vs peer).
function broadcastRematch(lobby: Lobby): void {
  const guestGone = !lobby.guest || Boolean(lobby.guest.disconnectedAt);
  const hostGone = !lobby.host || Boolean(lobby.host.disconnectedAt);
  if (lobby.host && !lobby.host.disconnectedAt) {
    io.to(lobby.host.socketId).emit('rematch:update', {
      youWant: lobby.rematch.host,
      peerWant: lobby.rematch.guest,
      peerLeft: guestGone,
    });
  }
  if (lobby.guest && !lobby.guest.disconnectedAt) {
    io.to(lobby.guest.socketId).emit('rematch:update', {
      youWant: lobby.rematch.guest,
      peerWant: lobby.rematch.host,
      peerLeft: hostGone,
    });
  }
}

// Both agreed: wipe the finished debate back to a fresh green room, keeping the
// two players, their connection, and the chosen topic-mode. They re-set-up.
function resetForRematch(lobby: Lobby): void {
  if (lobby.phaseTimer) clearTimeout(lobby.phaseTimer);
  if (lobby.judgeTimer) clearTimeout(lobby.judgeTimer);
  lobby.phaseTimer = undefined;
  lobby.judgeTimer = undefined;
  lobby.status = 'greenroom';
  lobby.topic = undefined;
  lobby.sides = undefined;
  lobby.transcript = [];
  lobby.audioTurns = [];
  lobby.debateCompleted = false;
  lobby.judgeState = 'idle';
  lobby.judgeAttempts = 0;
  lobby.lastJudgeAt = 0;
  lobby.verdict = undefined;
  lobby.abortInfo = undefined;
  lobby.stepIndex = -1;
  lobby.stepStartedAt = 0;
  lobby.finishedAt = undefined;
  lobby.rematch = { host: false, guest: false };
  lobby.coachAsks = 0;
  lobby.coachLog = [];
  // Keep topicMode + categoryKey (they land back on the same setup). Clear the
  // per-player picks + confirms so they choose fresh.
  lobby.pick.hostTopicId = null;
  lobby.pick.guestTopicId = null;
  lobby.pick.hostSide = null;
  lobby.pick.guestSide = null;
  lobby.pick.hostConfirmed = false;
  lobby.pick.guestConfirmed = false;
  touch(lobby);
  event('rematch', { code: lobby.code });
}

function ipOf(socket: { handshake: { headers: Record<string, unknown>; address: string } }): string {
  // RIGHTMOST x-forwarded-for entry: that's the one Railway's proxy appended.
  // Anything left of it is client-supplied and trivially spoofable.
  const fwd = socket.handshake.headers['x-forwarded-for'];
  const chain = Array.isArray(fwd) ? fwd.join(',') : typeof fwd === 'string' ? fwd : '';
  const parts = chain.split(',');
  const last = parts[parts.length - 1]?.trim();
  return last || socket.handshake.address;
}

// A socket that creates/joins a second lobby silently abandons its first one;
// without this, the abandoned lobby survives until the 30-minute TTL sweep.
function releasePreviousSeat(socket: { id: string; data: SocketData }): void {
  const prev = socket.data.code ? getLobby(socket.data.code) : undefined;
  if (prev && prev.status === 'waiting' && participantOf(prev, socket.id)) {
    destroyLobby(prev.code);
    io.socketsLeave(prev.code);
  }
  socket.data.code = undefined;
}

io.on('connection', (socket) => {
  socket.on('lobby:create', (p, cb) => {
    if (typeof cb !== 'function') return;
    // Friendly ceiling: two friends never hit this; a lobby-spam script does.
    if (!FAST && !allow(`create:${ipOf(socket)}`, 10, 5 * 60_000)) {
      return cb({ ok: false, error: 'rate_limited' });
    }
    const name = String(p?.name ?? '').trim();
    if (!NAME_RE.test(name)) return cb({ ok: false, error: 'bad_name' });
    if (lobbyCount() >= MAX_LOBBIES) return cb({ ok: false, error: 'rate_limited' });
    releasePreviousSeat(socket);
    const lobby = createLobby(socket.id, String(p.sessionId ?? '').slice(0, 64), name);
    event('lobby_created', { code: lobby.code });
    socket.data.code = lobby.code;
    socket.data.role = 'host';
    void socket.join(lobby.code);
    cb({ ok: true, update: updateFor(lobby, lobby.host!) });
  });

  socket.on('lobby:join', (p, cb) => {
    if (typeof cb !== 'function') return;
    // Also throttles brute-forcing lobby codes (32^6 space, but still).
    if (!FAST && !allow(`join:${ipOf(socket)}`, 30, 5 * 60_000)) {
      return cb({ ok: false, error: 'rate_limited' });
    }
    const name = String(p?.name ?? '').trim();
    if (!NAME_RE.test(name)) return cb({ ok: false, error: 'bad_name' });
    const lobby = getLobby(String(p.code ?? '').slice(0, 8));
    if (!lobby) return cb({ ok: false, error: 'not_found' });
    if (lobby.status !== 'waiting') {
      // greenroom = the seat is taken; anything later = it started without you.
      return cb({ ok: false, error: lobby.status === 'greenroom' ? 'full' : 'in_progress' });
    }
    if (lobby.guest) return cb({ ok: false, error: 'full' });

    releasePreviousSeat(socket);
    lobby.guest = {
      socketId: socket.id,
      sessionId: String(p.sessionId ?? '').slice(0, 64),
      name,
      rtcReady: false,
    };
    lobby.status = 'greenroom';
    touch(lobby);
    socket.data.code = lobby.code;
    socket.data.role = 'guest';
    void socket.join(lobby.code);
    event('lobby_joined', { code: lobby.code });
    cb({ ok: true, update: updateFor(lobby, lobby.guest) });
    broadcastLobbyUpdate(lobby);
  });

  socket.on('lobby:resume', (p, cb) => {
    if (typeof cb !== 'function') return;
    const lobby = getLobby(String(p?.code ?? ''));
    const sessionId = String(p?.sessionId ?? '');
    if (!lobby || !sessionId) return cb({ ok: false });
    // Match by sessionId ONLY — not disconnectedAt. In a half-open TCP drop
    // (wifi switch, laptop sleep) the client reconnects long before the
    // server's ping timeout notices the old socket died; the new connection
    // is authoritative for this sessionId.
    const slot =
      lobby.host?.sessionId === sessionId
        ? lobby.host
        : lobby.guest?.sessionId === sessionId
          ? lobby.guest
          : undefined;
    if (!slot) return cb({ ok: false });

    const oldSocketId = slot.socketId;
    if (slot.graceTimer) clearTimeout(slot.graceTimer);
    slot.graceTimer = undefined;
    slot.disconnectedAt = undefined;
    slot.socketId = socket.id; // swap FIRST: the old socket's late disconnect
    socket.data.code = lobby.code; // event no longer matches any participant
    socket.data.role = slot === lobby.host ? 'host' : 'guest';
    void socket.join(lobby.code);
    touch(lobby);
    cb({ ok: true });

    // Evict the superseded socket so it can't linger in the room.
    if (oldSocketId !== socket.id) {
      io.sockets.sockets.get(oldSocketId)?.disconnect(true);
    }

    resendState(io, lobby, slot);
    if (lobby.status === 'waiting' || lobby.status === 'greenroom') {
      socket.emit('lobby:update', updateFor(lobby, slot));
    }
    const peer = peerOf(lobby, socket.id);
    if (peer && !peer.disconnectedAt) {
      io.to(peer.socketId).emit('peer:connection', { state: 'restored' });
    }
  });

  // Host chooses how the topic is decided. Any change resets both confirms.
  socket.on('pick:mode', (mode) => {
    if (!allow(`pick:${socket.id}`, 60, 10_000)) return;
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    // 'waiting' is allowed: the home page's settle-it door sets the mode right
    // after creating the lobby, before the friend has joined. Rejecting that
    // silently dropped the door's whole purpose and the green room opened on
    // topic tabs anyway.
    if (!lobby || (lobby.status !== 'greenroom' && lobby.status !== 'waiting')) return;
    if (lobby.ranked) return; // ranked is fixed-format
    // Settle-it is PARKED (2026-08-05): fully built, deliberately unreachable.
    // The app's identity is the four sport modes; this is the show. Flip
    // DISPUTE_MODE=on in the environment to bring it back — everything behind
    // this gate (framing, dispute judge, ruling screen, share card) still works.
    if (mode === 'dispute' && process.env.DISPUTE_MODE !== 'on') return;
    if (participantOf(lobby, socket.id) !== lobby.host) return; // host-only
    if (mode !== 'agree' && mode !== 'category' && mode !== 'random' && mode !== 'dispute') return;
    if (lobby.topicMode === mode) return;
    lobby.topicMode = mode;
    lobby.categoryKey = null; // a mode switch clears the pending category
    // Leaving settle-it drops what they wrote: a dispute is not a topic to be
    // carried into another mode, and it should not outlive the mode either.
    lobby.pick.hostDispute = null;
    lobby.pick.guestDispute = null;
    lobby.pick.disputeProblem = null;
    lobby.pick.hostConfirmed = false;
    lobby.pick.guestConfirmed = false;
    touch(lobby);
    broadcastLobbyUpdate(lobby);
  });

  // Host picks the pace (turn lengths). Any change resets both confirms.
  socket.on('pick:pace', (pace) => {
    if (!allow(`pick:${socket.id}`, 60, 10_000)) return;
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby || lobby.status !== 'greenroom') return;
    if (lobby.ranked) return; // ranked is fixed-format: strangers, fair terms
    if (participantOf(lobby, socket.id) !== lobby.host) return; // host-only
    if (pace !== 'standard' && pace !== 'blitz' && pace !== 'long') return;
    if (lobby.pace === pace) return;
    lobby.pace = pace;
    lobby.pick.hostConfirmed = false;
    lobby.pick.guestConfirmed = false;
    touch(lobby);
    broadcastLobbyUpdate(lobby);
  });

  // Host picks the category for 'category' mode.
  socket.on('pick:category', (key) => {
    if (!allow(`pick:${socket.id}`, 60, 10_000)) return;
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby || lobby.status !== 'greenroom' || lobby.topicMode !== 'category') return;
    if (participantOf(lobby, socket.id) !== lobby.host) return; // host-only
    const k = String(key ?? '');
    if (!TOPIC_CATEGORIES.some((c) => c.key === k)) return;
    if (lobby.categoryKey === k) return;
    lobby.categoryKey = k;
    lobby.pick.hostConfirmed = false;
    lobby.pick.guestConfirmed = false;
    touch(lobby);
    broadcastLobbyUpdate(lobby);
  });

  socket.on('pick:topic', (topicId) => {
    if (!allow(`pick:${socket.id}`, 60, 10_000)) return;
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby || lobby.status !== 'greenroom' || lobby.topicMode !== 'agree') return;
    const me = participantOf(lobby, socket.id);
    if (!me) return;
    const id = String(topicId ?? '');
    if (!TOPIC_BY_ID.has(id)) return;
    // No-op picks don't rebroadcast: repeated identical events are free.
    if ((me === lobby.host ? lobby.pick.hostTopicId : lobby.pick.guestTopicId) === id) return;
    if (me === lobby.host) lobby.pick.hostTopicId = id;
    else lobby.pick.guestTopicId = id;
    // any change requires both players to re-confirm
    lobby.pick.hostConfirmed = false;
    lobby.pick.guestConfirmed = false;
    touch(lobby);
    broadcastLobbyUpdate(lobby);
  });

  socket.on('pick:side', (side) => {
    if (!allow(`pick:${socket.id}`, 60, 10_000)) return;
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby || lobby.status !== 'greenroom' || lobby.topicMode !== 'agree') return;
    const me = participantOf(lobby, socket.id);
    if (!me) return;
    if (side !== 'FOR' && side !== 'AGAINST') return;
    if ((me === lobby.host ? lobby.pick.hostSide : lobby.pick.guestSide) === side) return;
    if (me === lobby.host) lobby.pick.hostSide = side;
    else lobby.pick.guestSide = side;
    lobby.pick.hostConfirmed = false;
    lobby.pick.guestConfirmed = false;
    touch(lobby);
    broadcastLobbyUpdate(lobby);
  });

  // Dispute mode: your own account of the argument, in your own words. Writing
  // it clears any previous refusal so a re-word gets a fresh read.
  socket.on('pick:dispute', (text) => {
    if (!allow(`pick:${socket.id}`, 60, 10_000)) return;
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby || lobby.status !== 'greenroom' || lobby.topicMode !== 'dispute') return;
    const me = participantOf(lobby, socket.id);
    if (!me) return;
    const clean = String(text ?? '').trim().slice(0, DISPUTE_MAX);
    if (me === lobby.host) lobby.pick.hostDispute = clean || null;
    else lobby.pick.guestDispute = clean || null;
    // Any change invalidates both confirmations, same as changing a topic.
    lobby.pick.hostConfirmed = false;
    lobby.pick.guestConfirmed = false;
    lobby.pick.disputeProblem = null;
    touch(lobby);
    broadcastLobbyUpdate(lobby);
  });

  socket.on('pick:confirm', () => {
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby || lobby.status !== 'greenroom') return;
    const me = participantOf(lobby, socket.id);
    if (!me) return;
    const { pick } = lobby;
    // What "ready to confirm" means depends on the mode.
    const agreed =
      pick.hostTopicId !== null &&
      pick.hostTopicId === pick.guestTopicId &&
      pick.hostSide !== null &&
      pick.guestSide !== null &&
      pick.hostSide !== pick.guestSide;
    const ready =
      lobby.topicMode === 'agree'
        ? agreed
        : lobby.topicMode === 'category'
          ? lobby.categoryKey !== null
          : lobby.topicMode === 'dispute'
            ? Boolean(pick.hostDispute && pick.guestDispute)
            : true; // random: nothing to pick
    if (!ready) return;
    if (me === lobby.host) pick.hostConfirmed = true;
    else pick.guestConfirmed = true;
    touch(lobby);
    broadcastLobbyUpdate(lobby);
    if (!pick.hostConfirmed || !pick.guestConfirmed) return;
    if (lobby.topicMode === 'dispute') {
      void startDispute(io, lobby, broadcastLobbyUpdate);
      return;
    }
    startDebate(io, lobby);
  });

  socket.on('rtc:ready', () => {
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby) return;
    const me = participantOf(lobby, socket.id);
    if (!me) return;
    me.rtcReady = true;
    if (lobby.host?.rtcReady && lobby.guest?.rtcReady) {
      io.to(lobby.host.socketId).emit('rtc:go');
    }
  });

  socket.on('rtc:signal', (payload) => {
    if (!allow(`sig:${socket.id}`, 200, 10_000)) return;
    // Only relay things shaped like signaling; this server is not a generic
    // megabyte pipe between two browsers.
    if (!payload || typeof payload !== 'object') return;
    if (!('description' in payload) && !('candidate' in payload)) return;
    try {
      if (JSON.stringify(payload).length > 16_000) return;
    } catch {
      return;
    }
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby) return;
    const peer = peerOf(lobby, socket.id);
    if (peer && !peer.disconnectedAt) io.to(peer.socketId).emit('rtc:signal', payload);
  });

  socket.on('speech:chunk', (chunk) => {
    if (!chunk || typeof chunk !== 'object') return;
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby) return;
    const me = participantOf(lobby, socket.id);
    if (!me) return;
    acceptChunk(lobby, me, chunk);
  });

  // "Pass the mic" — the active speaker ends their own turn early.
  socket.on('turn:done', (p) => {
    if (!allow(`pick:${socket.id}`, 60, 10_000)) return;
    if (!p || typeof p !== 'object') return;
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby) return;
    const me = participantOf(lobby, socket.id);
    if (!me) return;
    endTurnEarly(io, lobby, me, Number(p.stepIndex));
  });

  socket.on('audio:turn', (p) => {
    // If STT were ever misconfigured in prod, every turn would vanish here
    // without a trace. Cheap insurance against a silent, total outage.
    if (!sttConfigured()) return void event('audio_rejected', { why: 'stt_not_configured' });
    if (!p || typeof p !== 'object') return;
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby) return;
    const me = participantOf(lobby, socket.id);
    if (!me) return;
    const raw = p.data as unknown;
    const buf = Buffer.isBuffer(raw) ? raw : raw instanceof ArrayBuffer ? Buffer.from(raw) : null;
    // Size rejections are the likeliest cause of a turn vanishing between the
    // browser and the judge, so they are logged rather than dropped in silence.
    if (!buf || buf.length < 1000 || buf.length > 3_000_000) {
      event('audio_rejected', {
        code: lobby.code,
        step: Number(p.stepIndex),
        bytes: buf?.length ?? 0,
        why: !buf ? 'not_binary' : buf.length < 1000 ? 'too_small' : 'too_big',
      });
      return;
    }
    acceptAudioTurn(
      io,
      lobby,
      me,
      Number(p.stepIndex),
      String(p.mime ?? '').slice(0, 80),
      buf,
      Number.isFinite(Number(p.seq)) ? Number(p.seq) : 0,
    );
  });

  socket.on('verdict:retry', () => {
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby) return;
    if (!participantOf(lobby, socket.id)) return;
    if (!lobby.debateCompleted) return;
    if (lobby.judgeState !== 'failed' && lobby.judgeState !== 'done') return;
    void runJudge(io, lobby, socket.id);
  });

  socket.on('rematch', () => {
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby || lobby.status !== 'verdict') return;
    const me = participantOf(lobby, socket.id);
    if (!me) return;
    if (me === lobby.host) lobby.rematch.host = true;
    else lobby.rematch.guest = true;
    touch(lobby);

    const bothHere =
      lobby.host && lobby.guest && !lobby.host.disconnectedAt && !lobby.guest.disconnectedAt;
    if (lobby.rematch.host && lobby.rematch.guest && bothHere) {
      resetForRematch(lobby);
      broadcastLobbyUpdate(lobby); // fresh green-room state first
      io.to(lobby.code).emit('rematch:go'); // then tell clients to leave the verdict
    } else {
      broadcastRematch(lobby);
    }
  });

  // Ask the YapMaster about the debate you just finished. Answered from the
  // in-memory verdict + transcript — no account, nothing stored.
  socket.on('coach:ask', (p) => {
    if (!allow(`coach:${socket.id}`, 12, 60_000)) return;
    if (!p || typeof p !== 'object') return;
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby || lobby.status !== 'verdict' || !lobby.verdict) return;
    const me = participantOf(lobby, socket.id);
    if (!me) return;
    const side = sideOf(lobby, me);
    if (!side) return;
    const question = String(p.question ?? '').trim().slice(0, 300);
    if (!question) return;
    const sid = socket.id;
    if (lobby.coachAsks >= 8) {
      io.to(sid).emit('coach:reply', { text: '', done: true });
      return;
    }
    lobby.coachAsks += 1;
    touch(lobby);
    event('coach_ask', { code: lobby.code });
    // Only THIS side's exchange, and only the recent stretch of it: a follow-up
    // that builds on the last answer is the point, a full replay is not.
    const history = lobby.coachLog
      .filter((m) => m.side === side)
      .slice(-8)
      .map((m) => ({ role: m.role, content: m.content }));
    lobby.coachLog.push({ side, role: 'user', content: `The debater says: ${question}` });
    void coachReply(lobby, side, question, history)
      .then((text) => {
        lobby.coachLog.push({ side, role: 'assistant', content: text });
        io.to(sid).emit('coach:reply', { text });
      })
      .catch((err) => {
        console.error(`[coach] lobby ${lobby.code} failed:`, err);
        event('coach_failed', { code: lobby.code });
        lobby.coachLog.pop(); // no answer means that question never happened
        io.to(sid).emit('coach:reply', { text: '', error: true });
      });
  });

  // Build a share link for the verdict you just received. The server signs it
  // (when SHARE_SECRET is set) so a card rendering on our domain is one the
  // judge really produced, then forgets it — the link carries the whole thing.
  socket.on('share:link', (cb) => {
    if (typeof cb !== 'function') return;
    if (!allow(`share:${socket.id}`, 20, 60_000)) return cb(null);
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby?.verdict || !participantOf(lobby, socket.id)) return cb(null);
    const card = cardFrom(lobby.topic?.en ?? '', namesOf(lobby), lobby.verdict, lobby.framing?.said);
    void saveCard(card).then((id) => {
      // No fallback: if the store is down, sharing is unavailable rather than
      // silently producing a link of a different shape.
      event('share_created', { code: lobby.code, ok: id ? 'yes' : 'no' });
      cb(id ? { url: `/v/${id}` } : null);
    });
  });

  // Ranked: enter the queue. Rating is looked up (or created at 1000) so the
  // waiting screen can show it; pairing is first-come-first-served.
  socket.on('queue:join', (p, cb) => {
    if (typeof cb !== 'function') return;
    if (!FAST && !allow(`join:${ipOf(socket)}`, 30, 5 * 60_000)) {
      return cb({ ok: false, error: 'rate_limited' });
    }
    const name = String(p?.name ?? '').trim();
    if (!NAME_RE.test(name)) return cb({ ok: false, error: 'bad_name' });
    const playerId = String(p?.playerId ?? '').slice(0, 64);
    if (!playerId) return cb({ ok: false, error: 'bad_name' });
    if (rankedQueue.some((q) => q.socketId === socket.id)) return cb({ ok: true });
    releasePreviousSeat(socket);
    dropFromQueue(socket.id);
    void getPlayer(playerId, name).then((row) => {
      // The socket may have left the queue (or died) while we read the rating.
      if (!io.sockets.sockets.get(socket.id)) return;
      rankedQueue.push({
        socketId: socket.id,
        sessionId: String(p?.sessionId ?? '').slice(0, 64),
        playerId,
        name,
        rating: row?.rating ?? 1000,
      });
      event('queue_joined', { waiting: rankedQueue.length });
      cb({ ok: true });
      tryMatch();
    });
  });

  socket.on('queue:leave', () => {
    dropFromQueue(socket.id);
    broadcastQueue();
  });

  // Watch a live lobby by code. The code IS the invitation: whoever has it was
  // given it by someone in the room. Debaters always see the watcher count.
  socket.on('spectate:join', (p, cb) => {
    if (typeof cb !== 'function') return;
    if (!FAST && !allow(`join:${ipOf(socket)}`, 30, 5 * 60_000)) {
      return cb({ ok: false, error: 'rate_limited' });
    }
    const lobby = getLobby(String(p?.code ?? '').slice(0, 8));
    if (!lobby) return cb({ ok: false, error: 'not_found' });
    if (participantOf(lobby, socket.id)) return cb({ ok: false, error: 'not_found' });
    if (spectatorCount(lobby.code) >= SPECTATOR_CAP) return cb({ ok: false, error: 'full' });
    const set = spectators.get(lobby.code) ?? new Set<string>();
    set.add(socket.id);
    spectators.set(lobby.code, set);
    void socket.join(lobby.code); // live state: phases, verdicts, aborts
    void socket.join(`spec:${lobby.code}`); // audio relays
    socket.data.code = lobby.code; // for cleanup on disconnect
    event('spectate_joined', { code: lobby.code, n: set.size });
    cb({ ok: true });
    socket.emit('spectate:state', spectateStateFor(lobby));
    broadcastWatchers(lobby.code);
  });

  socket.on('spectate:leave', () => {
    const code = socket.data.code;
    if (!code) return;
    void socket.leave(code);
    void socket.leave(`spec:${code}`);
    dropSpectator(socket.id, code);
    socket.data.code = undefined;
  });

  socket.on('bot:start', (p, cb) => {
    if (typeof cb !== 'function') return;
    if (!FAST && !allow(`create:${ipOf(socket)}`, 10, 5 * 60_000)) {
      return cb({ ok: false, error: 'rate_limited' });
    }
    const name = String(p?.name ?? '').trim();
    if (!NAME_RE.test(name)) return cb({ ok: false, error: 'bad_name' });
    const bot = BOT_BY_ID.get(String(p?.botId ?? ''));
    if (!bot) return cb({ ok: false, error: 'not_found' });
    if (lobbyCount() >= MAX_LOBBIES) return cb({ ok: false, error: 'rate_limited' });

    const topicMode = p?.topicMode === 'agree' || p?.topicMode === 'category' ? p.topicMode : 'random';
    const lang = p?.lang === 'ar' ? 'ar' : 'en';
    const pace = p?.pace === 'blitz' || p?.pace === 'long' ? p.pace : 'standard';

    // Resolve the motion.
    let topic;
    if (topicMode === 'agree') {
      topic = TOPIC_BY_ID.get(String(p?.topicId ?? ''));
      if (!topic) return cb({ ok: false, error: 'not_found' });
    } else if (topicMode === 'category') {
      const cat = TOPIC_CATEGORIES.find((c) => c.key === String(p?.categoryKey ?? ''));
      if (!cat) return cb({ ok: false, error: 'not_found' });
      topic = cat.topics[Math.floor(Math.random() * cat.topics.length)];
    } else {
      const cat = TOPIC_CATEGORIES[Math.floor(Math.random() * TOPIC_CATEGORIES.length)];
      topic = cat.topics[Math.floor(Math.random() * cat.topics.length)];
    }
    const humanSide =
      p?.side === 'FOR' || p?.side === 'AGAINST' ? p.side : Math.random() < 0.5 ? 'FOR' : 'AGAINST';
    const botSide = humanSide === 'FOR' ? 'AGAINST' : 'FOR';

    releasePreviousSeat(socket);
    const lobby = createLobby(socket.id, String(p?.sessionId ?? '').slice(0, 64), name);
    lobby.pace = pace;
    lobby.bot = { id: bot.id, name: bot.name, difficulty: bot.difficulty, side: botSide, lang };
    socket.data.code = lobby.code;
    socket.data.role = 'host';
    void socket.join(lobby.code);
    cb({ ok: true });
    startBotDebate(io, lobby, topic, humanSide);
  });

  socket.on('bot:done', (p) => {
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby || !lobby.bot || lobby.status !== 'in_debate') return;
    if (participantOf(lobby, socket.id) !== lobby.host) return;
    const idx = Number(p?.stepIndex);
    if (lobby.stepIndex === idx && scriptFor(lobby)[idx]?.speaker === lobby.bot.side) {
      if (lobby.phaseTimer) clearTimeout(lobby.phaseTimer);
      advance(io, lobby, idx);
    }
  });

  socket.on('disconnect', () => {
    dropFromQueue(socket.id);
    broadcastQueue();
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (socket.data.code) dropSpectator(socket.id, socket.data.code);
    if (!lobby) return;
    const me = participantOf(lobby, socket.id);
    if (!me) return;
    const isHost = me === lobby.host;

    if (lobby.status === 'waiting') {
      destroyLobby(lobby.code);
      io.socketsLeave(lobby.code);
      return;
    }

    if (lobby.status === 'greenroom') {
      if (isHost) {
        // Same grace the debate gets: an accidental F5 or a network blip
        // shouldn't nuke the lobby for both players instantly.
        me.disconnectedAt = Date.now();
        me.graceTimer = setTimeout(() => {
          const l = getLobby(lobby.code);
          if (!l || !me.disconnectedAt) return;
          io.to(l.code).emit('lobby:closed', { reason: 'closedHostLeft' });
          destroyLobby(l.code);
          io.socketsLeave(l.code);
        }, GRACE_MS);
      } else {
        lobby.guest = undefined;
        lobby.status = 'waiting';
        // clear the departed guest's picks and all confirmations
        lobby.pick.guestTopicId = null;
        lobby.pick.guestSide = null;
        lobby.pick.hostConfirmed = false;
        lobby.pick.guestConfirmed = false;
        if (lobby.host) lobby.host.rtcReady = false;
        touch(lobby);
        broadcastLobbyUpdate(lobby);
      }
      return;
    }

    if (lobby.status === 'in_debate') {
      me.disconnectedAt = Date.now();
      const peer = peerOf(lobby, socket.id);
      if (peer && !peer.disconnectedAt) {
        io.to(peer.socketId).emit('peer:connection', {
          state: 'lost',
          graceDeadline: Date.now() + GRACE_MS,
        });
      }
      me.graceTimer = setTimeout(() => {
        // Still disconnected after the grace window → the debate can't continue.
        if (me.disconnectedAt && lobby.status === 'in_debate') {
          abort(io, lobby, 'abortWifi', { x: me.name });
        }
      }, GRACE_MS);
      return;
    }

    // judging / verdict / aborted: mark disconnected, never abort a finished debate.
    me.disconnectedAt = Date.now();
    if (lobby.host?.disconnectedAt && lobby.guest?.disconnectedAt) {
      // Both gone — let the verdict linger briefly for resumes, then clean up.
      setTimeout(() => {
        const l = getLobby(lobby.code);
        if (l && l.host?.disconnectedAt && l.guest?.disconnectedAt) {
          destroyLobby(l.code);
          io.socketsLeave(l.code);
        }
      }, 60_000).unref();
    } else if (lobby.status === 'verdict') {
      // One left on the verdict screen — tell the other so a pending rematch
      // request resolves to "other player left" instead of hanging.
      broadcastRematch(lobby);
    }
  });
});

startSweep((code) => {
  // Tell any still-connected clients their lobby expired (room emits work
  // even after the lobby record is gone — the sockets are still joined).
  io.to(code).emit('lobby:closed', { reason: 'closedExpired' });
  io.socketsLeave(code);
  io.socketsLeave(`spec:${code}`);
  spectators.delete(code);
  console.log(`[sweep] destroyed stale lobby ${code}`);
});

// Spectators join mid-lifecycle, but debate:start goes to participant sockets,
// not rooms — so when a debate actually begins, everyone watching gets a fresh
// snapshot with the topic, names and first clock.
setOnDebateStarted((lobby) => {
  if (spectatorCount(lobby.code) === 0) return;
  io.to(`spec:${lobby.code}`).emit('spectate:state', spectateStateFor(lobby));
});

// Lobbies live in memory, so a deploy ends every debate in progress. That is
// acceptable; doing it silently is not. Railway sends SIGTERM before the kill,
// which is enough time to tell everyone why their debate just stopped instead
// of leaving them staring at a frozen clock.
let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  const live = allLobbies().filter((l) => l.status === 'in_debate' || l.status === 'greenroom');
  // console.log directly as well as event(): the ring buffer dies with this
  // process, so Railway's log stream is the only durable record that the
  // handler ran at all.
  console.log(`[shutdown] ${signal} received, notifying ${live.length} live lobbies`);
  event('shutdown', { signal, liveLobbies: live.length });
  for (const lobby of live) {
    // Not abort(): that keeps the lobby around for a re-fetch that this process
    // will not be alive to serve. Say it plainly and let the client reset.
    io.to(lobby.code).emit('debate:aborted', { reason: 'serverRestart' });
  }
  // Durable proof this handler ran, readable after the restart.
  await recordShutdown(signal, live.length);
  // Let Socket.IO actually put those frames on the wire. Nothing is waiting on
  // us for this long, and a dropped goodbye is the whole bug.
  await new Promise((r) => setTimeout(r, 700));
  try {
    await app.close();
  } catch {
    // closing is best-effort; we're leaving either way
  }
  console.log('[shutdown] done');
  process.exit(0);
}
// Never let a slow close hold the container open past the platform's patience.
function arm(signal: NodeJS.Signals): void {
  process.on(signal, () => {
    setTimeout(() => process.exit(0), 4000).unref();
    void shutdown(signal);
  });
}
arm('SIGTERM');
arm('SIGINT');

await app.listen({ port: PORT, host: '0.0.0.0' });
console.log(`[server] YapStage listening on :${PORT}`);
