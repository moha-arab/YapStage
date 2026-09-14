import './env.js'; // MUST be first: populates process.env before any module that reads it at load time
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { Server } from 'socket.io';
import {
  AVATAR_IDS,
  GUEST_AVATAR,
  GUEST_NAME_RE,
  NAME_RE,
  PACES,
  foldName,
  type AvatarId,
  type ClientToServer,
  type LiveList,
  type LiveMatch,
  type LobbyUpdate,
  type Pace,
  type ServerToClient,
  type SocketData,
  type TopicText,
} from './protocol.js';
import { REFRESH_MS, getIceServers, refreshIceServers, relayAvailable, turnMode } from './turn.js';
import {
  createLobby,
  destroyLobby,
  getLobby,
  allLobbies,
  liveSeatOf,
  lobbyCount,
  participantOf,
  peerOf,
  randomAvatar,
  reopenForNextGuest,
  setOnLobbyDestroyed,
  sideOf,
  startSweep,
  touch,
  waitingRoomsFrom,
  type Lobby,
  type Participant,
} from './lobby.js';
import {
  abort,
  acceptAudioTurn,
  acceptChunk,
  advance,
  endTurnEarly,
  MAX_SEGMENT_BYTES,
  resendState,
  scriptFor,
  setOnDebateStarted,
  startBotDebate,
  startDebate,
  startDispute,
  type Io,
} from './debate.js';
import { BOT_BY_ID, placementBot, publicBots } from './bots.js';
import { sttConfigured } from './stt.js';
import { applyForfeit, namesOf, runJudge, scoreDrill, scoreTranscript } from './judge.js';
import { DRILL_SECONDS, PROMPT as DRILL_PROMPT, TIER_META, drillById, drillOfDay, today } from './drills.js';
import { coachOnRecord, coachReply } from './coach.js';
import { cardFrom, renderCard } from './share.js';
import { DISPUTE_MAX } from './dispute.js';
import {
  acceptFriend,
  campaignLocksOn,
  drillState,
  getCampaign,
  getLocker,
  getPlayer,
  getRating,
  initStore,
  lastShutdown,
  leaderboard,
  listFriends,
  listMatches,
  loadCard,
  loadCheatFlags,
  loadMatch,
  loadReports,
  playerIdOwned,
  pruneRetention,
  recentRanked,
  recordDrill,
  recordShutdown,
  removeFriend,
  requestFriend,
  saveCard,
  saveReport,
  SEED_RATING,
  storeReady,
  subForUsername,
} from './store.js';
import { TOPIC_BY_ID, TOPIC_CATEGORIES } from './topics.js';
import { errTag, event, recentEvents, statsSnapshot } from './stats.js';
import { allow } from './ratelimit.js';
import { googleConfigured, readSession, readSessionCookie, registerAuth } from './auth.js';
import { rankedRefusal } from './gate.js';
import {
  SECURITY_HEADERS,
  SITE_ORIGIN,
  cleanBlock,
  cleanLine,
  coachHistory,
  guestIdShapeOk,
  relayOnlySignal,
  statsKeyOk,
  trustOneHop,
  typedSpeechAllowed,
  wantsHtml404,
} from './security.js';
import { llmDown, llmUsage } from './llm.js';

// Deployed on Railway via Dockerfile (see railway.json). Fastify serves the
// built client from client/dist and hosts the Socket.IO signaling server.
// (.env is loaded by ./env.js, imported first above.)
const here = path.dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 3000;
const GRACE_MS = 15_000;
const MAX_LOBBIES = 500;

// Tutorial motions: deliberately light and universally arguable — the student
// is learning the FORMAT, so the topic must never be the hard part.
const TUTORIAL_TOPICS: TopicText[] = [
  { id: 'tut1', en: 'Pineapple belongs on pizza', ar: 'الأناناس مكانه على البيتزا' },
  { id: 'tut2', en: 'Cats are better than dogs', ar: 'القطط أفضل من الكلاب' },
  { id: 'tut3', en: 'Breakfast is the most important meal of the day', ar: 'الفطور هو أهم وجبة في اليوم' },
  { id: 'tut4', en: 'Summer is better than winter', ar: 'الصيف أفضل من الشتاء' },
];
// Fast mode is test-only (never set in production). The smoke test creates many
// lobbies from one IP, so the create/join limiter is off in fast mode.
const FAST = process.env.DEBATE_SPEED === 'fast';

// Backstop: one malformed packet must never take down every live debate.
// All lobby state is in-memory, so a crash is a mass abort.
process.on('uncaughtException', (err) => console.error('[fatal]', err));
process.on('unhandledRejection', (err) => console.error('[fatal-rejection]', err));

await refreshIceServers();
setInterval(() => void refreshIceServers(), REFRESH_MS).unref();

// Optional: without a database the app still runs and simply writes nothing.
await initStore();

// Retention: reports (with the reported debate's transcript) go after 90
// days, anti-cheat flags after 180. Match history is kept for as long as the
// account. Once at boot, then daily.
void pruneRetention();
setInterval(() => void pruneRetention(), 24 * 60 * 60 * 1000).unref();

// Exactly one proxy hop (Railway's edge) — trusting the whole XFF chain would
// let clients spoof their own rate-limit identity. A function, not the number
// 1: fastify 5.12 no longer accepts a numeric trustProxy (the type check
// fails, and at runtime it was ignored, so req.ip became Railway's edge and
// req.protocol http). `hop < 1` trusts exactly the nearest proxy, which is
// what `1` used to mean.
// maxParamLength defaults to 100, which silently 404s every share card: the
// whole verdict is encoded into the /v/:token param and runs ~500 chars in
// English, ~700 in Arabic.
const app = Fastify({ logger: false, trustProxy: trustOneHop, routerOptions: { maxParamLength: 4200 } });

// Security headers on every response Fastify sends (pages, API, static
// files, 404s). security.ts has the CSP and why each source is in it.
app.addHook('onSend', async (_req, reply, payload) => {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) reply.header(k, v);
  return payload;
});

// A 5xx says nothing about why: the reason goes to the log as a fixed tag
// (never a message that could carry model output), the client gets a code.
app.setErrorHandler((err, req, reply) => {
  const e = (err ?? {}) as { statusCode?: unknown; code?: unknown };
  const status = typeof e.statusCode === 'number' && e.statusCode >= 400 ? e.statusCode : 500;
  if (status >= 500) {
    console.error(`[http] ${req.method} ${req.routeOptions?.url ?? '?'} failed: ${errTag(err)}`);
    return reply.code(status).send({ error: 'server_error' });
  }
  const code = typeof e.code === 'string' && /^[A-Z_]{1,60}$/.test(e.code) ? e.code : 'bad_request';
  return reply.code(status).send({ error: code });
});

const clientDist = path.resolve(here, '../../client/dist');
if (fs.existsSync(clientDist)) {
  await app.register(fastifyStatic, {
    root: clientDist,
    // send() writes its own `public, max-age=0` AFTER setHeaders runs, and it
    // would win, so it is switched off and every file gets its policy here.
    cacheControl: false,
    setHeaders(res, filePath) {
      // Vite fingerprints everything under assets/: a changed file gets a new
      // name, so an old name can be cached for good. Everything else keeps its
      // name across deploys (index.html, sw.js, the manifest, icons, og.png),
      // so it revalidates on every load (ETag, a 304 when unchanged) and a
      // deploy reaches phones at once.
      res.setHeader(
        'Cache-Control',
        filePath.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
    },
  });
  // The legal pages are client routes. A full page load of either has to
  // boot the app, so both answer with index.html (no-cache, like every
  // unhashed file above).
  for (const page of ['/privacy', '/terms']) {
    app.get(page, async (_req, reply) => reply.header('Cache-Control', 'no-cache').sendFile('index.html'));
    // With a trailing slash (a pasted link, a crawler) the router saw a
    // different path and answered with the 404 page. One page, one address:
    // send it to the plain one.
    app.get(`${page}/`, async (_req, reply) => reply.redirect(page, 301));
  }
} else {
  console.warn(`[server] client build not found at ${clientDist} — API/socket only`);
}

// Anything else nobody has: a person with a browser gets the 404 page
// (client/public/404.html, self-contained), everything else a JSON 404.
// HEAD is answered like GET (security.ts wantsHtml404): same status and
// type, and Node sends no body for a HEAD.
const notFoundPage = path.join(clientDist, '404.html');
app.setNotFoundHandler((req, reply) => {
  if (wantsHtml404(req.method, req.headers.accept) && fs.existsSync(notFoundPage)) {
    return reply
      .code(404)
      .type('text/html; charset=utf-8')
      .header('Cache-Control', 'no-cache')
      .send(fs.createReadStream(notFoundPage));
  }
  return reply.code(404).send({ error: 'Not Found' });
});

// Shareable verdict card. The card is a stored row and the path carries only
// its opaque id (store.ts saveCard, share.ts): the sharer's own best line and
// the numbers, never the opponent's words. Registered as a route, so /v/...
// never looks for a file.
app.get<{ Params: { token: string } }>('/v/:token', async (req, reply) => {
  const id = String(req.params.token ?? '');
  const card = await loadCard(id);
  if (!card) {
    return reply.code(404).type('text/html').send(
      `<!doctype html><meta charset="utf-8"><meta name="robots" content="noindex"><title>YapStage</title>` +
        `<body style="background:#16172B;color:#EFE8D8;font-family:system-ui;text-align:center;padding:60px">` +
        `<p>that link is not a verdict.</p><p><a style="color:#EFE8D8" href="/">go to YapStage</a></p>`,
    );
  }
  event('share_view');
  // The public origin is a constant: a card's links and og:image must never
  // follow a Host header somebody else chose.
  return reply.type('text/html').send(renderCard(card, SITE_ORIGIN, id));
});

app.get('/healthz', async () => ({
  ok: true,
  lobbies: lobbyCount(),
  turn: turnMode(),
  stt: sttConfigured() ? 'cloudflare' : 'browser',
  tts: process.env.ELEVENLABS_API_KEY ? 'elevenlabs' : 'browser',
  share: storeReady() ? 'stored' : 'in-link',
  auth: googleConfigured() ? (storeReady() ? 'google' : 'google-no-store') : 'off',
  // 'down' while the model breaker is open (llm.ts): new rated, bot and
  // placement starts are refused with 'judge_down' until it recovers.
  judge: llmDown() ? 'down' : 'ok',
  commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
}));

registerAuth(app, {
  // A deleted account's open tabs and devices lose their seats and presence
  // now, not at their next reload. Runs at request time, long after `io`
  // below exists. Its player id comes off every live seat first, so a
  // debate that finishes after the deletion cannot file a match, move a
  // rating or advance a campaign back into existence under it.
  onAccountDeleted: (sub, playerId) => {
    for (const l of allLobbies()) {
      for (const seat of [l.host, l.guest]) {
        if (seat?.playerId === playerId) seat.playerId = undefined;
      }
      if (l.campaign?.playerId === playerId) l.campaign = undefined;
      if (l.placement?.playerId === playerId) l.placement = undefined;
      if (l.ranked) {
        if (l.ranked.host === playerId) l.ranked.host = '';
        if (l.ranked.guest === playerId) l.ranked.guest = '';
      }
    }
    for (let i = rankedQueue.length - 1; i >= 0; i--) {
      if (rankedQueue[i].playerId === playerId) rankedQueue.splice(i, 1);
    }
    io.in(`acct:${sub}`).disconnectSockets(true);
  },
});

app.get('/bots', async () => ({ bots: publicBots(), topics: TOPIC_CATEGORIES }));

// ---- the browse list ----
// Only RANKED debates are ever listed. Ranked is public by consent (the
// queue says so before you join); a friend's room is private by code, so it
// is reachable through spectate:join and nothing else. A debate is listed
// only while the crowd has a seat left, so nothing the lobby advertises can
// then be refused by spectate:join.
function watchableLobbies(): Lobby[] {
  return allLobbies().filter(
    (l) => Boolean(l.ranked) && l.status === 'in_debate' && spectatorCount(l.code) < SPECTATOR_CAP,
  );
}

// Ranked rolls a category and then a topic, and keeps categoryKey null (that
// field is the host's pick in custom category mode). The category of a live
// ranked bout is read back from the topic id instead.
function categoryOf(lobby: Lobby): string | null {
  const id = lobby.topic?.id;
  if (!id) return null;
  return TOPIC_CATEGORIES.find((c) => c.topics.some((t) => t.id === id))?.key ?? null;
}

// A category the deck does not have is ignored, not refused: an old client,
// or a chip from a deck that has since been rebuilt, still gets a match.
function categoryFilter(raw: unknown): string | null {
  const key = String(raw ?? '');
  return TOPIC_CATEGORIES.some((c) => c.key === key) ? key : null;
}

function liveMatchOf(lobby: Lobby): LiveMatch {
  const sides = lobby.sides!;
  return {
    code: lobby.code,
    topic: lobby.topic!,
    category: categoryOf(lobby),
    names: namesOf(lobby),
    avatars: {
      ...(lobby.host && sides.host ? { [sides.host]: lobby.host.avatarId } : {}),
      ...(lobby.guest && sides.guest ? { [sides.guest]: lobby.guest.avatarId } : {}),
    },
    phase: lobby.lastPhase?.phase ?? null,
    stepIndex: lobby.lastPhase?.stepIndex ?? -1,
    watchers: spectatorCount(lobby.code),
    startedAt: lobby.turnStarts.get(0) ?? null,
  };
}

// One random LIVE ranked debate (feed v1, the "tiktok" spectate). It ran with
// no filters for a month, his call then; on 2026-09-12 he asked to browse by
// category, so `category` narrows it and an unknown one is ignored. `not`
// skips the debate you are already watching so "next" never hands you the
// same one back.
app.get<{ Querystring: { not?: string; category?: string } }>('/spectate/random', async (req) => {
  const skip = String(req.query.not ?? '').toUpperCase();
  const cat = categoryFilter(req.query.category);
  const live = watchableLobbies().filter(
    (l) => l.code !== skip && (cat === null || categoryOf(l) === cat),
  );
  if (live.length === 0) return { code: null };
  return { code: live[Math.floor(Math.random() * live.length)].code };
});

// What the lobby's watch mode shows: how many ranked debates are on, how
// many still have a seat in the crowd, and the browsable list of those. Not
// lobbyCount(), which counts green rooms, bot bouts and stale waiting rooms
// and would triple the number for free. Everything here is already public
// to any spectator (spectateStateFor sends the same fields the moment you
// join); no player ids, no transcript.
app.get('/live', async (): Promise<LiveList> => {
  const ranked = allLobbies().filter((l) => Boolean(l.ranked) && l.status === 'in_debate');
  const open = watchableLobbies().filter((l) => l.sides && l.topic);
  // Freshest first: the one that just began is the one worth walking into,
  // and a bout still in its reveal countdown (no startedAt yet) is freshest
  // of all.
  const fresh = (m: LiveMatch) => m.startedAt ?? Number.MAX_SAFE_INTEGER;
  const matches = open.map(liveMatchOf).sort((a, b) => fresh(b) - fresh(a));
  // One featured bout, so the stage can put two real faces on it instead of
  // a placeholder.
  const f = matches[0];
  return {
    live: ranked.length,
    watchable: open.length,
    featured: f
      ? { code: f.code, names: f.names, avatars: f.avatars, phase: f.phase, watchers: f.watchers }
      : null,
    matches,
    categories: TOPIC_CATEGORIES.map((c) => ({ key: c.key, label: c.label })),
    serverNow: Date.now(),
  };
});

/** Every keyed route (/stats*, /admin/*) asks this. The key travels in the
    `x-stats-key` header ONLY (security.ts statsKeyOk: digest compare, ten
    wrong guesses per IP per fifteen minutes); the old ?key= query parameter
    is no longer read. With STATS_KEY unset, none of these routes exist. */
const keyed = (req: { headers: Record<string, unknown>; ip: string }): boolean =>
  statsKeyOk(req.headers['x-stats-key'], req.ip);

// ---- match history (signed-in players only) ----
// Every route here scopes to the caller's own player id from the session, so
// a guessed match id can never open somebody else's debate.

// The home page's proof of life. Public on purpose: a ranked result (who won,
// on what motion) is already visible to spectators, and a landing page that
// shows real finished debates beats one that describes them. Transcripts and
// player ids stay out of it.
app.get('/feed', async () => ({
  recent: await recentRanked(6),
  top: await leaderboard(8),
}));

/** Your own ladder row, so the app can show your rating next to a bot's. Read
    only: a page load must never create or rename a player. */
app.get<{ Querystring: { playerId?: string } }>('/rating', async (req) => {
  const id = String(req.query.playerId ?? '').slice(0, 64);
  if (!id) return { rating: null };
  // No row yet is not "no rating": it is a player at the seed with nothing
  // played, who still has the placement match ahead of them. That is only
  // knowable while the store is up: down, `placed` is null and the client
  // shows the queue rather than sending everyone to the placement bot for a
  // game that could not be recorded.
  const row = await getRating(id);
  const placed: boolean | null = row ? row.placed : storeReady() ? false : null;
  const standing = (pace: Pace) => {
    const r = row?.[pace] ?? { rating: SEED_RATING, wins: 0, losses: 0 };
    return {
      rating: r.rating,
      wins: r.wins,
      losses: r.losses,
      games: r.wins + r.losses,
      // Unplaced, the number exists (the seed) but is not shown: it says
      // nothing about the player yet. Both fields predate one-match placement
      // and are kept in the shape older clients read.
      provisional: placed !== true,
      placementsLeft: placed === true ? 0 : 1,
    };
  };
  // Ranked is standard only, so the top-level fields ARE the ladder. `paces`
  // still carries all three for clients built before the change; the other
  // two never move now. `placementBot` is who the placement match is against,
  // so the lobby can name them.
  const paces = Object.fromEntries(PACES.map((p) => [p, standing(p)])) as Record<
    Pace,
    ReturnType<typeof standing>
  >;
  return { ...paces.standard, paces, placed, placementBot: placementBot().name };
});

// ---- the daily rebuttal challenge ----
// Same drill for everyone, every day, derived from the date so there is nothing
// to store or schedule. Playable signed out (the point is that a stranger can
// try the product in forty seconds). The streak used to need an account ("a
// promise you keep to a name"); since 2026-09-12 a guest keeps one on the
// device (client/src/guest.ts, from the `day` and `daily` fields the POST
// answers with) and it rides the claim into the account at sign-in. The
// server still only counts a streak it can put a name to.
// One drill a day and no other on offer (the `?type=` picker went with the
// other drill types, 2026-09-12): the tier climbs Sunday to Saturday, and the
// only way to get Saturday's is to come back on Saturday.
app.get('/drill', async (req) => {
  const day = today();
  const d = drillOfDay(day);
  const s = readSession(req);
  const state = s ? await drillState(s.sub, day) : { streak: 0, best: 0, doneToday: false };
  return {
    day,
    drill: { id: d.id, tier: d.tier, prompt: DRILL_PROMPT, material: d.material },
    tier: d.tier,
    tierName: TIER_META[d.tier].name,
    seconds: DRILL_SECONDS,
    ...state,
    signedIn: Boolean(s),
    // The drill records audio and the server transcribes it, the way a match
    // does, so it works in every browser. The browser's own recognizer
    // (Chrome only) is the fallback for when this is false.
    stt: sttConfigured(),
  };
});

/** A thirty second answer is ~120 KB of opus at 32 kbps, and up to about
    half a megabyte of AAC from Safari, which ignores the bitrate. */
const DRILL_AUDIO_MAX = 1_200_000;

app.post<{ Body: { text?: string; id?: string; audio?: string; mime?: string } }>(
  '/drill',
  // Room for the recorded answer as base64 (4/3 of DRILL_AUDIO_MAX).
  { bodyLimit: 1_700_000 },
  async (req, reply) => {
    // Per person (the account, or the address for a guest), under a wider
    // per-address ceiling so one campus NAT is not one person.
    const drillWho = readSession(req)?.sub ?? req.ip;
    if (!allow(`drill:${drillWho}`, 20, 10 * 60_000) || !allow(`drillip:${req.ip}`, 100, 10 * 60_000)) {
      return reply.code(429).send({ error: 'rate_limited' });
    }
    let answer = String(req.body?.text ?? '').trim().slice(0, 4000);
    const day = today();
    const daily = drillOfDay(day);
    // Score the drill the player actually saw (a tab left open across
    // midnight still holds yesterday's); only the day's own drill touches the
    // streak.
    const d = drillById(req.body?.id) ?? daily;
    const countsForStreak = d.id === daily.id;
    // A recorded answer: transcribed by the same Whisper call a match turn
    // goes through, silence and hallucination filter included (stt.ts), then
    // scored like typed-in text. "Nothing said" and "could not transcribe"
    // are different answers to the player, so they are told apart here.
    const audio = typeof req.body?.audio === 'string' ? req.body.audio : '';
    if (audio) {
      const buf = Buffer.from(audio, 'base64');
      if (buf.length > DRILL_AUDIO_MAX) return reply.code(413).send({ error: 'too_big' });
      const { transcribeDetailed } = await import('./stt.js');
      const heard = buf.length < 1000 ? { text: null, failed: false } : await transcribeDetailed(buf);
      if (heard.failed) return reply.code(503).send({ error: 'stt_down' });
      if (!heard.text) return { result: null, error: 'not_heard', words: 0 };
      answer = heard.text.slice(0, 4000);
    }
    // Silence is not a score. Say so plainly instead of asking the judge to
    // grade nothing and getting a hallucinated 40 back.
    const words = answer.split(/\s+/).filter(Boolean).length;
    if (words < 8) {
      return { result: null, error: 'too_short', words };
    }
    try {
      const result = await scoreDrill(d, answer);
      const s = readSession(req);
      const streak = s && countsForStreak ? await recordDrill(s.sub, day, result.score) : null;
      event('drill_done', { score: result.score });
      return {
        result,
        streak: streak?.streak ?? 0,
        best: streak?.best ?? 0,
        already: streak?.already ?? false,
        // For a guest keeping the streak on the device: which day this was,
        // and whether it was the day's own drill (the only kind that counts).
        day,
        daily: countsForStreak,
        // How many words the judge had to go on, shown with the score.
        words,
      };
    } catch (err) {
      console.error(`[drill] scoring failed: ${errTag(err)}`);
      return reply.code(503).send({ error: 'judge_down' });
    }
  },
);

// ---- friends ----
// Account-only, like every friends list worth having: a friend you cannot find
// again tomorrow is not a friend, it is a tab. The account id never leaves the
// server; the client identifies people by username alone.
app.get('/friends', async (req, reply) => {
  const s = readSession(req);
  if (!s) return reply.code(401).send({ friends: [] });
  const rows = await listFriends(s.sub);
  // A database blip is not an empty friends list. Say so, or the screen tells
  // a lie the user cannot tell apart from the truth.
  if (rows === null) return reply.code(503).send({ error: 'store_down' });
  return {
    friends: rows.map(({ sub, playerId, ...safe }) => ({
      ...safe,
      // Presence is for friends. A pending request (either direction) is
      // somebody who has not agreed to be watched coming and going.
      online: !safe.pending && (io.sockets.adapter.rooms.get(`acct:${sub}`)?.size ?? 0) > 0,
    })),
  };
});

app.post<{ Body: { username?: string; action?: string } }>('/friends', async (req, reply) => {
  const s = readSession(req);
  if (!s) return reply.code(401).send({ error: 'signed_out' });
  if (!allow(`friends:${s.sub}`, 40, 5 * 60_000)) {
    return reply.code(429).send({ error: 'rate_limited' });
  }
  const username = String(req.body?.username ?? '').trim();
  if (!username || username.length > 16) return reply.code(400).send({ error: 'bad_request' });
  // Poke every tab the other person has open. Without this a request just sits
  // in a table: the friends screen only fetches on mount, so the person you
  // added sees nothing until they happen to reopen the page, which reads as
  // "the friend system does not work".
  const poke = async (): Promise<void> => {
    const sub = await subForUsername(username);
    if (sub) io.to(`acct:${sub}`).emit('friend:changed');
  };
  switch (req.body?.action) {
    case 'add': {
      const result = await requestFriend(s.sub, username);
      if (result === 'ok' || result === 'accepted') await poke();
      return { result };
    }
    case 'accept': {
      const result = await acceptFriend(s.sub, username);
      if (result === 'ok') await poke();
      return { result };
    }
    case 'remove': {
      const result = await removeFriend(s.sub, username);
      if (result === 'ok') await poke();
      return { result };
    }
    default:
      return reply.code(400).send({ error: 'bad_request' });
  }
});

app.get<{ Querystring: { mode?: string } }>('/matches', async (req, reply) => {
  const s = readSession(req);
  if (!s) return reply.code(401).send({ matches: [] });
  const mode = ['ranked', 'custom', 'bots'].includes(String(req.query.mode))
    ? String(req.query.mode)
    : undefined;
  return { matches: await listMatches(s.playerId, mode) };
});

app.get<{ Params: { id: string } }>('/matches/:id', async (req, reply) => {
  const s = readSession(req);
  if (!s) return reply.code(401).send({ error: 'signed_out' });
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return reply.code(400).send({ error: 'bad_id' });
  const match = await loadMatch(s.playerId, id);
  if (!match) return reply.code(404).send({ error: 'not_found' });
  return { match };
});

/** Ask the YapMaster about a FINISHED match, days later. The live coach reads
    a lobby that no longer exists, so this reads your saved copy instead: the
    verdict and the transcript (coach.ts coachOnRecord). Same voice, same
    refusal to move the score. */
app.post<{ Params: { id: string }; Body: { question?: string; history?: unknown } }>(
  '/matches/:id/coach',
  { bodyLimit: 32_768 },
  async (req, reply) => {
    const s = readSession(req);
    if (!s) return reply.code(401).send({ error: 'signed_out' });
    const id = Number(req.params.id);
    // Per address, per account, and per match: a re-opened debate gets the
    // same eight questions a day that the live coach gets per side.
    if (
      !allow(`coachrec:${req.ip}`, 30, 10 * 60_000) ||
      !allow(`coachrec-acct:${s.sub}`, 40, 60 * 60_000) ||
      !allow(`coachrec-m:${s.sub}:${id}`, 8, 24 * 60 * 60_000)
    ) {
      return reply.code(429).send({ error: 'rate_limited' });
    }
    const question = cleanLine(req.body?.question, 300);
    if (!Number.isInteger(id) || !question) return reply.code(400).send({ error: 'bad_request' });
    // At most eight turns reach the model, alternating, each a string of at
    // most 1200 characters (security.ts coachHistory); anything else is
    // refused whole rather than trimmed into shape.
    const history = coachHistory(req.body?.history);
    if (!history) return reply.code(400).send({ error: 'bad_history' });
    const match = await loadMatch(s.playerId, id);
    if (!match) return reply.code(404).send({ error: 'not_found' });
    try {
      const text = await coachOnRecord({
        question,
        history,
        side: String(match.my_side) as 'FOR' | 'AGAINST',
        topic: String(match.topic),
        verdict: match.verdict as never,
        transcript: match.transcript,
      });
      return { text };
    } catch (err) {
      console.error(`[coach] record ${id} failed: ${errTag(err)}`);
      event('coach_failed', { record: true });
      return reply.code(503).send({ error: 'coach_down' });
    }
  },
);

// Counters. Keyed like everything under /stats: no key configured, no route.
app.get('/stats', async (req, reply) => {
  if (!keyed(req)) return reply.code(404).send({ error: 'Not Found' });
  return { ...statsSnapshot(), lobbies: lobbyCount(), llm: llmUsage(), judge: llmDown() ? 'down' : 'ok' };
});

// The event trail behind the counters. `?code=ABC123` follows one debate end to
// end, which is the question that actually gets asked when something breaks:
// did their audio arrive, how big was it, and how many words came back.
app.get<{ Querystring: { code?: string; limit?: string } }>(
  '/stats/events',
  async (req, reply) => {
    if (!keyed(req)) return reply.code(404).send({ error: 'Not Found' });
    const limit = Math.min(400, Math.max(1, Number(req.query.limit) || 100));
    return {
      // How the PREVIOUS instance died. Present means the shutdown handler ran.
      previousShutdown: await lastShutdown(),
      events: recentEvents(limit, req.query.code?.toUpperCase()),
    };
  },
);

// The report review queue. STRICTER than the other /stats routes: those are
// counters and may be public when STATS_KEY is unset, but this one serves
// debate transcripts — the disclosed exception says "to the review team",
// not "to the internet". No key configured means no route at all.
app.get<{ Querystring: { limit?: string } }>(
  '/stats/reports',
  async (req, reply) => {
    if (!keyed(req)) return reply.code(404).send({ error: 'Not Found' });
    return { reports: await loadReports(Number(req.query.limit) || 50) };
  },
);

// The anti-cheat file. Same key, same fail-closed rule: without STATS_KEY set
// this endpoint does not exist, because a public list of who we suspect would
// be far worse than no list at all.
app.get<{ Querystring: { limit?: string } }>(
  '/stats/cheat',
  async (req, reply) => {
    if (!keyed(req)) return reply.code(404).send({ error: 'Not Found' });
    return { flags: await loadCheatFlags(Number(req.query.limit) || 50) };
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
  // 1 MB, the engine.io default, above everything a client legitimately
  // sends: an audio segment is ~20 KB (5 s at 32 kbps) and the handler caps
  // it at 512 KB (debate.ts MAX_SEGMENT_BYTES); an rtc:signal is capped at
  // 16 KB. A packet over 1 MB closes that socket, which is the point.
  // Ping every 10 s, drop after 15 s without a pong: a silently stalled
  // network is noticed in about 25 s instead of the default ~45 s, which left
  // a frozen turn on screen with a mic line still saying the judge could hear
  // (2026-09-13 retest). The grace windows (GRACE_MS, HOST_AWAY_MS) absorb a
  // phone that pauses a backgrounded tab.
  { serveClient: false, maxHttpBufferSize: 1_000_000, pingInterval: 10_000, pingTimeout: 15_000 },
);

// ---- ranked matchmaking queue ----
// In-memory like the lobbies. An entry is one waiting socket; pairing is
// strictly first-come-first-served (rating-window matchmaking is pointless
// until there are enough concurrent players for a window to select from).
// ONE queue. There was a queue per pace from 2026-09-04 to 2026-09-12, and he
// took it out: "make all the people play one mode so that we have as many
// players as possible". A pool this size cannot afford to be split three
// ways, and a ranked game is a standard game.
interface QueueEntry {
  socketId: string;
  sessionId: string;
  playerId: string;
  name: string;
  /** Their rating, for the waiting screen. */
  rating: number;
}
const rankedQueue: QueueEntry[] = [];

function dropFromQueue(socketId: string): void {
  const i = rankedQueue.findIndex((q) => q.socketId === socketId);
  if (i >= 0) rankedQueue.splice(i, 1);
}

function broadcastQueue(): void {
  for (const q of rankedQueue) {
    io.to(q.socketId).emit('queue:update', { waiting: rankedQueue.length, rating: q.rating, pace: 'standard' });
  }
}

/** What a seat wears, decided here and never by the client. Every room starts
    masked (his call 2026-09-04): a camera is something you switch on in the
    green room (pick:mask false), never something a stranger gets by default.

    Signed out: the grey silhouette, whatever the client asked for (his call
    2026-09-12: a guest is a silhouette "to encourage them to log in to get
    skins"). Signed in: the mask you saved, or a random roster mask when there
    is none yet (the locker is read just after connect) or the saved one has
    since left the roster. The locker's mask_default is still stored and
    still accepted, but no seat reads it any more: the room decides, not the
    account. */
function seatLookOf(data: SocketData): { avatarId: AvatarId; masked: boolean } {
  if (!data.account) return { avatarId: GUEST_AVATAR, masked: true };
  const saved = data.locker?.mask;
  const onRoster = saved && (AVATAR_IDS as readonly string[]).includes(saved);
  return { avatarId: onRoster ? (saved as AvatarId) : randomAvatar(), masked: true };
}

/** Pair the two longest-waiting players into a ranked green room. */
function tryMatch(): void {
  for (;;) {
    if (rankedQueue.length === 0) break;
    const ai = 0;
    const a = rankedQueue[ai]!;
    // Never pair someone with themselves. A signed-in player has one stable
    // playerId across tabs, so without this two tabs are an ELO printing press
    // and the judge ends up scoring one person arguing both sides. Take the
    // first entry that is genuinely somebody else; if there is none, leave A
    // in line and wait for a real opponent rather than inventing one.
    const bi = rankedQueue.findIndex(
      (q, i) => i !== ai && q.playerId !== a.playerId && q.sessionId !== a.sessionId,
    );
    if (bi < 0) break;
    const b = rankedQueue[bi]!;
    const sa = io.sockets.sockets.get(a.socketId);
    const sb = io.sockets.sockets.get(b.socketId);
    // A ghost entry (socket died between heartbeats) must not eat a real one:
    // the ghost leaves the line, the living player keeps their place in it.
    if (!sa || !sb) {
      if (!sb) dropFromQueue(b.socketId);
      if (!sa) dropFromQueue(a.socketId);
      if (!sa && !sb) continue;
      break;
    }
    // Higher index first so the lower one is still where we found it.
    rankedQueue.splice(Math.max(ai, bi), 1);
    rankedQueue.splice(Math.min(ai, bi), 1);
    const lobby = createLobby(a.socketId, a.sessionId, a.name);
    lobby.host!.playerId = a.playerId;
    // The same look every other seat gets: the locker for an account, the
    // silhouette for a guest (only reachable here where Google is off).
    Object.assign(lobby.host!, seatLookOf(sa.data));
    lobby.guest = { socketId: b.socketId, sessionId: b.sessionId, name: b.name, ...seatLookOf(sb.data), playerId: b.playerId, rtcReady: false };
    lobby.status = 'greenroom';
    lobby.topicMode = 'random'; // strangers never negotiate a topic
    // Ranked plays at standard length (his call, 2026-09-14, after a day on
    // blitz). The rating it moves is the one ladder everybody has (judge.ts).
    lobby.pace = 'standard'; // pick:pace is refused in a ranked room
    lobby.ranked = { host: a.playerId, guest: b.playerId };
    // Ranked is faceless by format: both strangers are behind masks.
    lobby.host!.masked = true;
    lobby.guest.masked = true;
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
// 100 is still just a safety rail on the naive one-process audio fan-out;
// real broadcast scale is the SFU tier (PRD). Was 20 before 2026-08-09.
const SPECTATOR_CAP = 100;

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
    // A called-off debate says so, with the reason, and a finished one
    // carries its verdict: a watcher who opens either by code (or lands on
    // it from the feed) has something true to look at.
    status: lobby.status,
    ...(lobby.status === 'verdict' && lobby.verdict ? { verdict: lobby.verdict } : {}),
    ...(lobby.status === 'aborted' ? { abort: lobby.abortInfo ?? { reason: 'abortGone' } } : {}),
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
    avatars: lobby.sides
      ? {
          ...(lobby.host && lobby.sides.host ? { [lobby.sides.host]: lobby.host.avatarId } : {}),
          ...(lobby.guest && lobby.sides.guest ? { [lobby.sides.guest]: lobby.guest.avatarId } : {}),
        }
      : undefined,
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
    hostSide: lobby.hostSide,
    pace: lobby.pace,
    pick: {
      yourTopicId: isHost ? pick.hostTopicId : pick.guestTopicId,
      peerTopicId: isHost ? pick.guestTopicId : pick.hostTopicId,
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
    yourAvatar: receiver.avatarId,
    peerAvatar: peer?.avatarId,
    yourMasked: receiver.masked,
    peerMasked: peer?.masked,
    spectatorsAllowed: lobby.spectatorsAllowed,
    // Debaters always know they have an audience, green room included;
    // spectate:count keeps it current from here.
    watchers: spectatorCount(lobby.code),
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
  // The first verdict's destroy timer: left running, it deleted the room ten
  // minutes after that verdict, in the middle of the rematch.
  if (lobby.cleanupTimer) clearTimeout(lobby.cleanupTimer);
  lobby.phaseTimer = undefined;
  lobby.judgeTimer = undefined;
  lobby.cleanupTimer = undefined;
  // Everything the last debate said or measured goes with it, or the
  // rematch starts with the old debate's words, clock and verdict in it.
  lobby.segmentText = [];
  lobby.turnStarts = new Map();
  lobby.blur = { FOR: { blurMs: 0, blurCount: 0 }, AGAINST: { blurMs: 0, blurCount: 0 } };
  lobby.botFailures = 0;
  lobby.botSpoke = new Set();
  lobby.reportedBy = undefined;
  lobby.lastPhase = undefined;
  lobby.eloResult = undefined;
  lobby.placementResult = undefined;
  lobby.verdictAudio = undefined;
  lobby.framing = undefined;
  lobby.startsAt = undefined;
  lobby.audioBytes = { FOR: 0, AGAINST: 0 };
  lobby.forfeitApplied = undefined;
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
  lobby.coachAsks = { FOR: 0, AGAINST: 0 };
  lobby.coachLog = [];
  // Keep topicMode, categoryKey and hostSide (they land back on the same
  // setup). Clear the topic picks + confirms so they choose fresh.
  lobby.pick.hostTopicId = null;
  lobby.pick.guestTopicId = null;
  lobby.pick.hostConfirmed = false;
  lobby.pick.guestConfirmed = false;
  // Both clients set up WebRTC again for the rematch and each says rtc:ready
  // when it has. Left true from the first debate, the first of them to say
  // so got rtc:go at once and offered to a peer that was not listening yet.
  if (lobby.host) lobby.host.rtcReady = false;
  if (lobby.guest) lobby.guest.rtcReady = false;
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
function releasePreviousSeat(socket: {
  id: string;
  data: SocketData;
  leave: (room: string) => unknown;
}): void {
  const code = socket.data.code;
  const prev = code ? getLobby(code) : undefined;
  if (prev && prev.status === 'waiting' && participantOf(prev, socket.id)) {
    destroyLobby(prev.code);
    io.socketsLeave(prev.code);
  }
  // Always out of the old room's socket rooms, or its phases, verdicts and
  // lobby:closed keep arriving on a socket that has moved on.
  if (code) {
    void socket.leave(code);
    void socket.leave(`spec:${code}`);
    dropSpectator(socket.id, code);
  }
  socket.data.code = undefined;
  // Starting something else also gives up this tab's place in the ranked
  // queue, or the queue can pair it in the middle of that other game.
  if (rankedQueue.some((q) => q.socketId === socket.id)) {
    dropFromQueue(socket.id);
    broadcastQueue();
  }
}

/** At most this many rooms waiting for a guest per address. It was 3, and
    the lobby opens a room whenever the friend tab is on screen, so a
    classroom or an office behind one address ran out after three people
    looked at that tab. 25 still keeps one address from filling the lobby
    cap (MAX_LOBBIES), with the create gate (20 a person, 100 an address,
    per five minutes) in front of it. */
const MAX_WAITING_PER_IP = 25;

/** A host whose socket dropped while their room waited (a switch to
    WhatsApp to send the code, a wifi blip) keeps the room for the rest of
    its waiting TTL and takes it back with lobby:resume. If the friend walks
    in while the host is still away, the host gets this long to come back
    before the room closes on the friend. */
const HOST_AWAY_MS = 2 * 60_000;

/** One player, one live seat. True when `playerId` (a device id, or an
    account's player id, which every tab and device of the account shares)
    already holds a live seat through another socket (lobby.ts liveSeatOf:
    a green room, a debate, a verdict being written), or, with `queue`, a
    place in the ranked queue from another socket. A second tab otherwise
    ran a second game at the same time: another full set of model calls, and
    for an account, two ranked matches at once. */
function busyElsewhere(playerId: string, socketId: string, queue = true): boolean {
  if (!playerId) return false;
  if (liveSeatOf(playerId, socketId)) return true;
  return queue && rankedQueue.some((q) => q.playerId === playerId && q.socketId !== socketId);
}

/** Everyone watching `code` is sent out with `reason` (an i18n key, shown
    like any lobby:closed): out of both of the lobby's socket rooms and off
    the count, which drops to zero for the debaters. */
function sendWatchersOut(code: string, reason: string): void {
  const set = spectators.get(code);
  if (!set || set.size === 0) return;
  spectators.delete(code);
  for (const sid of set) {
    const s = io.sockets.sockets.get(sid);
    if (!s) continue;
    void s.leave(code);
    void s.leave(`spec:${code}`);
    if (s.data.code === code) s.data.code = undefined;
    s.emit('lobby:closed', { reason });
  }
  broadcastWatchers(code);
}

/** The guest walked out of a friend room's green room, by Leave or by
    closing the tab: the room goes back to waiting under the same code
    (lobby.ts reopenForNextGuest) and the host is told who left and that the
    code still works. */
function reopenAfterGuestLeft(lobby: Lobby): void {
  const who = lobby.guest?.name ?? '';
  reopenForNextGuest(lobby);
  // A host who is away (dropped before or during the green room) keeps a
  // waiting room for the rest of its TTL, so the green room's grace stops.
  if (lobby.host?.disconnectedAt && lobby.host.graceTimer) {
    clearTimeout(lobby.host.graceTimer);
    lobby.host.graceTimer = undefined;
  }
  broadcastLobbyUpdate(lobby);
  if (lobby.host && !lobby.host.disconnectedAt) {
    io.to(lobby.host.socketId).emit('lobby:notice', { reason: 'noticeGuestLeft', vars: { x: who } });
  }
}

// Whatever destroys a lobby (a leave, the sweep, abort's timer, the judge's
// post-verdict cleanup in judge.ts), its watchers go with it: the count, and
// the audio room. The lobby's own socket room is left to the caller, which
// may still have a lobby:closed to send through it (the sweep does).
setOnLobbyDestroyed((code) => {
  const set = spectators.get(code);
  spectators.delete(code);
  io.socketsLeave(`spec:${code}`);
  for (const sid of set ?? []) {
    const s = io.sockets.sockets.get(sid);
    if (s?.data.code === code) s.data.code = undefined;
  }
});

io.on('connection', (socket) => {
  // Bind the socket to its account BEFORE any handler runs. A yap name is only
  // an identity if it cannot be typed by whoever asks, so from here on a
  // signed-in socket's name and playerId come from the signed cookie, never
  // from the payload. Signed-out sockets behave exactly as they always did.
  const sess = readSessionCookie(socket.handshake.headers.cookie);
  if (sess) {
    socket.data.account = { sub: sess.sub, playerId: sess.playerId, name: sess.name };
    // Presence: one room per account, so a friend list can ask "are they here"
    // and a challenge can reach every tab they have open.
    //
    // This deliberately does NOT require a claimed yap name. It used to, and
    // that made a brand new account invisible: you sign in, claim your name,
    // and your ALREADY-CONNECTED socket still carries the pre-name cookie, so
    // it never joined the room and no friend could ever call you out. Presence
    // is a property of the account, not of the name.
    void socket.join(`acct:${sess.sub}`);
    // Locker: your saved mask follows you into every mode, including training,
    // which has no green room to pick one in.
    void getLocker(sess.sub).then((l) => {
      if (!socket.data.account) return;
      if (l.missing) {
        // A deleted account's leftover cookie: this socket is a guest now.
        void socket.leave(`acct:${sess.sub}`);
        socket.data.account = undefined;
        return;
      }
      socket.data.locker = { mask: l.mask, maskDefault: l.maskDefault };
      // The cookie carries the name it was signed with. After a rename on
      // another device that name is stale (and may be someone else's by now),
      // so the account row wins.
      if (l.username) socket.data.account.name = l.username;
    });
  }
  /** The name this socket is allowed to use: a claimed yap name comes from
      the account, never the payload. */
  const nameOf = (claimed: string): string => socket.data.account?.name || claimed;
  /** Whether that name may be seated. Anything without a claimed yap name
      (signed out, or an account that has not claimed one) is a guest, and a
      guest carries exactly the name its device was given, GuestNNNN
      (client/src/guest.ts). A guest who could type a name could type an
      account's. */
  const nameAllowed = (name: string): boolean =>
    socket.data.account?.name ? NAME_RE.test(name) : GUEST_NAME_RE.test(name);
  /** The ladder identity this socket may use. Signed in: the account's, from
      the cookie. Signed out: the device id from the payload, unless it has
      an account's shape (acct_) or an account already owns it (a device id
      becomes an account's at that device's first sign-in). Then, and when
      the store cannot say, the socket plays under no id at all: nothing is
      filed, rated or advanced, and nothing is written into an account's
      player row. '' means no id. */
  const resolveId = async (claimed: unknown): Promise<string> => {
    if (socket.data.account) return socket.data.account.playerId;
    const id = String(claimed ?? '').slice(0, 64);
    if (!id || !guestIdShapeOk(id)) return '';
    const owned = await playerIdOwned(id);
    if (owned === false) return id;
    if (owned) event('guest_id_refused');
    return '';
  };
  /** Seated in a debate that is running (or being judged): starting anything
      else from this socket would leave that one running on, spending bot
      turns, a voice and a judge call, and filing a loss. */
  const seatedLive = (): boolean => {
    const l = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!l || !participantOf(l, socket.id)) return false;
    return l.status === 'in_debate' || (l.status === 'judging' && l.judgeState !== 'failed');
  };
  /** Also mid-way through starting something (across an await). */
  const busy = (): boolean => Boolean(socket.data.starting) || seatedLive();
  /** Rate-limit identity: the account, else the tab's session id. */
  const who = (p: unknown): string => {
    if (socket.data.account) return `a${socket.data.account.sub}`;
    const sid = String((p as { sessionId?: unknown } | undefined)?.sessionId ?? '').slice(0, 40);
    return `s${sid || socket.id}`;
  };
  /** A start bucket: `perWho` per person in five minutes, under a wider
      `perIp` ceiling for the address (a campus NAT is many people; a script
      rotating session ids is one address). Off in fast (test) mode. */
  const gate = (bucket: string, p: unknown, perWho: number, perIp: number): boolean =>
    FAST ||
    (allow(`${bucket}:${who(p)}`, perWho, 5 * 60_000) && allow(`${bucket}-ip:${ipOf(socket)}`, perIp, 5 * 60_000));
  /** Seat defaults for this socket (seatLookOf has the rule). */
  const seatLook = () => seatLookOf(socket.data);
  socket.on('lobby:create', async (p, cb) => {
    if (typeof cb !== 'function') return;
    // Friendly ceiling: two friends never hit this; a lobby-spam script does.
    // Its OWN bucket, separate from solo play. These used to share one, so an
    // evening of bot debates silently used up the budget for opening a room
    // and "call out a friend" then did nothing at all, with no message.
    if (!gate('create', p, 20, 100)) return cb({ ok: false, error: 'rate_limited' });
    if (busy()) return cb({ ok: false, error: 'in_progress' });
    const name = nameOf(String(p?.name ?? '').trim());
    if (!nameAllowed(name)) return cb({ ok: false, error: 'bad_name' });
    socket.data.starting = true;
    let playerId = '';
    try {
      playerId = await resolveId(p?.playerId);
    } finally {
      socket.data.starting = false;
    }
    if (!socket.connected) return;
    // One player, one live seat: a green room or a debate in another tab.
    if (busyElsewhere(playerId, socket.id)) return cb({ ok: false, error: 'busy_elsewhere' });
    // This tab's own room from before a dropped connection it never took
    // back (a client that does not lobby:resume a waiting room) goes now,
    // rather than sitting out its TTL against the address's cap.
    const sid = String(p.sessionId ?? '').slice(0, 64);
    if (sid) {
      for (const l of allLobbies()) {
        if (l.status === 'waiting' && l.host?.disconnectedAt && l.host.sessionId === sid) {
          destroyLobby(l.code);
          io.socketsLeave(l.code);
        }
      }
    }
    if (lobbyCount() >= MAX_LOBBIES) return cb({ ok: false, error: 'rate_limited' });
    // Rooms nobody has joined yet, per address. The socket's own waiting
    // room does not count: making a new one releases it.
    const ip = ipOf(socket);
    if (waitingRoomsFrom(ip, socket.data.code) >= MAX_WAITING_PER_IP) {
      return cb({ ok: false, error: 'rate_limited' });
    }
    releasePreviousSeat(socket);
    const lobby = createLobby(socket.id, String(p.sessionId ?? '').slice(0, 64), name);
    lobby.hostIp = ip;
    // The ladder identity, account or device (see Participant.playerId): a
    // guest's friend games are filed under the device id since 2026-09-12.
    lobby.host!.playerId = playerId || undefined;
    Object.assign(lobby.host!, seatLook());
    event('lobby_created', { code: lobby.code });
    socket.data.code = lobby.code;
    socket.data.role = 'host';
    void socket.join(lobby.code);
    cb({ ok: true, update: updateFor(lobby, lobby.host!) });
  });

  socket.on('lobby:join', async (p, cb) => {
    if (typeof cb !== 'function') return;
    // Also throttles brute-forcing lobby codes (32^6 space, but still).
    if (!gate('join', p, 30, 150)) return cb({ ok: false, error: 'rate_limited' });
    if (busy()) return cb({ ok: false, error: 'in_progress' });
    const name = nameOf(String(p?.name ?? '').trim());
    if (!nameAllowed(name)) return cb({ ok: false, error: 'bad_name' });
    socket.data.starting = true;
    let playerId = '';
    try {
      playerId = await resolveId(p?.playerId);
    } finally {
      socket.data.starting = false;
    }
    if (!socket.connected) return;
    const lobby = getLobby(String(p.code ?? '').slice(0, 8));
    if (!lobby) return cb({ ok: false, error: 'not_found' });
    // A ranked room is two strangers the queue paired, and its seats carry
    // their ratings (lobby.ranked): no code walks anybody else into one.
    if (lobby.ranked) return cb({ ok: false, error: 'not_found' });
    if (lobby.status !== 'waiting') {
      // greenroom = the seat is taken; anything later = it started without you.
      return cb({ ok: false, error: lobby.status === 'greenroom' ? 'full' : 'in_progress' });
    }
    if (lobby.guest) return cb({ ok: false, error: 'full' });
    // You cannot be your own opponent. Caught two ways: the same ACCOUNT, and
    // the same browser session in a second tab. A debate needs two people to
    // mean anything, and the judge cannot score one person playing both sides.
    const meAcct = socket.data.account?.playerId;
    if (meAcct && lobby.host?.playerId === meAcct) return cb({ ok: false, error: 'self' });
    if (lobby.host?.sessionId && lobby.host.sessionId === String(p.sessionId ?? '')) {
      return cb({ ok: false, error: 'self' });
    }
    // ...and the same DEVICE. A second tab has a session id of its own but
    // the device's player id, so a signed-out player could walk into their
    // own room from the next tab and debate themselves.
    if (playerId && lobby.host?.playerId === playerId) return cb({ ok: false, error: 'self' });
    // One player, one live seat: not while this player holds a green room, a
    // debate or a place in the ranked queue through another tab.
    if (busyElsewhere(playerId, socket.id)) return cb({ ok: false, error: 'busy_elsewhere' });
    // Nor while the HOST does. A waiting room is not a live seat, so its host
    // can have gone into a game from another tab since opening it; from the
    // door, that reads as "their debate already started".
    if (lobby.host?.playerId && busyElsewhere(lobby.host.playerId, lobby.host.socketId)) {
      return cb({ ok: false, error: 'in_progress' });
    }

    releasePreviousSeat(socket);
    lobby.guest = {
      socketId: socket.id,
      sessionId: String(p.sessionId ?? '').slice(0, 64),
      name,
      ...seatLook(),
      playerId: playerId || undefined,
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
    // The host is away: their connection dropped while the room waited (a
    // switch to WhatsApp to send this very code, say) and has not resumed.
    // The friend waits in the green room and is told the host's connection
    // is out; the host gets HOST_AWAY_MS to come back before the room closes.
    const host = lobby.host;
    if (host?.disconnectedAt) {
      socket.emit('peer:connection', { state: 'lost', graceDeadline: Date.now() + HOST_AWAY_MS });
      if (host.graceTimer) clearTimeout(host.graceTimer);
      host.graceTimer = setTimeout(() => {
        const l = getLobby(lobby.code);
        if (l !== lobby || l.host !== host || !host.disconnectedAt || l.status !== 'greenroom') return;
        io.to(l.code).emit('lobby:closed', { reason: 'closedHostLeft' });
        destroyLobby(l.code);
        io.socketsLeave(l.code);
      }, HOST_AWAY_MS);
    }
  });

  socket.on('lobby:resume', (p, cb) => {
    if (typeof cb !== 'function') return;
    if (!allow(`resume:${socket.id}`, 20, 60_000)) return cb({ ok: false });
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

  // Pick your mask. Any seat, any pre-debate moment (ranked green room too —
  // it's the one choice ranked allows). Doesn't reset confirmations: cosmetic.
  socket.on('pick:avatar', (id) => {
    if (!allow(`pick:${socket.id}`, 60, 10_000)) return;
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    // Masks are picked in the lobby. Once your friend is in, the room keeps
    // the mask you walked in with (his call, 2026-09-13: no changing your
    // mask mid custom game). The green room no longer shows a picker.
    if (!lobby || lobby.status !== 'waiting') return;
    const me = participantOf(lobby, socket.id);
    if (!me) return;
    // A guest wears the silhouette, full stop: characters come with an
    // account. And the silhouette is not on the roster, so nobody picks it.
    if (!socket.data.account) return;
    if (!(AVATAR_IDS as readonly string[]).includes(String(id))) return;
    me.avatarId = String(id) as (typeof AVATAR_IDS)[number];
    touch(lobby);
    broadcastLobbyUpdate(lobby);
  });

  // Mask or camera. Every seat starts masked, so `false` here is how a player
  // turns their camera on. Custom only (ranked is masked by format) and
  // pre-debate only: flipping mid-debate would need a WebRTC renegotiation.
  socket.on('pick:mask', (on) => {
    if (!allow(`pick:${socket.id}`, 60, 10_000)) return;
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby || lobby.ranked) return;
    if (lobby.status !== 'greenroom' && lobby.status !== 'waiting') return;
    const me = participantOf(lobby, socket.id);
    if (!me) return;
    me.masked = Boolean(on);
    touch(lobby);
    broadcastLobbyUpdate(lobby);
  });

  // Open or shut the door to watchers. Host-only, custom only — ranked is the
  // public sport and always spectatable.
  socket.on('pick:spectators', (allowed) => {
    if (!allow(`pick:${socket.id}`, 60, 10_000)) return;
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby || lobby.ranked) return;
    if (lobby.status !== 'greenroom' && lobby.status !== 'waiting') return;
    if (participantOf(lobby, socket.id) !== lobby.host) return;
    lobby.spectatorsAllowed = Boolean(allowed);
    // "Just us" means just us: whoever is already watching is sent out with
    // a reason, instead of watching on while the hint says only the
    // opponent can use the code.
    if (!lobby.spectatorsAllowed) sendWatchersOut(lobby.code, 'closedWatchersOff');
    touch(lobby);
    broadcastLobbyUpdate(lobby);
  });

  // Host picks the category for 'category' mode. 'waiting' is allowed, like
  // pick:mode: the host sets the match up on the stage before the friend
  // walks in, and a pick dropped for arriving early would have to be made
  // again in the green room without anyone saying so.
  socket.on('pick:category', (key) => {
    if (!allow(`pick:${socket.id}`, 60, 10_000)) return;
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby || (lobby.status !== 'greenroom' && lobby.status !== 'waiting')) return;
    if (lobby.topicMode !== 'category') return;
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

  // 'waiting' is allowed for the same reason as pick:category.
  socket.on('pick:topic', (topicId) => {
    if (!allow(`pick:${socket.id}`, 60, 10_000)) return;
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby || (lobby.status !== 'greenroom' && lobby.status !== 'waiting')) return;
    if (lobby.topicMode !== 'agree') return;
    const me = participantOf(lobby, socket.id);
    if (!me) return;
    const id = String(topicId ?? '');
    if (!TOPIC_BY_ID.has(id)) return;
    // SIMPLIFIED CUSTOM (his review: "pick it together doesn't really make
    // sense"). The old flow needed BOTH players to land on the same topic AND
    // opposite sides AND both confirm — four negotiations before a debate could
    // start, and a green room full of "waiting for them to pick the same
    // topic". Now the HOST sets the terms, which is how every challenge-based
    // game works: the challenger names them, the other accepts. Sides are
    // the host's call too since 2026-09-12 (pick:side below); the coin is
    // still the default.
    if (me !== lobby.host) return;
    if (lobby.pick.hostTopicId === id) return; // no-op picks don't rebroadcast
    lobby.pick.hostTopicId = id;
    lobby.pick.guestTopicId = id; // agreement is automatic now
    // any change requires both players to re-confirm
    lobby.pick.hostConfirmed = false;
    lobby.pick.guestConfirmed = false;
    touch(lobby);
    broadcastLobbyUpdate(lobby);
  });

  // The host's side: FOR, AGAINST, or 'random' for the coin. Host-only, any
  // topic mode, stage or green room. Until 2026-09-12 this was a per-seat
  // pick that nothing read: the design held that sides are always dealt,
  // because everyone grabs the side they already believe. His call reversed
  // it for friend rooms and bot games ("choose for or against, make it
  // random"), and the answer to the old worry is the default: the coin stays
  // the norm, a side is something the host has to reach for, and ranked
  // never takes this event at all.
  socket.on('pick:side', (side) => {
    if (!allow(`pick:${socket.id}`, 60, 10_000)) return;
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby || (lobby.status !== 'greenroom' && lobby.status !== 'waiting')) return;
    if (lobby.ranked) return; // ranked is fixed-format
    if (participantOf(lobby, socket.id) !== lobby.host) return; // host-only
    if (side !== 'FOR' && side !== 'AGAINST' && side !== 'random') return;
    if (lobby.hostSide === side) return;
    lobby.hostSide = side;
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
    // Plain text (security.ts cleanBlock): it becomes the motion, and the
    // motion is filed with the match.
    const clean = cleanBlock(text, DISPUTE_MAX);
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
    if (!allow(`pick:${socket.id}`, 60, 10_000)) return;
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby || lobby.status !== 'greenroom') return;
    const me = participantOf(lobby, socket.id);
    if (!me) return;
    const { pick } = lobby;
    // What "ready to confirm" means depends on the mode. In 'agree' the host
    // names the topic and the server mirrors it, so there is exactly one thing
    // to wait for. The side setting never blocks: it always has a value, and
    // 'random' means the coin at the start.
    const ready =
      lobby.topicMode === 'agree'
        ? pick.hostTopicId !== null
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
    if (!allow(`rtcready:${socket.id}`, 30, 60_000)) return;
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
    if (!peer || peer.disconnectedAt) return;
    // Ranked calls are relay only: two strangers never learn each other's
    // address (security.ts relayOnlySignal; the client asks for relay
    // candidates alone too, webrtc.ts).
    const out = lobby.ranked ? relayOnlySignal(payload) : payload;
    if (out) io.to(peer.socketId).emit('rtc:signal', out);
  });

  socket.on('speech:chunk', (chunk) => {
    // Chrome sends a final result every few seconds while you talk; this is
    // many times that, and far under a flood.
    if (!allow(`chunk:${socket.id}`, 60, 10_000)) return;
    if (!chunk || typeof chunk !== 'object') return;
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby) return;
    // Ranked is audio only wherever the server transcribes (production):
    // a typed chunk there is somebody pasting an essay into the socket.
    if (!typedSpeechAllowed(Boolean(lobby.ranked), sttConfigured())) return;
    const me = participantOf(lobby, socket.id);
    if (!me) return;
    acceptChunk(lobby, me, chunk);
  });

  // Walk out of a room you have not started debating in. The green room had no
  // exit at all: creating a lobby was a one-way door out of the app, and the
  // only escape was a refresh, which the unload warning argues with.
  socket.on('lobby:leave', () => {
    if (!allow(`misc:${socket.id}`, 60, 60_000)) return;
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby) return;
    const me = participantOf(lobby, socket.id);
    if (!me) return;
    // A bot game can be walked out of at any point before its verdict: it
    // is practice with nobody on the other end. Without this, a player who
    // left one mid-debate could start nothing else from this tab until it
    // ran out (every start refuses a socket seated in a live debate).
    // Nothing is filed, rated or unlocked, and no judge is called.
    if (lobby.bot && lobby.status !== 'verdict') {
      if (lobby.host) lobby.host.playerId = undefined;
      lobby.campaign = undefined;
      lobby.placement = undefined;
      lobby.status = 'aborted'; // stops a bot turn or a judge already in flight
      socket.to(lobby.code).emit('lobby:closed', { reason: 'closedPeerLeft' });
      socket.emit('lobby:closed', { reason: '' });
      destroyLobby(lobby.code);
      io.socketsLeave(lobby.code);
      io.socketsLeave(`spec:${lobby.code}`);
      spectators.delete(lobby.code);
      socket.data.code = undefined;
      return;
    }
    // Leaving a live human debate on purpose (the in-debate Leave control,
    // whose confirm says what it costs) ends it now rather than after the
    // reconnect grace a dropped connection gets: ranked counts it as a
    // walk-out under applyForfeit's rule, and the player who stayed is told
    // their opponent left instead of watching a "reconnecting" countdown.
    if (lobby.status === 'in_debate') {
      if (me.graceTimer) clearTimeout(me.graceTimer);
      me.disconnectedAt = Date.now();
      void socket.leave(lobby.code);
      void socket.leave(`spec:${lobby.code}`);
      socket.data.code = undefined;
      socket.emit('lobby:closed', { reason: '' });
      if (lobby.ranked) void applyForfeit(lobby, me);
      abort(io, lobby, 'abortLeft', { x: me.name });
      return;
    }
    // Otherwise a human room is only left before it starts; judging and the
    // verdict are not walk-outs (the disconnect path marks them).
    if (lobby.status !== 'waiting' && lobby.status !== 'greenroom') return;
    // The GUEST of a friend room walking out does not end the room: it goes
    // back to waiting under the same code, exactly as when the guest's tab
    // closes, and the host is told the code still works. (It was destroyed,
    // and the code the host had just shared went with it.) A ranked seat
    // belongs to the pairing, so a ranked room still closes below.
    if (me === lobby.guest && lobby.status === 'greenroom' && !lobby.ranked) {
      void socket.leave(lobby.code);
      void socket.leave(`spec:${lobby.code}`);
      socket.data.code = undefined;
      socket.emit('lobby:closed', { reason: '' });
      reopenAfterGuestLeft(lobby);
      return;
    }
    // The person who stayed gets told why the room vanished; the person who
    // pressed leave already knows, so they get no banner about their own click.
    socket.to(lobby.code).emit('lobby:closed', { reason: 'closedPeerLeft' });
    socket.emit('lobby:closed', { reason: '' });
    destroyLobby(lobby.code);
    io.socketsLeave(lobby.code);
    socket.data.code = undefined;
  });

  // Anti-cheat bookkeeping. Capped per turn so a spoofed flood cannot inflate
  // someone else's number, and only counted for the side whose turn it is.
  socket.on('turn:away', (p) => {
    if (!allow(`away:${socket.id}`, 30, 60_000)) return;
    if (!p || typeof p !== 'object') return;
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby?.ranked || !lobby.sides) return;
    const me = participantOf(lobby, socket.id);
    if (!me) return;
    const side = me === lobby.host ? lobby.sides.host : lobby.sides.guest;
    if (lobby.lastPhase?.activeSpeaker !== side) return;
    const ms = Math.min(120_000, Math.max(0, Number(p.ms) || 0));
    lobby.blur[side].blurMs += ms;
    lobby.blur[side].blurCount += 1;
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
    // A segment every five seconds while you speak; this is five times that.
    if (!allow(`audio:${socket.id}`, 30, 30_000)) return;
    if (!p || typeof p !== 'object') return;
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby) return;
    const me = participantOf(lobby, socket.id);
    if (!me) return;
    const raw = p.data as unknown;
    const buf = Buffer.isBuffer(raw) ? raw : raw instanceof ArrayBuffer ? Buffer.from(raw) : null;
    // Size rejections are the likeliest cause of a turn vanishing between the
    // browser and the judge, so they are logged rather than dropped in silence.
    // 512 KB a segment (a real one is ~20 KB); the per-side budget for the
    // whole debate is debate.ts's.
    if (!buf || buf.length < 1000 || buf.length > MAX_SEGMENT_BYTES) {
      event('audio_rejected', {
        code: lobby.code,
        step: Number(p.stepIndex),
        bytes: buf?.length ?? 0,
        why: !buf ? 'not_binary' : buf.length < 1000 ? 'too_small' : 'too_big',
      });
      return;
    }
    // If STT were ever misconfigured in prod, every turn would vanish here
    // without a trace. Cheap insurance against a silent, total outage.
    if (!sttConfigured()) return void event('audio_rejected', { why: 'stt_not_configured' });
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
    if (!allow(`misc:${socket.id}`, 60, 60_000)) return;
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby || lobby.tutorial) return; // tutorials debrief; they never judge
    if (!participantOf(lobby, socket.id)) return;
    if (!lobby.debateCompleted) return;
    if (lobby.judgeState !== 'failed' && lobby.judgeState !== 'done') return;
    void runJudge(io, lobby, socket.id);
  });

  socket.on('rematch', () => {
    if (!allow(`misc:${socket.id}`, 60, 60_000)) return;
    // Ranked never rematches: same-pair repeats are how a tiny population's
    // ratings turn into fiction. The queue is ranked's 'again'.
    { const l = socket.data.code ? getLobby(socket.data.code) : undefined; if (l?.ranked) return; }
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
  // in-memory verdict and transcript; the exchange is never written down.
  // Eight questions per SIDE: one debater using the coach must not spend
  // the other's.
  socket.on('coach:ask', (p) => {
    if (!allow(`coach:${socket.id}`, 12, 60_000)) return;
    if (!p || typeof p !== 'object') return;
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby || lobby.status !== 'verdict' || !lobby.verdict) return;
    const me = participantOf(lobby, socket.id);
    if (!me) return;
    const side = sideOf(lobby, me);
    if (!side) return;
    const question = cleanLine(p.question, 300);
    if (!question) return;
    const sid = socket.id;
    if (lobby.coachAsks[side] >= 8) {
      io.to(sid).emit('coach:reply', { text: '', done: true });
      return;
    }
    lobby.coachAsks[side] += 1;
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
        console.error(`[coach] lobby ${lobby.code} failed: ${errTag(err)}`);
        event('coach_failed', { code: lobby.code });
        lobby.coachLog.pop(); // no answer means that question never happened
        io.to(sid).emit('coach:reply', { text: '', error: true });
      });
  });

  // Build a share link for the verdict you just received. The card is saved
  // as a row and the link is its id. It is YOUR card: the scores, the ruling
  // and your own best line. The opponent did not choose to publish anything,
  // so none of their words go on it (share.ts cardFrom).
  socket.on('share:link', (cb) => {
    if (typeof cb !== 'function') return;
    if (!allow(`share:${socket.id}`, 20, 60_000)) return cb(null);
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    const me = lobby?.verdict ? participantOf(lobby, socket.id) : undefined;
    const mySide = lobby && me ? sideOf(lobby, me) : undefined;
    if (!lobby?.verdict || !mySide) return cb(null);
    const card = cardFrom(lobby.topic?.en ?? '', namesOf(lobby), lobby.verdict, lobby.framing?.said, mySide);
    void saveCard(card).then((id) => {
      // No fallback: if the store is down, sharing is unavailable rather than
      // silently producing a link of a different shape.
      event('share_created', { code: lobby.code, ok: id ? 'yes' : 'no' });
      cb(id ? { url: `/v/${id}` } : null);
    });
  });

  // Ranked: enter the queue. The rating is looked up (or created at the
  // seed) so the waiting screen can show it; pairing is first-come-first-
  // served. Whatever pace the payload carries is ignored: ranked is one
  // pace (blitz since 2026-09-13), and a client asking for another gets the
  // same game as everyone else rather than a line nobody else is standing in.
  socket.on('queue:join', (p, cb) => {
    if (typeof cb !== 'function') return;
    if (!gate('join', p, 30, 150)) return cb({ ok: false, error: 'rate_limited' });
    // A second tap while the first is still reading the rating: the first
    // one is doing the work, and this one simply agrees.
    if (socket.data.starting) return cb({ ok: true });
    if (seatedLive()) return cb({ ok: false, error: 'in_progress' });
    // Ranked needs an account: there is a rating on the line and a stranger
    // counting on it. The client already says so before it asks; this is the
    // gate for anything that skips the client (gate.ts has the rule).
    const refused = rankedRefusal(Boolean(socket.data.account), googleConfigured());
    if (refused) return cb({ ok: false, error: refused });
    // The model API is failing: a ranked match now would be minutes of
    // debating towards a verdict that cannot come.
    if (llmDown()) return cb({ ok: false, error: 'judge_down' });
    // Ranked calls are relay only (rtc:signal strips every other candidate),
    // so with no relay (TURN) credentials two players can never hear each
    // other: refuse, rather than pair them into a silent room. Fast (test)
    // mode has no relay and never places a call, so it is exempt.
    if (!FAST && !relayAvailable()) {
      event('queue_no_relay');
      return cb({ ok: false, error: 'no_relay' });
    }
    const name = nameOf(String(p?.name ?? '').trim());
    if (!nameAllowed(name)) return cb({ ok: false, error: 'bad_name' });
    if (rankedQueue.some((q) => q.socketId === socket.id)) return cb({ ok: true });
    socket.data.starting = true;
    void (async () => {
      try {
        const playerId = await resolveId(p?.playerId);
        if (!playerId) return cb({ ok: false, error: 'bad_name' });
        if (!io.sockets.sockets.get(socket.id)) return;
        // One player, one live seat. Another tab's place in the QUEUE is not
        // refused (this tab takes it over, below); a seat in a green room or
        // a debate is: that was one account in two ranked matches at once.
        if (busyElsewhere(playerId, socket.id, false)) return cb({ ok: false, error: 'busy_elsewhere' });
        // Ranked starts after the placement match (one game against the bot
        // nearest 1400 sets the starting rating). Only knowable with the
        // store up; with it down the queue stays open, as before.
        if (storeReady()) {
          const standing = await getRating(playerId);
          if (!io.sockets.sockets.get(socket.id)) return;
          if (!standing?.placed) return cb({ ok: false, error: 'unplaced' });
        }
        releasePreviousSeat(socket);
        const row = await getPlayer(playerId, name);
        // The socket may have left the queue (or died) while we read the rating.
        if (!io.sockets.sockets.get(socket.id)) return;
        // Again with no await between the check and the queue, so a start in
        // another tab during the reads above cannot slip past it.
        if (busyElsewhere(playerId, socket.id, false)) return cb({ ok: false, error: 'busy_elsewhere' });
        // One slot per socket and per PLAYER. A second tab takes over the
        // queue place instead of sitting beside itself (the other half of how
        // one person met themselves), and the tab it replaced is told it is
        // no longer searching instead of spinning forever.
        for (let i = rankedQueue.length - 1; i >= 0; i--) {
          const q = rankedQueue[i];
          if (q.socketId !== socket.id && q.playerId !== playerId) continue;
          rankedQueue.splice(i, 1);
          if (q.socketId !== socket.id) {
            io.to(q.socketId).emit('queue:update', {
              waiting: rankedQueue.length,
              rating: q.rating,
              pace: 'standard',
              replaced: true,
            });
          }
        }
        rankedQueue.push({
          socketId: socket.id,
          sessionId: String(p?.sessionId ?? '').slice(0, 64),
          playerId,
          name,
          // SEED_RATING, not a hardcoded 1000: that was the seed before the
          // rating_seed_700 migration, and it made a store blip queue a brand
          // new player as if they were 300 points better than they are.
          rating: row?.standard.rating ?? SEED_RATING,
        });
        event('queue_joined', { waiting: rankedQueue.length });
        cb({ ok: true });
        tryMatch();
      } finally {
        socket.data.starting = false;
      }
    })();
  });

  socket.on('queue:leave', () => {
    if (!allow(`misc:${socket.id}`, 60, 60_000)) return;
    dropFromQueue(socket.id);
    broadcastQueue();
  });

  // Call out a friend: push your room code to every tab they have open. The
  // code was already shareable by hand; this just saves the copy and paste and
  // makes "who is around right now" a real answer instead of a group chat.
  socket.on('friend:invite', (p, cb) => {
    if (typeof cb !== 'function') return;
    const me = socket.data.account;
    if (!me) return cb({ ok: false, error: 'signed_out' });
    if (!allow(`invite:${me.sub}`, 20, 5 * 60_000)) return cb({ ok: false, error: 'rate_limited' });
    const code = String(p?.code ?? '')
      .trim()
      .toUpperCase();
    const to = String(p?.username ?? '').trim();
    if (code.length !== 6 || !to) return cb({ ok: false, error: 'bad_request' });
    void (async () => {
      // Only actual friends, checked server-side: an invite you can send to any
      // username is a way to spam strangers.
      const friends = (await listFriends(me.sub)) ?? [];
      const target = friends.find((f) => !f.pending && foldName(f.username) === foldName(to));
      if (!target) return cb({ ok: false, error: 'not_friends' });
      const room = io.sockets.adapter.rooms.get(`acct:${target.sub}`);
      if (!room || room.size === 0) return cb({ ok: false, error: 'offline' });
      io.to(`acct:${target.sub}`).emit('friend:invited', { from: me.name, code });
      event('friend_invited');
      cb({ ok: true });
    })();
  });

  /** Who of your friends has a tab open right now. */
  socket.on('friend:presence', (_p, cb) => {
    if (typeof cb !== 'function') return;
    const me = socket.data.account;
    if (!me) return cb({ ok: false, online: [] });
    // Rate limited like every other store-touching handler: this is a query per
    // emit against a pool shared with ELO, matches and reports. A legitimate
    // client asks every 20 seconds.
    if (!allow(`presence:${me.sub}`, 20, 60_000)) return cb({ ok: false, online: [] });
    void (async () => {
      const friends = (await listFriends(me.sub)) ?? [];
      const online = friends
        .filter((f) => !f.pending && (io.sockets.adapter.rooms.get(`acct:${f.sub}`)?.size ?? 0) > 0)
        .map((f) => f.username);
      cb({ ok: true, online });
    })();
  });

  // Watch a live lobby by code. The code IS the invitation: whoever has it was
  // given it by someone in the room. Debaters always see the watcher count.
  socket.on('spectate:join', (p, cb) => {
    if (typeof cb !== 'function') return;
    // Its own bucket: hopping through the feed ("next") is many joins in a
    // row, and must not use up the budget for joining a friend's room.
    if (
      !FAST &&
      !(allow(`spec:${socket.data.account?.sub ?? socket.id}`, 40, 5 * 60_000) &&
        allow(`spec-ip:${ipOf(socket)}`, 200, 5 * 60_000))
    ) {
      return cb({ ok: false, error: 'rate_limited' });
    }
    // A debater does not watch another debate from the seat of a live one.
    if (busy()) return cb({ ok: false, error: 'not_found' });
    const lobby = getLobby(String(p?.code ?? '').slice(0, 8));
    if (!lobby) return cb({ ok: false, error: 'not_found' });
    if (participantOf(lobby, socket.id)) return cb({ ok: false, error: 'not_found' });
    // The host shut the door (custom only — ranked is always spectatable).
    if (!lobby.ranked && !lobby.spectatorsAllowed) return cb({ ok: false, error: 'not_found' });
    if (spectatorCount(lobby.code) >= SPECTATOR_CAP) return cb({ ok: false, error: 'full' });
    // Moving on to another debate leaves the one being watched: its rooms
    // (or its phases, verdict and lobby:closed keep arriving here) and its
    // watcher count. A seat this socket holds elsewhere is left alone.
    const prev = socket.data.code;
    if (prev && prev !== lobby.code) {
      const prevLobby = getLobby(prev);
      if (!prevLobby || !participantOf(prevLobby, socket.id)) {
        void socket.leave(prev);
        void socket.leave(`spec:${prev}`);
        dropSpectator(socket.id, prev);
      }
    }
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
    if (!allow(`misc:${socket.id}`, 60, 60_000)) return;
    const code = socket.data.code;
    if (!code) return;
    void socket.leave(code);
    void socket.leave(`spec:${code}`);
    dropSpectator(socket.id, code);
    socket.data.code = undefined;
  });

  socket.on('bot:start', async (p, cb) => {
    if (typeof cb !== 'function') return;
    if (!gate('solo', p, 20, 100)) return cb({ ok: false, error: 'rate_limited' });
    // A double-tapped Go, or a second start while a debate is still running
    // on this socket: one debate at a time, or the first one keeps spending
    // bot turns, a voice and a judge call, and files a loss.
    if (busy()) return cb({ ok: false, error: 'in_progress' });
    if (llmDown()) return cb({ ok: false, error: 'judge_down' });
    const name = nameOf(String(p?.name ?? '').trim());
    if (!nameAllowed(name)) return cb({ ok: false, error: 'bad_name' });
    // The placement match: the server picks the bot (whoever on the roster
    // is nearest 1400), and the client's botId is ignored so a stale roster
    // in an old tab cannot place someone against the wrong rung.
    const placement = p?.placement === true;
    const bot = placement ? placementBot() : BOT_BY_ID.get(String(p?.botId ?? ''));
    if (!bot || bot.hidden) return cb({ ok: false, error: 'not_found' });
    if (lobbyCount() >= MAX_LOBBIES) return cb({ ok: false, error: 'rate_limited' });

    // From here to the seat there are awaits (the id, the rating, the
    // campaign): the flag holds the door shut across them.
    socket.data.starting = true;
    try {
    // Campaign gate: the ladder is levels now. No playerId (old client) or a
    // downed store fails OPEN — a dead database must never brick training.
    // DORMANT unless CAMPAIGN_LOCKS=on (his call 2026-08-09: unlock everything
    // for now, same parking pattern as DISPUTE_MODE). Progress still records
    // while dormant, so wins earned in the open period count when locks return.
    const playerId = await resolveId(p?.playerId);
    if (!io.sockets.sockets.get(socket.id)) return;
    if (placement) {
      // Placement is ranked business, so the same account rule as the queue,
      // and the same identity: the ladder id, which for a signed-in player
      // is the account's and never the payload's.
      const refused = rankedRefusal(Boolean(socket.data.account), googleConfigured());
      if (refused) return cb({ ok: false, error: refused });
      if (!playerId) return cb({ ok: false, error: 'bad_name' });
      // One shot. A placement game already running for this id (a second
      // tab) is refused here; a finished one is refused by the store, whose
      // `placed` flag is the truth. With the store down the game still runs
      // (a dead database never bricks a debate) and simply sets nothing.
      // Only a placement that can still finish counts: one being debated, or
      // being judged by a judge that has not failed, with its player still
      // connected. A dead one (aborted, judge gave up, tab gone) must not
      // block the retry for the minutes it takes to be swept.
      const running = allLobbies().some(
        (l) =>
          l.placement?.playerId === playerId &&
          (l.status === 'in_debate' || (l.status === 'judging' && l.judgeState !== 'failed')) &&
          Boolean(l.host) &&
          !l.host?.disconnectedAt,
      );
      if (running) return cb({ ok: false, error: 'in_progress' });
      const standing = await getRating(playerId);
      if (standing?.placed) return cb({ ok: false, error: 'placed' });
      if (!io.sockets.sockets.get(socket.id)) return;
    }
    if (playerId && campaignLocksOn()) {
      const level = await getCampaign(playerId);
      if (level !== null && bot.rank > level) {
        return cb({ ok: false, error: 'locked' });
      }
      // The socket may have died while we read the level.
      if (!io.sockets.sockets.get(socket.id)) return;
    }
    // One player, one live seat: a second tab running a second bot game is
    // a second full set of model calls. Checked after the last await, so
    // nothing takes a seat between this and createLobby below.
    if (busyElsewhere(playerId, socket.id)) return cb({ ok: false, error: 'busy_elsewhere' });

    // Placement is played on ranked terms: a random motion, the coin deals
    // the sides, standard pace. Nothing about it is the player's pick.
    const topicMode =
      !placement && (p?.topicMode === 'agree' || p?.topicMode === 'category') ? p.topicMode : 'random';
    const lang = p?.lang === 'ar' ? 'ar' : 'en';
    // Placement is played on ranked terms, so at ranked's length.
    const pace = placement ? 'standard' : p?.pace === 'blitz' || p?.pace === 'long' ? p.pace : 'standard';

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
      !placement && (p?.side === 'FOR' || p?.side === 'AGAINST')
        ? p.side
        : Math.random() < 0.5
          ? 'FOR'
          : 'AGAINST';
    const botSide = humanSide === 'FOR' ? 'AGAINST' : 'FOR';

    releasePreviousSeat(socket);
    const lobby = createLobby(socket.id, String(p?.sessionId ?? '').slice(0, 64), name);
    // The same id the campaign rides: a guest's bot games are filed under the
    // device id (2026-09-12) so signing in later finds them.
    lobby.host!.playerId = playerId || undefined;
    Object.assign(lobby.host!, seatLook());
    lobby.pace = pace;
    lobby.bot = { id: bot.id, name: bot.name, difficulty: bot.difficulty, rank: bot.rank, side: botSide, lang };
    if (playerId) lobby.campaign = { playerId, botRank: bot.rank };
    if (placement && playerId) lobby.placement = { playerId };

    // BOT MATCHES ARE UNRATED, the same rule chess.com runs, and the reasons
    // are stronger here than the cold-start argument that briefly overrode
    // them. A bot is a FIXED strategy: Prudence never weighs impacts, so once you
    // learn that you beat Prudence forever with the same move and a rating would
    // climb while your debating did not. Elo assumes an opponent whose
    // strength is stable across all players, and a prompt is not. Worse, a bot
    // match has no witness, so rating movement against one is the cheapest
    // possible farm for anyone with a chatbot open in the next tab.
    // The bot ladder is a yardstick you measure yourself against, not a source
    // of rating. Ranked means humans.
    // The ONE exception (his call 2026-09-12) is the placement match above:
    // one game, against the bot nearest 1400, that sets a new player's
    // starting rating instead of three placement games nobody in a small
    // pool could find. It fires once per player, ever (store.placePlayer),
    // so neither argument comes back: you cannot farm a game you cannot
    // replay, and the fast K on the human games after it corrects whatever
    // the bot got wrong.
    socket.data.code = lobby.code;
    socket.data.role = 'host';
    void socket.join(lobby.code);
    // The code rides back so a socket blip mid-game can lobby:resume it.
    cb({ ok: true, code: lobby.code });
    startBotDebate(io, lobby, topic, humanSide);
    } finally {
      socket.data.starting = false;
    }
  });

  socket.on('campaign:get', (p, cb) => {
    if (typeof cb !== 'function') return;
    // Locks dormant: null reads as "no gate" on the client — no locked
    // cards, no tutorial-first banner.
    if (!campaignLocksOn()) return cb({ level: null });
    // Rate-limited like every other store-touching handler: this is a raw
    // SELECT keyed on a client-supplied id, and the pg pool is shared with
    // ELO and reports. Legit clients call it once per picker mount.
    if (!allow(`campget:${ipOf(socket)}`, 30, 60_000)) return cb({ level: null });
    void resolveId(p?.playerId).then((playerId) =>
      playerId ? getCampaign(playerId).then((level) => cb({ level })) : cb({ level: null }),
    );
  });

  // Report a human opponent. One per reporter per debate; bots can't be
  // reported. ok:false means "not recorded" — the client must say so.
  socket.on('report', (p, cb) => {
    if (typeof cb !== 'function') return;
    if (!allow(`report:${ipOf(socket)}`, 5, 10 * 60_000)) return cb({ ok: false });
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby || lobby.bot) return cb({ ok: false });
    const reporter = participantOf(lobby, socket.id);
    if (!reporter) return cb({ ok: false });
    const other = reporter === lobby.host ? lobby.guest : lobby.host;
    if (!other) return cb({ ok: false });
    const REASONS = new Set(['harassment', 'hate', 'cheating', 'other']);
    const reason = String(p?.reason ?? '');
    if (!REASONS.has(reason)) return cb({ ok: false });
    lobby.reportedBy ??= new Set();
    if (lobby.reportedBy.has(reporter.sessionId)) return cb({ ok: true }); // already filed
    lobby.reportedBy.add(reporter.sessionId);
    event('report_filed', { code: lobby.code, reason });
    void saveReport({
      code: lobby.code,
      mode: lobby.ranked ? 'ranked' : 'custom',
      reporterName: reporter.name,
      reportedName: other.name,
      reason,
      transcript: lobby.transcript,
    }).then((ok) => {
      if (!ok) lobby.reportedBy?.delete(reporter.sessionId); // let them retry
      cb({ ok });
    });
  });

  // The tutorial: a bots-mode debate against the hidden YapMaster teacher.
  // Fixed shape on purpose — student is always AGAINST (so the tutor demos
  // every round first), light practice motion, no judge at the end.
  socket.on('tutorial:start', async (p, cb) => {
    if (typeof cb !== 'function') return;
    if (!gate('solo', p, 20, 100)) return cb({ ok: false, error: 'rate_limited' });
    if (busy()) return cb({ ok: false, error: 'in_progress' });
    if (llmDown()) return cb({ ok: false, error: 'judge_down' });
    const name = nameOf(String(p?.name ?? '').trim());
    if (!nameAllowed(name)) return cb({ ok: false, error: 'bad_name' });
    const tutor = BOT_BY_ID.get('tutor');
    if (!tutor) return cb({ ok: false, error: 'not_found' });
    const lang = p?.lang === 'ar' ? 'ar' : 'en';
    const topic = TUTORIAL_TOPICS[Math.floor(Math.random() * TUTORIAL_TOPICS.length)];
    socket.data.starting = true;
    let playerId = '';
    try {
      playerId = await resolveId(p?.playerId);
    } finally {
      socket.data.starting = false;
    }
    if (!socket.connected) return;
    // One player, one live seat (the lesson is a full set of model calls too).
    if (busyElsewhere(playerId, socket.id)) return cb({ ok: false, error: 'busy_elsewhere' });
    if (lobbyCount() >= MAX_LOBBIES) return cb({ ok: false, error: 'rate_limited' });

    releasePreviousSeat(socket);
    const lobby = createLobby(socket.id, String(p?.sessionId ?? '').slice(0, 64), name);
    lobby.host!.playerId = playerId || undefined;
    Object.assign(lobby.host!, seatLook());
    lobby.tutorial = true;
    lobby.bot = { id: tutor.id, name: tutor.name, difficulty: tutor.difficulty, rank: tutor.rank, side: 'FOR', lang };
    if (playerId) lobby.campaign = { playerId, botRank: 0 };
    socket.data.code = lobby.code;
    socket.data.role = 'host';
    void socket.join(lobby.code);
    cb({ ok: true, code: lobby.code });
    startBotDebate(io, lobby, topic, 'AGAINST');
  });

  socket.on('bot:done', (p) => {
    if (!allow(`misc:${socket.id}`, 60, 60_000)) return;
    const lobby = socket.data.code ? getLobby(socket.data.code) : undefined;
    if (!lobby || !lobby.bot || lobby.status !== 'in_debate') return;
    if (participantOf(lobby, socket.id) !== lobby.host) return;
    const idx = Number(p?.stepIndex);
    // Only a turn the bot has actually taken (its bot:turn, or its failure,
    // has gone out). Before that, "the bot is done" is the human skipping
    // the bot's turn, and on the placement match that farmed a rating.
    if (!lobby.botSpoke.has(idx)) return;
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
      // Only the host sits in a waiting room, and their screen still shows
      // the code. The likeliest reason for the drop is that they went to send
      // it (a phone backgrounds the tab and the ping times out ~45 s later)
      // or the wifi blinked, so the room is NOT destroyed: it stays for the
      // rest of its waiting TTL (lobby.ts WAITING_TTL_MS; the sweep closes
      // it) and the same session takes it back with lobby:resume. A friend
      // who walks in meanwhile waits for them (lobby:join, HOST_AWAY_MS).
      me.disconnectedAt = Date.now();
      return;
    }

    if (lobby.status === 'greenroom') {
      // The host always gets the grace; so does a RANKED guest, and a ranked
      // room whose guest does not come back is closed rather than reopened.
      // Reopening it left the host alone in a one-seat ranked room with a
      // copyable code and a seat whose rating belongs to the player who left.
      if (isHost || lobby.ranked) {
        // A friend-room HOST gets the same window as a host who was already
        // away when the friend walked in (lobby:join, HOST_AWAY_MS): a phone
        // that backgrounded the tab to send the code often drops only after
        // the friend has arrived, and 15 s threw that friend out (2026-09-13
        // retest). The friend is told and shown the countdown. Ranked keeps
        // the short grace: a stranger should not wait two minutes.
        const windowMs = isHost && !lobby.ranked ? HOST_AWAY_MS : GRACE_MS;
        me.disconnectedAt = Date.now();
        if (me.graceTimer) clearTimeout(me.graceTimer);
        const peer = peerOf(lobby, socket.id);
        if (peer && !peer.disconnectedAt) {
          io.to(peer.socketId).emit('peer:connection', { state: 'lost', graceDeadline: Date.now() + windowMs });
        }
        me.graceTimer = setTimeout(() => {
          const l = getLobby(lobby.code);
          if (l !== lobby || !me.disconnectedAt || l.status !== 'greenroom') return;
          io.to(l.code).emit('lobby:closed', { reason: isHost ? 'closedHostLeft' : 'closedPeerLeft' });
          destroyLobby(l.code);
          io.socketsLeave(l.code);
        }, windowMs);
      } else {
        // Back to waiting, same code, and the host is told (the same path as
        // the guest pressing Leave).
        reopenAfterGuestLeft(lobby);
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
          // Ranked: the walk-out costs the leaver the game if the player who
          // stayed had been heard (judge.ts applyForfeit has the rule; the
          // launch coordinator's product call, 2026-09-12).
          if (lobby.ranked) void applyForfeit(lobby, me);
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
  // Everyone with something in flight: a debate, a verdict being written, a
  // green room, or a room still waiting for its guest.
  const live = allLobbies().filter(
    (l) => l.status === 'in_debate' || l.status === 'greenroom' || l.status === 'judging' || l.status === 'waiting',
  );
  // console.log directly as well as event(): the ring buffer dies with this
  // process, so Railway's log stream is the only durable record that the
  // handler ran at all.
  console.log(`[shutdown] ${signal} received, notifying ${live.length} live lobbies`);
  event('shutdown', { signal, liveLobbies: live.length });
  for (const lobby of live) {
    // Not abort(): that keeps the lobby around for a re-fetch that this process
    // will not be alive to serve. Say it plainly and let the client reset.
    // A waiting room never started a debate, so it is closed, not aborted.
    if (lobby.status === 'waiting') io.to(lobby.code).emit('lobby:closed', { reason: 'serverRestart' });
    else io.to(lobby.code).emit('debate:aborted', { reason: 'serverRestart' });
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
