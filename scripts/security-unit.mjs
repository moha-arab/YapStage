// Unit checks for the security and privacy guarantees.
// No server needed: it imports the build (npm run build -w server first).
//
//   node scripts/security-unit.mjs
//
// The live half (headers, guest names, audio limits, the room cap, relay-only
// ranked signalling, the keyed routes) is in scripts/smoke.mjs, Scenario 18.
process.env.LLM_HOURLY_CAP = '3'; // read per call; set before anything spends
delete process.env.STATS_KEY;

import Fastify from 'fastify';
import { pathToFileURL } from 'node:url';

// The compiled server. YAP_UNIT_DIST points the checks at another build (a
// scratch `tsc --outDir`) so they can run without rebuilding server/dist
// while a server is running from it.
const DIST = process.env.YAP_UNIT_DIST
  ? pathToFileURL(process.env.YAP_UNIT_DIST.replace(/[\\/]*$/, '/')).href
  : new URL('../server/dist/', import.meta.url).href;

let failures = 0;
function check(name, cond, detail = '') {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${!cond && detail ? `\n       ${detail}` : ''}`);
}

const sec = await import(DIST + 'security.js');
const { GUEST_NAME_RE } = await import(DIST + 'protocol.js');
const { matchRowsFor } = await import(DIST + 'judge.js');
const { cardFrom, renderCard } = await import(DIST + 'share.js');
const llm = await import(DIST + 'llm.js');
const { errTag } = await import(DIST + 'stats.js');

console.log('\n=== typed speech in ranked ===');
check('ranked + server STT: typed chunks refused', sec.typedSpeechAllowed(true, true) === false);
check('ranked without server STT: typed chunks still count', sec.typedSpeechAllowed(true, false) === true);
check('friend rooms and bots: typed chunks count', sec.typedSpeechAllowed(false, true) && sec.typedSpeechAllowed(false, false));

console.log('\n=== guest identity ===');
check('guest name: GuestNNNN accepted', GUEST_NAME_RE.test('Guest1234') && GUEST_NAME_RE.test('Guest0000'));
check(
  'guest name: anything else refused',
  ['guest1234', 'Guest123', 'Guest12345', 'zorvint', 'Guest1234 ', ' Guest1234', 'GUEST1234', 'Guest12a4'].every((n) => !GUEST_NAME_RE.test(n)),
);
check('guest id: a device uuid is fine', sec.guestIdShapeOk('3f1c2a9e-8d7b-4c1e-9f00-1234567890ab'));
check(
  'guest id: account-shaped, empty, odd or long ids are refused',
  ['acct_1234', 'ACCT_x', '', 'a b', 'x'.repeat(65), 'id;drop'].every((id) => !sec.guestIdShapeOk(id)),
);

console.log('\n=== coach history (re-opened match) ===');
const turn = (role, content = `${role} says something`) => ({ role, content });
const pairs = (n) => Array.from({ length: n }, (_, i) => [turn('user', `q${i}`), turn('assistant', `a${i}`)]).flat();
check('coach: no history is an empty history', JSON.stringify(sec.coachHistory(undefined)) === '[]');
check('coach: two exchanges pass as they are', sec.coachHistory(pairs(2))?.length === 4);
check('coach: five exchanges keep the last eight turns, starting with the debater', (() => {
  const h = sec.coachHistory(pairs(5));
  return h?.length === 8 && h[0].content === 'q1' && h[7].content === 'a4';
})());
check('coach: a history that starts with the coach is refused', sec.coachHistory([turn('assistant'), turn('user')]) === null);
check('coach: an odd-length history is refused', sec.coachHistory([turn('user')]) === null);
check('coach: two turns in a row by the same side are refused', sec.coachHistory([turn('user'), turn('user')]) === null);
check('coach: a non-string line is refused', sec.coachHistory([turn('user'), { role: 'assistant', content: 42 }]) === null);
check('coach: a line over 1200 characters is refused', sec.coachHistory([turn('user', 'x'.repeat(1201)), turn('assistant')]) === null);
check('coach: a system role is refused', sec.coachHistory([turn('system'), turn('assistant')]) === null);
check('coach: more than 16 raw turns are refused', sec.coachHistory(pairs(9)) === null);
check('coach: a non-array is refused', sec.coachHistory('hello') === null && sec.coachHistory({}) === null);

console.log('\n=== relay-only ranked signalling ===');
const host = { candidate: { candidate: 'candidate:1 1 udp 2122260223 192.168.1.20 54400 typ host generation 0', sdpMid: '0', sdpMLineIndex: 0 } };
const srflx = { candidate: { candidate: 'candidate:2 1 udp 1686052607 81.2.69.160 54400 typ srflx raddr 192.168.1.20 rport 54400', sdpMid: '0' } };
const relay = { candidate: { candidate: 'candidate:3 1 udp 41885439 104.30.1.1 3478 typ relay raddr 81.2.69.160 rport 54400', sdpMid: '0' } };
check('ice: a host candidate is dropped', sec.relayOnlySignal(host) === null);
check('ice: a srflx candidate is dropped', sec.relayOnlySignal(srflx) === null);
const relayOut = sec.relayOnlySignal(relay);
check(
  'ice: a relay candidate passes, its related address (the public IP) zeroed',
  relayOut?.candidate?.candidate === 'candidate:3 1 udp 41885439 104.30.1.1 3478 typ relay raddr 0.0.0.0 rport 0' &&
    relayOut.candidate.sdpMid === '0',
  JSON.stringify(relayOut),
);
check(
  'ice: only the four candidate fields ride along',
  (() => {
    const out = sec.relayOnlySignal({ candidate: { ...relay.candidate, sdpMLineIndex: 0, relatedAddress: '81.2.69.160' } });
    return Boolean(out) && !JSON.stringify(out).includes('81.2.69.160') && out.candidate.sdpMLineIndex === 0;
  })(),
);
check('ice: end-of-candidates passes', sec.relayOnlySignal({ candidate: { candidate: '' } }) !== null);
const sdp = [
  'v=0',
  'o=- 1 2 IN IP4 127.0.0.1',
  'm=audio 54400 UDP/TLS/RTP/SAVPF 111',
  'c=IN IP4 81.2.69.160',
  'a=rtcp:9 IN IP4 81.2.69.160',
  'a=candidate:1 1 udp 2122260223 192.168.1.20 54400 typ host generation 0',
  'a=candidate:3 1 udp 41885439 104.30.1.1 3478 typ relay raddr 81.2.69.160 rport 54400',
  '',
].join('\r\n');
const cleaned = sec.relayOnlySignal({ description: { type: 'offer', sdp } })?.description?.sdp ?? '';
check(
  'sdp: host candidate lines and default addresses are stripped, relay kept',
  !cleaned.includes('192.168.1.20 54400 typ host') &&
    !/c=IN IP4 81\.2\.69\.160/.test(cleaned) &&
    !/a=rtcp:9 IN IP4 81\.2\.69\.160/.test(cleaned) &&
    cleaned.includes('typ relay') &&
    cleaned.includes('\r\n'),
  cleaned,
);
check(
  'sdp: a relay line keeps no related address (raddr/rport zeroed)',
  !cleaned.includes('81.2.69.160') && cleaned.includes('typ relay raddr 0.0.0.0 rport 0'),
  cleaned,
);

console.log('\n=== user text is safe to store ===');
{
  check('text: a NUL is removed from a typed chunk', sec.cleanLine('I said\u0000 this', 600) === 'I said this');
  check(
    'text: other C0 and C1 controls go too, line breaks fold to one space',
    sec.cleanLine('a\u0007b\u009Bc\r\n\td', 600) === 'abc d',
    JSON.stringify(sec.cleanLine('a\u0007b\u009Bc\r\n\td', 600)),
  );
  check('text: bidi overrides are removed from a line', sec.cleanLine('\u202Eevil\u202C', 600) === 'evil');
  check('text: a cap through an emoji leaves no half of it', sec.cleanLine('ab\u{1F600}', 3) === 'ab');
  check('text: a lone surrogate half is removed', sec.stripControl('x\uD800y\uDC00z') === 'xyz');
  check('text: whole emoji and Arabic survive', sec.cleanLine('نعم \u{1F600}', 50) === 'نعم \u{1F600}');
  check('text: stored text keeps its line breaks', sec.stripControl('one\ntwo\u0000') === 'one\ntwo');
  check('text: a settle-it account keeps its paragraphs', sec.cleanBlock(' first\n\nsecond\u0000 ', 400) === 'first\n\nsecond');
  const json = JSON.stringify({ t: sec.cleanLine('a\u0000\uD83D', 10) });
  check('text: what reaches jsonb has no NUL escape and no half surrogate', !json.includes('\\u0000') && !/\\ud[89ab]/i.test(json), json);
}

console.log('\n=== 404s and the legal pages ===');
check('404: a browser GET gets the page', sec.wantsHtml404('GET', 'text/html,application/xhtml+xml'));
check('404: a browser HEAD gets it too', sec.wantsHtml404('HEAD', 'text/html'));
check(
  '404: an API call, a POST or no Accept gets JSON',
  !sec.wantsHtml404('GET', 'application/json') && !sec.wantsHtml404('POST', 'text/html') && !sec.wantsHtml404('GET', undefined),
);
{
  // The same route and handler shapes index.ts registers, on a real Fastify.
  const { createReadStream } = await import('node:fs');
  const { fileURLToPath } = await import('node:url');
  const app = Fastify();
  for (const page of ['/privacy', '/terms']) {
    app.get(page, async () => 'legal');
    app.get(`${page}/`, async (_req, reply) => reply.redirect(page, 301));
  }
  app.setNotFoundHandler((req, reply) =>
    sec.wantsHtml404(req.method, req.headers.accept)
      ? reply.code(404).type('text/html; charset=utf-8').send(createReadStream(fileURLToPath(import.meta.url)))
      : reply.code(404).send({ error: 'Not Found' }),
  );
  await app.ready();
  const slash = await app.inject({ url: '/privacy/' });
  check('legal: /privacy/ is a 301 to /privacy', slash.statusCode === 301 && slash.headers.location === '/privacy', `${slash.statusCode} ${slash.headers.location}`);
  const tslash = await app.inject({ url: '/terms/' });
  check('legal: /terms/ is a 301 to /terms', tslash.statusCode === 301 && tslash.headers.location === '/terms');
  check('legal: /privacy itself still answers', (await app.inject({ url: '/privacy' })).statusCode === 200);
  const head = await app.inject({ method: 'HEAD', url: '/nope', headers: { accept: 'text/html' } });
  check(
    '404: HEAD with Accept text/html is the HTML 404',
    head.statusCode === 404 && String(head.headers['content-type']).startsWith('text/html'),
    `${head.statusCode} ${head.headers['content-type']} body ${head.body.length}`,
  );
  const get = await app.inject({ url: '/nope', headers: { accept: 'text/html' } });
  check('404: GET with Accept text/html is the HTML 404', get.statusCode === 404 && String(get.headers['content-type']).startsWith('text/html') && get.body.length > 0);
  const api = await app.inject({ url: '/nope', headers: { accept: 'application/json' } });
  check('404: an API miss is still JSON', api.statusCode === 404 && api.json().error === 'Not Found');
  await app.close();
}

console.log('\n=== ranked needs a relay ===');
{
  const turn = await import(DIST + 'turn.js');
  const keys = ['CF_TURN_KEY_ID', 'CF_TURN_API_TOKEN', 'TURN_URLS', 'TURN_USERNAME', 'TURN_CREDENTIAL'];
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  for (const k of keys) delete process.env[k];
  await turn.refreshIceServers();
  check('relay: STUN only is no relay (queue:join answers no_relay)', turn.relayAvailable() === false && turn.turnMode() === 'stun-only');
  Object.assign(process.env, { TURN_URLS: 'turn:relay.example.com:3478?transport=udp', TURN_USERNAME: 'u', TURN_CREDENTIAL: 'c' });
  await turn.refreshIceServers();
  check('relay: a TURN server with credentials is a relay', turn.relayAvailable() === true);
  for (const k of keys) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  await turn.refreshIceServers();
}

console.log('\n=== lobbies: one live seat, the guest leaving, cleanup ===');
{
  const lob = await import(DIST + 'lobby.js');
  const destroyed = [];
  lob.setOnLobbyDestroyed((code) => destroyed.push(code));
  const l = lob.createLobby('sock-h', 'sess-h', 'Guest1111');
  l.host.playerId = 'pid-one';
  check('seat: a waiting room is not a live seat', lob.liveSeatOf('pid-one', 'sock-other') === undefined);
  l.guest = { socketId: 'sock-g', sessionId: 'sess-g', name: 'Guest2222', avatarId: 'guest', masked: true, rtcReady: true, playerId: 'pid-two' };
  l.status = 'greenroom';
  check('seat: a green room is, seen from another tab', lob.liveSeatOf('pid-one', 'sock-other') === l);
  check('seat: but not from the tab that holds it', lob.liveSeatOf('pid-one', 'sock-h') === undefined);
  check('seat: no id is never busy', lob.liveSeatOf('', 'x') === undefined && lob.liveSeatOf(undefined, 'x') === undefined);
  Object.assign(l, { status: 'judging', judgeState: 'failed' });
  check('seat: a verdict the judge gave up on holds nobody', lob.liveSeatOf('pid-two', 'x') === undefined);
  Object.assign(l, { status: 'in_debate', judgeState: 'idle' });
  check('seat: a debate does', lob.liveSeatOf('pid-two', 'x') === l);
  Object.assign(l, { status: 'verdict' });
  check('seat: a finished one does not', lob.liveSeatOf('pid-two', 'x') === undefined);
  // The guest walks out of the green room.
  Object.assign(l, { status: 'greenroom', topicMode: 'agree', waitingSince: 0 });
  Object.assign(l.pick, { hostTopicId: 't1', guestTopicId: 't1', hostConfirmed: true, guestConfirmed: true, guestDispute: 'x' });
  l.host.rtcReady = true;
  const code = l.code;
  lob.reopenForNextGuest(l);
  check('guest left: the room waits again under the same code', lob.getLobby(code) === l && l.status === 'waiting' && !l.guest);
  check(
    "guest left: confirmations and the host's WebRTC readiness reset, the host's motion kept",
    !l.pick.hostConfirmed && !l.pick.guestConfirmed && l.host.rtcReady === false && l.pick.hostTopicId === 't1' && l.pick.guestTopicId === 't1' && l.pick.guestDispute === null,
  );
  check('guest left: the ten-minute wait starts again', l.waitingSince > 0);
  lob.destroyLobby(code);
  lob.destroyLobby(code);
  check('cleanup: every destroy tells index.ts, once (spectator list, spec room)', destroyed.length === 1 && destroyed[0] === code && lob.getLobby(code) === undefined);
  lob.setOnLobbyDestroyed(null);
}

console.log('\n=== stats key ===');
check('stats: no STATS_KEY configured means no keyed route', sec.statsKeyOk('anything', '10.0.0.1') === false);
process.env.STATS_KEY = 'unit-key';
check('stats: the right header passes', sec.statsKeyOk('unit-key', '10.0.0.2') === true);
check('stats: a wrong header fails', sec.statsKeyOk('unit-kex', '10.0.0.2') === false);
check('stats: a missing header fails', sec.statsKeyOk(undefined, '10.0.0.2') === false);
for (let i = 0; i < 12; i++) sec.statsKeyOk(`guess-${i}`, '10.0.0.3');
check('stats: ten wrong guesses lock the address out, right key included', sec.statsKeyOk('unit-key', '10.0.0.3') === false);
check('stats: another address is unaffected', sec.statsKeyOk('unit-key', '10.0.0.4') === true);
delete process.env.STATS_KEY;

console.log('\n=== headers ===');
check('csp: scripts from this origin only (no inline, no eval)', /script-src 'self'(;|$)/.test(sec.CSP) && !sec.CSP.includes('unsafe-eval'));
check('csp: no framing', sec.CSP.includes("frame-ancestors 'none'") && sec.SECURITY_HEADERS['X-Frame-Options'] === 'DENY');
check('csp: objects off, base pinned', sec.CSP.includes("object-src 'none'") && sec.CSP.includes("base-uri 'self'"));
check('permissions: camera and mic for this origin, no geolocation', sec.SECURITY_HEADERS['Permissions-Policy'] === 'camera=(self), microphone=(self), geolocation=()');

console.log('\n=== trustProxy: one hop ===');
{
  const app = Fastify({ trustProxy: sec.trustOneHop });
  app.get('/who', async (req) => ({ ip: req.ip, protocol: req.protocol }));
  await app.ready();
  const a = await app.inject({ url: '/who', headers: { 'x-forwarded-for': '203.0.113.9', 'x-forwarded-proto': 'https' } });
  const who = a.json();
  check('proxy: req.ip is the address the edge saw', who.ip === '203.0.113.9', JSON.stringify(who));
  check('proxy: req.protocol honours X-Forwarded-Proto', who.protocol === 'https', JSON.stringify(who));
  const b = (await app.inject({ url: '/who', headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.9' } })).json();
  check('proxy: a client-written X-Forwarded-For entry is ignored', b.ip === '203.0.113.9', JSON.stringify(b));
  await app.close();
}

console.log('\n=== filed matches keep the transcript ===');
{
  const verdict = {
    winner: 'FOR',
    summary: 'x',
    scores: { FOR: { argument: 20, evidence: 10, clash: 20, delivery: 10 }, AGAINST: { argument: 10, evidence: 5, clash: 10, delivery: 5 } },
    bestQuote: { FOR: 'my own best line', AGAINST: 'the opponent said this' },
    feedback: { FOR: ['a', 'b'], AGAINST: ['c', 'd'] },
    injectionDetected: false,
  };
  const lobby = {
    code: 'UNIT01',
    sides: { host: 'FOR', guest: 'AGAINST' },
    host: { name: 'Guest1111', playerId: 'pid-host' },
    guest: { name: 'Guest2222', playerId: 'pid-guest' },
    // Out of order on purpose: the row is filed in speaking order.
    transcript: [
      { stepIndex: 1, side: 'AGAINST', text: 'their reply', at: 2 },
      { stepIndex: 0, side: 'FOR', text: 'secret words', at: 1 },
    ],
    topic: { en: 'a motion' },
    pace: 'blitz',
  };
  const rows = matchRowsFor(lobby, verdict);
  const hostRow = rows.find((r) => r.playerId === 'pid-host');
  const guestRow = rows.find((r) => r.playerId === 'pid-guest');
  check('match rows: one per human seat', rows.length === 2);
  check(
    'match rows: each copy carries the whole transcript, both sides',
    rows.every((r) => Array.isArray(r.transcript) && r.transcript.length === 2) &&
      rows.every((r) => r.transcript.some((e) => e.text === 'secret words') && r.transcript.some((e) => e.text === 'their reply')),
  );
  check(
    'match rows: the transcript is in speaking order, step, side and words only',
    hostRow?.transcript[0].stepIndex === 0 &&
      hostRow?.transcript[1].side === 'AGAINST' &&
      hostRow.transcript.every((e) => Object.keys(e).sort().join() === 'side,stepIndex,text'),
  );
  check('match rows: the live transcript is not reordered', lobby.transcript[0].text === 'their reply');
  check(
    'match rows: each keeps only its OWN best line',
    hostRow?.verdict.bestQuote.FOR === 'my own best line' &&
      hostRow?.verdict.bestQuote.AGAINST === '' &&
      guestRow?.verdict.bestQuote.AGAINST === 'the opponent said this' &&
      guestRow?.verdict.bestQuote.FOR === '',
  );
  check('match rows: feedback and scores are kept', hostRow?.verdict.feedback.FOR.length === 2 && hostRow?.myTotal === 60);
  check('match rows: nothing moved, so not rated', rows.every((r) => r.rated === false));
  check('match rows: the live verdict object is not mutated', verdict.bestQuote.AGAINST === 'the opponent said this');

  console.log('\n=== share cards carry only the sharer\'s words ===');
  const card = cardFrom('a motion', { FOR: 'Guest1111', AGAINST: 'Guest2222' }, verdict, undefined, 'FOR');
  check('card: the sharer\'s own quote is on it', card.qa === 'my own best line');
  check('card: the opponent\'s quote is not', card.qb === undefined);
  const html = renderCard(card, 'https://www.yapstage.com', 'abcdefgh');
  check('card page: noindex, og:url on the fixed origin', html.includes('name="robots" content="noindex"') && html.includes('og:url" content="https://www.yapstage.com/v/abcdefgh"'));
  check('card page: the opponent\'s words never reach the HTML', !html.includes('the opponent said this'));
  check('card page: the house palette, gold for the winner only', html.includes('--bg:#16172B') && html.includes('class="win"'));
  const theirs = cardFrom('a motion', { FOR: 'Guest1111', AGAINST: 'Guest2222' }, verdict, undefined, 'AGAINST');
  check('card: shared by the other side, the mirror image', theirs.qb === 'the opponent said this' && theirs.qa === undefined);

  // The real saveMatch / loadMatch / listMatches SQL against a stand-in
  // database: pg's query is swapped for a tiny in-memory matches table that
  // answers with exactly the columns each SELECT names, so a transcript left
  // out of loadMatch's column list, or a WHERE that drops the player id,
  // fails here.
  console.log('\n=== saved transcript: the owner reads it, nobody else ===');
  const { createRequire } = await import('node:module');
  const pg = createRequire(new URL('store.js', DIST))('pg');
  const table = [];
  const pick = (sql, row) =>
    Object.fromEntries(
      sql
        .match(/SELECT\s+(.*?)\s+FROM/s)[1]
        .split(',')
        .map((c) => c.trim())
        .map((c) => [c, row[c]]),
    );
  pg.Pool.prototype.query = async function (sql, params = []) {
    const q = String(sql);
    if (/INSERT INTO matches/.test(q)) {
      const [player_id, mode, topic, my_side, won, my_total, their_total, opponent, rated, pace, v, tr] = params;
      table.push({
        id: table.length + 1,
        player_id, mode, topic, my_side, won, my_total, their_total, opponent, rated, pace,
        verdict: JSON.parse(v),
        transcript: JSON.parse(tr),
        at: new Date().toISOString(),
      });
      return { rows: [], rowCount: 1 };
    }
    if (/FROM matches WHERE id = \$1 AND player_id = \$2/.test(q)) {
      const hit = table.filter((r) => r.id === params[0] && r.player_id === params[1]).map((r) => pick(q, r));
      return { rows: hit, rowCount: hit.length };
    }
    if (/FROM matches WHERE player_id = \$1/.test(q)) {
      const hit = table.filter((r) => r.player_id === params[0]).map((r) => pick(q, r));
      return { rows: hit, rowCount: hit.length };
    }
    return { rows: [], rowCount: 0 };
  };
  process.env.DATABASE_URL = 'postgres://localhost/unit-fake';
  const store = await import(DIST + 'store.js');
  const logs = console.log;
  console.log = () => {}; // initStore narrates every migration
  await store.initStore();
  console.log = logs;
  check('store: the stand-in database came up', store.storeReady());
  for (const r of rows) await store.saveMatch(r);
  const hostId = table.find((r) => r.player_id === 'pid-host')?.id;
  const guestId = table.find((r) => r.player_id === 'pid-guest')?.id;
  const own = await store.loadMatch('pid-host', hostId);
  check(
    'store: the owner re-opens the match with the whole transcript',
    Array.isArray(own?.transcript) && own.transcript.length === 2 && own.transcript[0].text === 'secret words',
  );
  check(
    'store: another player id cannot read it',
    (await store.loadMatch('pid-guest', hostId)) === null && (await store.loadMatch('pid-stranger', hostId)) === null,
  );
  const theirCopy = await store.loadMatch('pid-guest', guestId);
  check(
    'store: the opponent reads their own copy, with the same transcript',
    theirCopy?.transcript.length === 2 && theirCopy.my_side === 'AGAINST',
  );
  check('store: re-opened, the opponent\'s best line is still blank', own?.verdict.bestQuote.AGAINST === '');
  const list = await store.listMatches('pid-host');
  check('store: the history list never ships a transcript', list.length === 1 && list.every((r) => !('transcript' in r)));

  // applyRankedResult on a stand-in connection whose FOR UPDATE really
  // waits: the second transaction blocks until the first commits, like
  // Postgres. Without the lock (the old code) both read 1000.
  console.log('\n=== ranked results under concurrency ===');
  {
    const ladder = new Map([
      ['pid-a', { id: 'pid-a', rating: 1000, wins: 0, losses: 0 }],
      ['pid-b', { id: 'pid-b', rating: 1000, wins: 0, losses: 0 }],
    ]);
    const conns = [];
    let lockTail = Promise.resolve();
    let failUpdates = false;
    const realConnect = pg.Pool.prototype.connect;
    pg.Pool.prototype.connect = async function () {
      const conn = { log: [], released: false };
      conns.push(conn);
      let unlock = null;
      return {
        async query(sql, params = []) {
          const q = String(sql).replace(/\s+/g, ' ').trim();
          if (q === 'BEGIN') {
            conn.log.push('BEGIN');
            return { rows: [], rowCount: 0 };
          }
          if (q === 'COMMIT' || q === 'ROLLBACK') {
            conn.log.push(q);
            unlock?.();
            unlock = null;
            return { rows: [], rowCount: 0 };
          }
          if (/^SELECT .* FROM players WHERE id = ANY\(\$1\) ORDER BY id FOR UPDATE$/.test(q)) {
            conn.log.push('SELECT FOR UPDATE');
            const prev = lockTail;
            lockTail = new Promise((r) => (unlock = r));
            await prev;
            await new Promise((r) => setTimeout(r, 10)); // a slow read widens the race
            const rows = params[0].map((id) => ladder.get(id)).filter(Boolean).map((r) => ({ ...r }));
            return { rows, rowCount: rows.length };
          }
          if (q.startsWith('UPDATE players SET rating = $2')) {
            conn.log.push('UPDATE');
            if (failUpdates) throw new Error('unit: write failed');
            const r = ladder.get(params[0]);
            r.rating = params[1];
            if (q.includes('wins = wins + 1')) r.wins += 1;
            if (q.includes('losses = losses + 1')) r.losses += 1;
            return { rows: [], rowCount: 1 };
          }
          conn.log.push(`?? ${q.slice(0, 40)}`);
          return { rows: [], rowCount: 0 };
        },
        release() {
          conn.released = true;
        },
      };
    };
    const logs2 = console.error;
    console.error = () => {}; // the failure case below logs on purpose
    const [e1, e2] = await Promise.all([store.applyRankedResult('pid-a', 'pid-b'), store.applyRankedResult('pid-a', 'pid-b')]);
    check(
      'elo: two results for the same pair at once both count (the second reads what the first wrote)',
      Boolean(e1 && e2) &&
        e2.winner.before === e1.winner.after &&
        e2.loser.before === e1.loser.after &&
        ladder.get('pid-a').wins === 2 &&
        ladder.get('pid-b').losses === 2 &&
        ladder.get('pid-a').rating === e2.winner.after,
      JSON.stringify({ e1, e2, a: ladder.get('pid-a'), b: ladder.get('pid-b') }),
    );
    check(
      'elo: each is BEGIN, a locked read, two writes, COMMIT, and the connection goes back',
      conns.length === 2 && conns.every((c) => c.log.join() === 'BEGIN,SELECT FOR UPDATE,UPDATE,UPDATE,COMMIT' && c.released),
      JSON.stringify(conns),
    );
    failUpdates = true;
    const before = ladder.get('pid-a').rating;
    const e3 = await store.applyRankedResult('pid-a', 'pid-b');
    const c3 = conns[2];
    console.error = logs2;
    check(
      'elo: a failed write rolls back, answers null and releases the connection',
      e3 === null && c3?.log.at(-1) === 'ROLLBACK' && c3.released && ladder.get('pid-a').rating === before,
      JSON.stringify(c3),
    );
    pg.Pool.prototype.connect = realConnect;
  }

  console.log('\n=== a NUL in the words no longer loses the match ===');
  {
    const NUL = String.fromCharCode(0);
    const HALF = String.fromCharCode(0xd83d);
    await store.saveMatch({
      ...hostRow,
      playerId: 'pid-nul',
      topic: `a motion${NUL}`,
      transcript: [{ stepIndex: 0, side: 'FOR', text: `typed${NUL} words ${HALF}` }],
      verdict: { ...hostRow.verdict, summary: `ruled${NUL}` },
    });
    const row = table.find((r) => r.player_id === 'pid-nul');
    const txt = JSON.stringify(row ?? null);
    check(
      'store: the row is filed, the NUL and the half surrogate gone',
      Boolean(row) &&
        row.topic === 'a motion' &&
        row.transcript[0].text === 'typed words ' &&
        row.verdict.summary === 'ruled' &&
        !txt.includes('\\u0000'),
      txt,
    );
  }

  // Sign-in keeps a verified email, and only its owner ever gets it back.
  // The same stand-in, grown accounts, players and friends tables; the
  // matches table above stays and answers everything else.
  console.log('\n=== sign-in keeps a verified email, owner only ===');
  const auth = await import(DIST + 'auth.js');
  const { PACES } = await import(DIST + 'protocol.js');
  check('email: a verified address is kept, trimmed', auth.verifiedEmail({ email: ' a@b.co ', email_verified: true }) === 'a@b.co');
  check('email: the string "true" some tokens carry counts as verified', auth.verifiedEmail({ email: 'a@b.co', email_verified: 'true' }) === 'a@b.co');
  check(
    'email: unverified, missing, malformed or oversized is not kept',
    [
      { email: 'a@b.co', email_verified: false },
      { email: 'a@b.co' },
      { email_verified: true },
      { email: 'not an email', email_verified: true },
      { email: 42, email_verified: true },
      { email: `${'x'.repeat(250)}@b.co`, email_verified: true },
    ].every((c) => auth.verifiedEmail(c) === ''),
  );

  const accounts = new Map();
  const players = new Map();
  const friendRows = [];
  const matchesOnly = pg.Pool.prototype.query;
  pg.Pool.prototype.query = async function (sql, params = []) {
    const q = String(sql).replace(/\s+/g, ' ').trim();
    const one = (row) => (row ? { rows: [pick(q, row)], rowCount: 1 } : { rows: [], rowCount: 0 });
    if (q.startsWith('INSERT INTO players (id, name) VALUES')) {
      if (!players.has(params[0])) players.set(params[0], { id: params[0], name: 'player', campaign: 0, placed: false, updated_at: new Date() });
      return { rows: [], rowCount: 1 };
    }
    if (q.startsWith('INSERT INTO accounts')) {
      const [sub, player_id, email, drill_last, drill_streak, drill_best] = params;
      if (accounts.has(sub)) return { rows: [], rowCount: 0 };
      accounts.set(sub, {
        sub, player_id, email, drill_last, drill_streak, drill_best,
        username: null, username_changed_at: null, mask: null, mask_default: false,
        created_at: new Date(), seen_at: new Date(),
      });
      return { rows: [], rowCount: 1 };
    }
    if (q.startsWith('UPDATE accounts SET email = $2')) {
      const row = accounts.get(params[0]);
      if (row) Object.assign(row, { email: params[1], seen_at: new Date() });
      return { rows: [], rowCount: row ? 1 : 0 };
    }
    if (/FROM accounts WHERE sub = \$1$/.test(q)) return one(accounts.get(params[0]));
    if (/FROM players WHERE id = \$1$/.test(q)) return one(players.get(params[0]));
    if (q.includes('FROM friends f JOIN accounts a')) {
      const me = params[0];
      const hit = friendRows
        .filter((f) => f.lo_sub === me || f.hi_sub === me)
        .map((f) => ({ f, other: accounts.get(f.lo_sub === me ? f.hi_sub : f.lo_sub) }))
        .filter(({ other }) => other?.username)
        .map(({ f, other }) => ({ status: f.status, asked_by: f.asked_by, username: other.username }));
      return { rows: hit, rowCount: hit.length };
    }
    return matchesOnly.call(this, sql, params);
  };

  const day = '2026-09-13';
  const first = await store.linkAccount({ sub: 'sub-me', claimPlayerId: null, day, drill: null, email: 'first@example.com' });
  check('email: a first sign-in stores the verified address', first?.playerId === 'acct_sub-me' && accounts.get('sub-me')?.email === 'first@example.com');
  await store.linkAccount({ sub: 'sub-me', claimPlayerId: null, day, drill: null, email: 'moved@example.com' });
  check('email: the next sign-in refreshes it', accounts.get('sub-me')?.email === 'moved@example.com');
  await store.linkAccount({ sub: 'sub-me', claimPlayerId: null, day, drill: null, email: '' });
  check('email: a sign-in without a verified address clears the old one', accounts.get('sub-me')?.email === '');
  const back = await store.linkAccount({ sub: 'sub-me', claimPlayerId: null, day, drill: null, email: 'moved@example.com' });
  check('email: the identity stays the sub (one account, same player row)', accounts.size === 1 && back?.playerId === 'acct_sub-me');
  check('email: the owner\'s locker reads it back for /auth/me', (await store.getLocker('sub-me')).email === 'moved@example.com');

  console.log('\n=== download my data ===');
  Object.assign(accounts.get('sub-me'), { username: 'unitme', mask: 'bally', drill_last: new Date(2026, 8, 12), drill_streak: 4, drill_best: 71 });
  for (const [sub, username] of [['sub-pal', 'unitpal'], ['sub-asker', 'unitasker'], ['sub-waiting', 'unitwait']]) {
    accounts.set(sub, { sub, player_id: `acct_${sub}`, email: `${username}@example.com`, username, created_at: new Date(), seen_at: new Date() });
  }
  friendRows.push(
    { lo_sub: 'sub-me', hi_sub: 'sub-pal', status: 'accepted', asked_by: 'sub-pal' },
    { lo_sub: 'sub-asker', hi_sub: 'sub-me', status: 'pending', asked_by: 'sub-asker' },
    { lo_sub: 'sub-me', hi_sub: 'sub-waiting', status: 'pending', asked_by: 'sub-me' },
  );
  await store.saveMatch({ ...hostRow, playerId: 'acct_sub-me', opponent: 'unitpal' });
  await store.saveMatch({ ...guestRow, playerId: 'acct_sub-pal', opponent: 'unitme' });
  const exp = await store.exportAccountData('sub-me');
  const expText = JSON.stringify(exp);
  check(
    'export: the account row, with the email and the drill streak',
    exp?.account?.googleAccountId === 'sub-me' &&
      exp.account.username === 'unitme' &&
      exp.account.email === 'moved@example.com' &&
      exp.account.mask === 'bally' &&
      exp.account.drill.lastDay === '2026-09-12' &&
      exp.account.drill.streak === 4 &&
      exp.account.drill.best === 71,
    JSON.stringify(exp?.account),
  );
  check(
    'export: a rating for every pace, and the placement state',
    Boolean(exp?.ladder) && PACES.every((p) => typeof exp.ladder.ratings[p]?.rating === 'number') && exp.ladder.placed === false,
    JSON.stringify(exp?.ladder),
  );
  check(
    'export: only their own match, with the whole transcript',
    exp?.matches.length === 1 && exp.matches[0].transcript.length === 2 && exp.matches[0].yourSide === 'FOR' && exp.matches[0].opponent === 'unitpal',
  );
  check('export: the opponent\'s best line stays blank', exp?.matches[0].verdict.bestQuote.AGAINST === '');
  check('export: friends are a yap name and a status, nothing else', exp?.friends.length === 3 && exp.friends.every((f) => Object.keys(f).sort().join() === 'status,username'));
  const st = (u) => exp?.friends.find((f) => f.username === u)?.status;
  check('export: each request reads the right way round', st('unitpal') === 'friends' && st('unitasker') === 'request_received' && st('unitwait') === 'request_sent');
  check(
    'export: no other player\'s sub, player id or email',
    !['sub-pal', 'sub-asker', 'sub-waiting', 'acct_sub-pal', 'unitpal@example.com', 'pid-host', 'pid-guest'].some((s) => expText.includes(s)),
  );
  check('export: reports and fair-play flags are left out', Object.keys(exp ?? {}).sort().join() === 'about,account,exportedAt,friends,ladder,matches');
  check('export: an unknown account is missing, not empty', (await store.exportAccountData('sub-nobody')) === 'missing');

  console.log('\n=== /auth/export and /auth/me, signed in ===');
  {
    process.env.SESSION_SECRET = 'unit-session-secret';
    const crypto = await import('node:crypto');
    const key = crypto.createHash('sha256').update(`yapstage-session-v2:${process.env.SESSION_SECRET}`).digest();
    const cookieFor = (sub, playerId, name) => {
      const body = Buffer.from(JSON.stringify({ sub, playerId, name, exp: Date.now() + 60_000 })).toString('base64url');
      return `yap_session=${encodeURIComponent(`${body}.${crypto.createHmac('sha256', key).update(body).digest('base64url')}`)}`;
    };
    const app = Fastify();
    auth.registerAuth(app);
    await app.ready();
    const me = cookieFor('sub-me', 'acct_sub-me', 'unitme');
    check('route: no session is 401', (await app.inject({ url: '/auth/export' })).statusCode === 401);
    const ok = await app.inject({ url: '/auth/export', headers: { cookie: me } });
    check(
      'route: signed in, a JSON attachment named for today',
      ok.statusCode === 200 &&
        /^attachment; filename="yapstage-data-\d{4}-\d{2}-\d{2}\.json"$/.test(ok.headers['content-disposition'] ?? '') &&
        String(ok.headers['content-type']).startsWith('application/json'),
      `${ok.statusCode} ${ok.headers['content-disposition']}`,
    );
    check('route: the file is the owner\'s own export', ok.json().account?.googleAccountId === 'sub-me' && ok.json().matches.length === 1);
    const pal = await app.inject({ url: '/auth/export', headers: { cookie: cookieFor('sub-pal', 'acct_sub-pal', 'unitpal') } });
    check('route: another session gets its own file, never this one', pal.statusCode === 200 && !pal.body.includes('moved@example.com') && !pal.body.includes('sub-me'));
    const meRes = await app.inject({ url: '/auth/me', headers: { cookie: me } });
    check('route: /auth/me gives the owner their email for Settings', meRes.json().email === 'moved@example.com');
    await app.inject({ url: '/auth/export', headers: { cookie: me } });
    await app.inject({ url: '/auth/export', headers: { cookie: me } });
    check('route: a fourth download in the hour is refused', (await app.inject({ url: '/auth/export', headers: { cookie: me } })).statusCode === 429);
    const gone = await app.inject({ url: '/auth/export', headers: { cookie: cookieFor('sub-nobody', 'acct_x', 'x') } });
    check('route: a deleted account\'s leftover cookie reads as signed out', gone.statusCode === 401);
    await app.close();
    delete process.env.SESSION_SECRET;
  }

  // Placement is three adaptive bot games. The pure parts
  // (placement.ts, gate.ts) are pinned first, then the series' own SQL runs
  // against the same stand-in players table: each game recorded once, the
  // rating written once, a stop after game one or two picked up later.
  console.log('\n=== placement: three adaptive games ===');
  {
    const pl = await import(DIST + 'placement.js');
    const { BOTS } = await import(DIST + 'bots.js');
    const W = true;
    const L = false;
    const g = (rank, won) => ({ rank, won });
    // Every path through the series: game 1 is rank 4, game 2 is 6 or 2,
    // game 3 is one rung either side of game 2.
    const paths = [
      [[W, W], [4, 6, 7]],
      [[W, L], [4, 6, 5]],
      [[L, W], [4, 2, 3]],
      [[L, L], [4, 2, 1]],
    ];
    check('series: game 1 is always rank 4 (Clover)', pl.nextPlacementRank([]) === 4 && pl.botAtRank(4)?.name === 'Clover');
    check('series: game 2 is rank 6 after a win, rank 2 after a loss', pl.nextPlacementRank([g(4, W)]) === 6 && pl.nextPlacementRank([g(4, L)]) === 2);
    for (const [[a, b], ranks] of paths) {
      const got = [pl.nextPlacementRank([]), pl.nextPlacementRank([g(4, a)]), pl.nextPlacementRank([g(4, a), g(ranks[1], b)])];
      check(
        `series: ${a ? 'win' : 'loss'} then ${b ? 'win' : 'loss'} meets ranks ${ranks.join(', ')}, and game 3 is one of 1, 3, 5, 7`,
        got.join() === ranks.join() && [1, 3, 5, 7].includes(got[2]),
        got.join(),
      );
      for (const c of [W, L]) {
        check(
          `series: ${a ? 'W' : 'L'}${b ? 'W' : 'L'}${c ? 'W' : 'L'} is done after game 3`,
          pl.nextPlacementRank([g(4, a), g(ranks[1], b), g(ranks[2], c)]) === null,
        );
      }
    }
    check(
      'series: every rank the series can pick is a visible roster bot',
      [1, 2, 3, 4, 5, 6, 7].every((r) => pl.botAtRank(r) && !pl.botAtRank(r).hidden) && BOTS.filter((b) => !b.hidden).length === 8,
    );

    const score = pl.placementGameScore;
    check('rating: a dead even game scores 0.5', Math.abs(score(0) - 0.5) < 1e-9);
    check('rating: one game is clamped to [0.05, 0.95]', score(200) === 0.95 && score(-200) === 0.05 && score(NaN) === 0.5);
    check('rating: a win by 15 scores about 0.73', Math.abs(score(15) - 1 / (1 + Math.exp(-1))) < 1e-9);
    const elo = (r) => pl.botAtRank(r).elo;
    const R = (games) => pl.placementRating(games.map(([r, m]) => ({ oppRating: elo(r), margin: m })));
    const sweep = R([[4, 60], [6, 60], [7, 60]]);
    const whitewash = R([[4, -60], [2, -60], [1, -60]]);
    const tieUp = R([[4, 1], [6, 1], [7, 1]]);
    const tieDown = R([[4, -1], [2, -1], [1, -1]]);
    const mixed = R([[4, 12], [6, -20], [5, 3]]);
    console.log(`       examples: sweep ${sweep}, whitewash ${whitewash}, near-ties up ${tieUp} (opp avg 2067), near-ties down ${tieDown} (opp avg 733), W L W by 12/-20/3 ${mixed}`);
    check('rating: three big wins (4, 6, 7) land near the top', sweep === 2578, String(sweep));
    check('rating: three big losses (4, 2, 1) start at the ranked floor (500)', whitewash === 500, String(whitewash));
    check('rating: near-ties land near the opponents\' average', Math.abs(tieUp - 2067) <= 20 && Math.abs(tieDown - 733) <= 20, `${tieUp} ${tieDown}`);
    check('rating: the formula, worked by hand', mixed === Math.round((1400 + 2200 + 1800) / 3 + 400 * Math.log10(((score(12) + score(-20) + score(3)) / 3) / (1 - (score(12) + score(-20) + score(3)) / 3))), String(mixed));
    check(
      'rating: clamped to the ranked floor and the ladder top, 500 to 3000',
      pl.placementRating([{ oppRating: 3000, margin: 99 }, { oppRating: 3000, margin: 99 }, { oppRating: 3000, margin: 99 }]) === 3000 &&
        pl.placementRating([{ oppRating: 200, margin: -99 }, { oppRating: 200, margin: -99 }, { oppRating: 200, margin: -99 }]) === 500,
    );
    check('rating: seriesRating reads opponents off the roster by rank', pl.seriesRating([{ rank: 4, won: W, margin: 60 }, { rank: 6, won: W, margin: 60 }, { rank: 7, won: W, margin: 60 }]) === sweep);

    const out = (o) => pl.placementOutcome({ heardPlayer: 200, heardBot: 200, botFailures: 0, playerTotal: 70, botTotal: 60, playerWon: true, minWords: 40, ...o });
    check('outcome: a judged game counts with its winner and margin', JSON.stringify(out({})) === JSON.stringify({ counted: true, won: true, margin: 10 }));
    check('outcome: the judge heard nothing from the player: a loss', (() => { const o = out({ heardPlayer: 0, playerTotal: 5, botTotal: 80, playerWon: false }); return o.counted && o.won === false && o.margin === -75; })());
    check('outcome: heard nothing is a loss even if the totals said otherwise', (() => { const o = out({ heardPlayer: 0 }); return o.counted && o.won === false && o.margin < 0; })());
    check('outcome: barely heard (but heard) still counts as judged', out({ heardPlayer: 12 }).counted === true);
    check('outcome: a bot that failed a turn voids the game', out({ botFailures: 1 }).counted === false && out({ heardBot: 10 }).counted === false);

    const view = pl.seriesView([{ rank: 4, won: L, margin: -9 }]);
    check('view: done, results without margins, and the next bot', view.done === 1 && view.next?.name === 'Moss' && view.next.rank === 2 && !JSON.stringify(view).includes('margin'));
    check('view: a finished series has nobody next', pl.seriesView([{ rank: 4, won: W, margin: 1 }, { rank: 6, won: L, margin: -1 }, { rank: 5, won: W, margin: 3 }]).next === null);
    check('parse: junk in the column reads as no games', pl.parseSeries('x').length === 0 && pl.parseSeries([null, { rank: 'a' }, { rank: 4, won: true, margin: 2 }]).length === 1);

    // ---- the watch lock ----
    const { watchRefusal } = await import(DIST + 'gate.js');
    const ask = (o) => watchRefusal({ googleOn: true, signedIn: true, placed: true, byCode: false, ...o });
    check('watch: a guest is locked out of live ranked matches', ask({ signedIn: false, placed: null }) === 'watch_locked');
    check('watch: signed in but still placing is locked out', ask({ placed: false }) === 'watch_locked');
    check('watch: signed in and placed watches', ask({}) === null);
    check('watch: store down (placed unknown) does not lock a signed-in player', ask({ placed: null }) === null);
    check('watch: a friend room by its code is open to a guest and to a placing player', ask({ byCode: true, signedIn: false, placed: null }) === null && ask({ byCode: true, placed: false }) === null);
    check('watch: with sign-in off (dev, smoke) nobody is locked', ask({ googleOn: false, signedIn: false, placed: null }) === null && ask({ googleOn: false, placed: false }) === null);

    // ---- persistence, against the stand-in players table ----
    const withSeries = pg.Pool.prototype.query;
    const writes = { rating: 0 };
    pg.Pool.prototype.query = async function (sql, params = []) {
      const q = String(sql).replace(/\s+/g, ' ').trim();
      if (q.startsWith('INSERT INTO players (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING')) {
        if (!players.has(params[0])) players.set(params[0], { id: params[0], name: params[1], placed: false, placement: [], rating: 700 });
        return { rows: [], rowCount: 1 };
      }
      if (q.startsWith('UPDATE players SET placement = placement || $3::jsonb')) {
        const row = players.get(params[0]);
        const list = row?.placement ?? [];
        if (!row || row.placed || list.length !== params[1]) return { rows: [], rowCount: 0 };
        row.placement = [...list, ...JSON.parse(params[2])];
        return { rows: [{ placement: row.placement }], rowCount: 1 };
      }
      if (q.startsWith('UPDATE players SET rating = $2, placed = true')) {
        const row = players.get(params[0]);
        if (!row || row.placed || (row.placement ?? []).length < 3) return { rows: [], rowCount: 0 };
        row.rating = params[1];
        row.placed = true;
        writes.rating += 1;
        return { rows: [{ rating: row.rating }], rowCount: 1 };
      }
      return withSeries.call(this, sql, params);
    };

    const pid = 'acct_sub-placing';
    const nextOf = async () => {
      const row = await store.getRating(pid);
      return { step: row?.placement.length ?? 0, rank: pl.nextPlacementRank(row?.placement ?? []), placed: row?.placed };
    };
    let at = await nextOf();
    check('store: a new player starts at step 0 against rank 4', at.step === 0 && at.rank === 4 && !at.placed);
    // Game 1: lost to Clover by 14. Then the player stops.
    const g1 = await store.recordPlacementGame(pid, 'placing', 0, { rank: 4, won: L, margin: -14 });
    check('store: game 1 is recorded', g1?.recorded === true && g1.games.length === 1 && g1.rating === null);
    // A second verdict for the same game (a double emit, a resume).
    const g1again = await store.recordPlacementGame(pid, 'placing', 0, { rank: 4, won: W, margin: 30 });
    check('store: a double verdict for game 1 records nothing', g1again?.recorded === false && players.get(pid).placement.length === 1 && players.get(pid).placement[0].won === false);
    at = await nextOf();
    check('store: continuing later (any device) reads step 1 against rank 2', at.step === 1 && at.rank === 2);
    // Game 2 against Moss is started and aborted: nothing is recorded, so the
    // next start is the same step, and that replay records.
    at = await nextOf();
    check('store: an aborted game 2 leaves the same step to replay', at.step === 1 && at.rank === 2);
    const g2 = await store.recordPlacementGame(pid, 'placing', 1, { rank: 2, won: W, margin: 22 });
    check('store: the replayed game 2 is recorded', g2?.recorded === true && g2.games.length === 2);
    const stale = await store.recordPlacementGame(pid, 'placing', 1, { rank: 2, won: L, margin: -5 });
    check('store: a stale game-2 verdict after that records nothing', stale?.recorded === false && players.get(pid).placement.length === 2);
    at = await nextOf();
    check('store: game 3 is rank 3 (lost, then won)', at.step === 2 && at.rank === 3);
    check('store: not placed after two games', (await store.getRating(pid))?.placed === false);
    // Game 3: two verdicts land at once.
    const [g3a, g3b] = await Promise.all([
      store.recordPlacementGame(pid, 'placing', 2, { rank: 3, won: W, margin: 8 }),
      store.recordPlacementGame(pid, 'placing', 2, { rank: 3, won: W, margin: 8 }),
    ]);
    const expected = pl.seriesRating([
      { rank: 4, won: L, margin: -14 },
      { rank: 2, won: W, margin: 22 },
      { rank: 3, won: W, margin: 8 },
    ]);
    const ratings = [g3a?.rating, g3b?.rating].filter((r) => r !== null);
    check(
      'store: game 3 recorded once and the rating written once (placed = true)',
      [g3a, g3b].filter((x) => x?.recorded).length === 1 &&
        ratings.length === 1 &&
        ratings[0] === expected &&
        writes.rating === 1 &&
        players.get(pid).placed === true &&
        players.get(pid).rating === expected &&
        players.get(pid).placement.length === 3,
      JSON.stringify({ g3a, g3b, expected, writes, row: players.get(pid) }),
    );
    check('store: finishing again writes nothing', (await store.finishPlacement(pid)) === null && writes.rating === 1);
    check('store: a game after placement records nothing', (await store.recordPlacementGame(pid, 'placing', 2, { rank: 3, won: L, margin: -40 }))?.recorded === false && players.get(pid).rating === expected);
    // Someone placed before the series existed: untouched.
    players.set('acct_old', { id: 'acct_old', name: 'old', placed: true, placement: [], rating: 1812 });
    const old = await store.recordPlacementGame('acct_old', 'old', 0, { rank: 4, won: W, margin: 50 });
    check('store: an already placed player is untouched', old?.recorded === false && old.rating === null && players.get('acct_old').rating === 1812 && players.get('acct_old').placement.length === 0);
    // Three games on file but no rating (the store failed between writes):
    // finishPlacement heals it, once.
    players.set('acct_half', { id: 'acct_half', name: 'half', placed: false, rating: 700, placement: [{ rank: 4, won: true, margin: 5 }, { rank: 6, won: false, margin: -5 }, { rank: 5, won: true, margin: 1 }] });
    const healed = await store.finishPlacement('acct_half');
    check('store: a series with three games and no rating is finished once', healed === pl.seriesRating(players.get('acct_half').placement) && players.get('acct_half').placed === true && (await store.finishPlacement('acct_half')) === null);
    check('store: a step outside 0 to 2 is refused', (await store.recordPlacementGame('acct_x', 'x', 3, { rank: 4, won: W, margin: 1 })) === null);
    pg.Pool.prototype.query = withSeries;
  }
  delete process.env.DATABASE_URL;
}

console.log('\n=== no public payload carries an email ===');
{
  // The email lives in two files: store.ts keeps it, auth.ts hands it to its
  // owner. Every socket payload is typed in protocol.ts, and every public
  // route and emit is built in the other files, so neither may mention it.
  const { readFileSync, readdirSync } = await import('node:fs');
  const src = new URL('../server/src/', import.meta.url);
  const proto = readFileSync(new URL('protocol.ts', src), 'utf8');
  check('protocol.ts: no payload type has an email field', !/\be-?mail\w*\??\s*:/i.test(proto));
  const touch = readdirSync(src)
    .filter((f) => f.endsWith('.ts') && /e-?mail/i.test(readFileSync(new URL(f, src), 'utf8')))
    .sort();
  check('server: only auth.ts and store.ts ever mention the email', touch.join() === 'auth.ts,store.ts', touch.join());
}

console.log('\n=== model budget and breaker ===');
{
  let spent = 0;
  let capped = false;
  for (let i = 0; i < 4; i++) {
    try {
      llm.llmBudget();
      spent += 1;
    } catch (err) {
      capped = err instanceof llm.LlmCapError;
    }
  }
  check('llm: LLM_HOURLY_CAP calls go through, the next one throws LlmCapError', spent === 3 && capped);
  check('llm: breaker closed to start', llm.llmDown() === false);
  llm.llmFailed();
  llm.llmFailed();
  check('llm: two failures do not open it', llm.llmDown() === false);
  llm.llmFailed();
  check('llm: three consecutive failures open it', llm.llmDown() === true);
  llm.llmOk();
  check('llm: one success closes it', llm.llmDown() === false);
}

console.log('\n=== failure logs say nothing the model wrote ===');
{
  let parseErr;
  try {
    JSON.parse('Here is my verdict: the winner is');
  } catch (e) {
    parseErr = e;
  }
  const tag = errTag(parseErr);
  check('log: a JSON.parse error is logged by class only', tag === 'SyntaxError' && !tag.includes('verdict'), tag);
  check('log: our own fixed messages survive', errTag(new Error('Judge output truncated at max_tokens')).includes('truncated'));
  const apiErr = Object.assign(new Error('the model said something private'), { name: 'RateLimitError', status: 429 });
  check('log: an API error keeps its class and status, not its message', errTag(apiErr) === 'RateLimitError 429', errTag(apiErr));
}

console.log(`\n${failures === 0 ? 'ALL UNIT CHECKS PASSED' : failures + ' UNIT CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
