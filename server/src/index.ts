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
  type IceServer,
  type LobbyUpdate,
  type ServerToClient,
  type SocketData,
} from './protocol.js';
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

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../.env') });

const PORT = Number(process.env.PORT) || 3000;
const GRACE_MS = 15_000;

function buildIceServers(): IceServer[] {
  const servers: IceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
  const urls = (process.env.TURN_URLS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (urls.length > 0 && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    servers.push({
      urls,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }
  return servers;
}

const ICE_SERVERS = buildIceServers();

const app = Fastify({ logger: false });

const clientDist = path.resolve(here, '../../client/dist');
if (fs.existsSync(clientDist)) {
  await app.register(fastifyStatic, { root: clientDist });
} else {
  console.warn(`[server] client build not found at ${clientDist} — API/socket only`);
}

app.get('/healthz', async () => ({ ok: true, lobbies: lobbyCount() }));

await app.ready();

const io: Io = new Server<ClientToServer, ServerToClient, Record<string, never>, SocketData>(
  app.server,
  { serveClient: false },
);

function updateFor(lobby: Lobby, receiver: Participant): LobbyUpdate {
  const isHost = receiver === lobby.host;
  const peer = isHost ? lobby.guest : lobby.host;
  return {
    code: lobby.code,
    role: isHost ? 'host' : 'guest',
    yourName: receiver.name,
    peerName: peer?.name,
    participantCount: lobby.host && lobby.guest ? 2 : 1,
    locked: Boolean(lobby.host && lobby.guest),
    youReady: receiver.ready,
    peerReady: peer?.ready ?? false,
    iceServers: ICE_SERVERS,
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
      ready: false,
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
    if (!lobby) return cb({ ok: false });
    const sessionId = String(p.sessionId ?? '');
    const slot =
      lobby.host?.sessionId === sessionId && lobby.host.disconnectedAt
        ? lobby.host
        : lobby.guest?.sessionId === sessionId && lobby.guest.disconnectedAt
          ? lobby.guest
          : undefined;
    if (!slot || !sessionId) return cb({ ok: false });

    if (slot.graceTimer) clearTimeout(slot.graceTimer);
    slot.graceTimer = undefined;
    slot.disconnectedAt = undefined;
    slot.socketId = socket.id;
    socket.data.code = lobby.code;
    socket.data.role = slot === lobby.host ? 'host' : 'guest';
    void socket.join(lobby.code);
    touch(lobby);
    cb({ ok: true });

    resendState(io, lobby, socket.id);
    const peer = peerOf(lobby, socket.id);
    if (peer && !peer.disconnectedAt) {
      io.to(peer.socketId).emit('peer:connection', { state: 'restored' });
    }
  });

  socket.on('greenroom:ready', () => {
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby || lobby.status !== 'greenroom') return;
    const me = participantOf(lobby, socket.id);
    if (!me) return;
    me.ready = true;
    touch(lobby);
    broadcastLobbyUpdate(lobby);
    if (lobby.host?.ready && lobby.guest?.ready) startDebate(io, lobby);
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
    void runJudge(io, lobby);
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
        io.to(lobby.code).emit('lobby:closed', { reason: 'The host left the lobby.' });
        destroyLobby(lobby.code);
      } else {
        lobby.guest = undefined;
        lobby.status = 'waiting';
        if (lobby.host) {
          lobby.host.ready = false;
          lobby.host.rtcReady = false;
        }
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
          abort(io, lobby, `${me.name}'s connection was lost — debate cancelled.`);
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

startSweep((code) => console.log(`[sweep] destroyed stale lobby ${code}`));

await app.listen({ port: PORT, host: '0.0.0.0' });
console.log(`[server] YapStage listening on :${PORT}`);
