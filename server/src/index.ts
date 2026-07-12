import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
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
  startSweep,
  touch,
  type Lobby,
  type Participant,
} from './lobby.js';
import { abort, acceptChunk, resendState, startDebate, type Io } from './debate.js';
import { runJudge } from './judge.js';
import { ALL_TOPICS, TOPIC_CATEGORIES } from './topics.js';

// Deployed on Railway via Dockerfile (see railway.json). Fastify serves the
// built client from client/dist and hosts the Socket.IO signaling server.
// NB: Railway's watch path is /server/** — client-only changes need a server
// file touched (like this comment) to trigger a deploy. touch: mic-meters+history+sound
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../.env') });

const PORT = Number(process.env.PORT) || 3000;
const GRACE_MS = 15_000;

await refreshIceServers();
setInterval(() => void refreshIceServers(), REFRESH_MS).unref();

const app = Fastify({ logger: false });

const clientDist = path.resolve(here, '../../client/dist');
if (fs.existsSync(clientDist)) {
  await app.register(fastifyStatic, { root: clientDist });
} else {
  console.warn(`[server] client build not found at ${clientDist} — API/socket only`);
}

app.get('/healthz', async () => ({ ok: true, lobbies: lobbyCount(), turn: turnMode() }));

await app.ready();

const io: Io = new Server<ClientToServer, ServerToClient, Record<string, never>, SocketData>(
  app.server,
  { serveClient: false },
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
    pick: {
      yourTopic: isHost ? pick.hostTopic : pick.guestTopic,
      peerTopic: isHost ? pick.guestTopic : pick.hostTopic,
      yourSide: isHost ? pick.hostSide : pick.guestSide,
      peerSide: isHost ? pick.guestSide : pick.hostSide,
      youConfirmed: isHost ? pick.hostConfirmed : pick.guestConfirmed,
      peerConfirmed: isHost ? pick.guestConfirmed : pick.hostConfirmed,
    },
    iceServers: getIceServers(),
  };
}

function broadcastLobbyUpdate(lobby: Lobby): void {
  for (const p of [lobby.host, lobby.guest]) {
    if (p && !p.disconnectedAt) io.to(p.socketId).emit('lobby:update', updateFor(lobby, p));
  }
}

io.on('connection', (socket) => {
  socket.on('lobby:create', (p, cb) => {
    if (typeof cb !== 'function') return;
    const name = String(p?.name ?? '').trim();
    if (!NAME_RE.test(name)) return cb({ ok: false, error: 'bad_name' });
    const lobby = createLobby(socket.id, String(p.sessionId ?? ''), name);
    socket.data.code = lobby.code;
    socket.data.role = 'host';
    void socket.join(lobby.code);
    cb({ ok: true, update: updateFor(lobby, lobby.host!) });
  });

  socket.on('lobby:join', (p, cb) => {
    if (typeof cb !== 'function') return;
    const name = String(p?.name ?? '').trim();
    if (!NAME_RE.test(name)) return cb({ ok: false, error: 'bad_name' });
    const lobby = getLobby(String(p.code ?? ''));
    if (!lobby) return cb({ ok: false, error: 'not_found' });
    if (lobby.status !== 'waiting') {
      return cb({ ok: false, error: lobby.guest ? 'full' : 'in_progress' });
    }
    if (lobby.guest) return cb({ ok: false, error: 'full' });

    lobby.guest = {
      socketId: socket.id,
      sessionId: String(p.sessionId ?? ''),
      name,
      rtcReady: false,
    };
    lobby.status = 'greenroom';
    touch(lobby);
    socket.data.code = lobby.code;
    socket.data.role = 'guest';
    void socket.join(lobby.code);
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

  socket.on('pick:topic', (topic) => {
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby || lobby.status !== 'greenroom') return;
    const me = participantOf(lobby, socket.id);
    if (!me) return;
    const t = String(topic ?? '');
    if (!ALL_TOPICS.has(t)) return;
    if (me === lobby.host) lobby.pick.hostTopic = t;
    else lobby.pick.guestTopic = t;
    // any change requires both players to re-confirm
    lobby.pick.hostConfirmed = false;
    lobby.pick.guestConfirmed = false;
    touch(lobby);
    broadcastLobbyUpdate(lobby);
  });

  socket.on('pick:side', (side) => {
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby || lobby.status !== 'greenroom') return;
    const me = participantOf(lobby, socket.id);
    if (!me) return;
    if (side !== 'FOR' && side !== 'AGAINST') return;
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
    const agreed =
      pick.hostTopic !== null &&
      pick.hostTopic === pick.guestTopic &&
      pick.hostSide !== null &&
      pick.guestSide !== null &&
      pick.hostSide !== pick.guestSide;
    if (!agreed) return;
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
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby) return;
    const peer = peerOf(lobby, socket.id);
    if (peer && !peer.disconnectedAt) io.to(peer.socketId).emit('rtc:signal', payload);
  });

  socket.on('speech:chunk', (chunk) => {
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby) return;
    const me = participantOf(lobby, socket.id);
    if (!me) return;
    acceptChunk(lobby, me, chunk);
  });

  socket.on('verdict:retry', () => {
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby) return;
    if (!participantOf(lobby, socket.id)) return;
    if (!lobby.debateCompleted) return;
    if (lobby.judgeState !== 'failed' && lobby.judgeState !== 'done') return;
    void runJudge(io, lobby, socket.id);
  });

  socket.on('disconnect', () => {
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby) return;
    const me = participantOf(lobby, socket.id);
    if (!me) return;
    const isHost = me === lobby.host;

    if (lobby.status === 'waiting') {
      destroyLobby(lobby.code);
      return;
    }

    if (lobby.status === 'greenroom') {
      if (isHost) {
        io.to(lobby.code).emit('lobby:closed', { reason: 'the host left. rude. make your own lobby.' });
        destroyLobby(lobby.code);
      } else {
        lobby.guest = undefined;
        lobby.status = 'waiting';
        // clear the departed guest's picks and all confirmations
        lobby.pick.guestTopic = null;
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
          abort(io, lobby, `${me.name}'s wifi tapped out. debate cancelled.`);
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
        if (l && l.host?.disconnectedAt && l.guest?.disconnectedAt) destroyLobby(l.code);
      }, 60_000).unref();
    }
  });
});

startSweep((code) => {
  // Tell any still-connected clients their lobby expired (room emits work
  // even after the lobby record is gone — the sockets are still joined).
  io.to(code).emit('lobby:closed', { reason: 'this lobby expired. thirty minutes of silence will do that.' });
  console.log(`[sweep] destroyed stale lobby ${code}`);
});

await app.listen({ port: PORT, host: '0.0.0.0' });
console.log(`[server] YapStage listening on :${PORT}`);
