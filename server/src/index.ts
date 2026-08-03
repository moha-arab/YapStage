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
  startBotDebate,
  startDebate,
  type Io,
} from './debate.js';
import { BOT_BY_ID, publicBots } from './bots.js';
import { sttConfigured } from './stt.js';
import { runJudge, scoreTranscript } from './judge.js';
import { coachReply } from './coach.js';
import { TOPIC_BY_ID, TOPIC_CATEGORIES } from './topics.js';
import { event, statsSnapshot } from './stats.js';
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

// Exactly one proxy hop (Railway's edge) — trusting the whole XFF chain would
// let clients spoof their own rate-limit identity.
const app = Fastify({ logger: false, trustProxy: 1 });

const clientDist = path.resolve(here, '../../client/dist');
if (fs.existsSync(clientDist)) {
  await app.register(fastifyStatic, { root: clientDist });
} else {
  console.warn(`[server] client build not found at ${clientDist} — API/socket only`);
}

app.get('/healthz', async () => ({
  ok: true,
  lobbies: lobbyCount(),
  turn: turnMode(),
  stt: sttConfigured() ? 'cloudflare' : 'browser',
  tts: process.env.ELEVENLABS_API_KEY ? 'elevenlabs' : 'browser',
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
    },
    iceServers: getIceServers(),
    sttAvailable: sttConfigured(),
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
    if (!lobby || lobby.status !== 'greenroom') return;
    if (participantOf(lobby, socket.id) !== lobby.host) return; // host-only
    if (mode !== 'agree' && mode !== 'category' && mode !== 'random') return;
    if (lobby.topicMode === mode) return;
    lobby.topicMode = mode;
    lobby.categoryKey = null; // a mode switch clears the pending category
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
          : true; // random: nothing to pick
    if (!ready) return;
    if (me === lobby.host) pick.hostConfirmed = true;
    else pick.guestConfirmed = true;
    touch(lobby);
    broadcastLobbyUpdate(lobby);
    if (pick.hostConfirmed && pick.guestConfirmed) startDebate(io, lobby);
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
    if (!sttConfigured()) return;
    if (!p || typeof p !== 'object') return;
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby) return;
    const me = participantOf(lobby, socket.id);
    if (!me) return;
    const raw = p.data as unknown;
    const buf = Buffer.isBuffer(raw) ? raw : raw instanceof ArrayBuffer ? Buffer.from(raw) : null;
    if (!buf || buf.length < 1000 || buf.length > 3_000_000) return;
    acceptAudioTurn(lobby, me, Number(p.stepIndex), String(p.mime ?? '').slice(0, 80), buf);
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
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
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
  console.log(`[sweep] destroyed stale lobby ${code}`);
});

await app.listen({ port: PORT, host: '0.0.0.0' });
console.log(`[server] YapStage listening on :${PORT}`);
