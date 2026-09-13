// Unit checks for the pre-launch security and privacy fixes (2026-09-12).
// No server needed: it imports the build (npm run build -w server first).
//
//   node scripts/security-unit.mjs
//
// The live half (headers, guest names, audio limits, the room cap, relay-only
// ranked signalling, the keyed routes) is in scripts/smoke.mjs, Scenario 18.
process.env.LLM_HOURLY_CAP = '3'; // read per call; set before anything spends
delete process.env.STATS_KEY;

import Fastify from 'fastify';

let failures = 0;
function check(name, cond, detail = '') {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${!cond && detail ? `\n       ${detail}` : ''}`);
}

const sec = await import('../server/dist/security.js');
const { GUEST_NAME_RE } = await import('../server/dist/protocol.js');
const { matchRowsFor } = await import('../server/dist/judge.js');
const { cardFrom, renderCard } = await import('../server/dist/share.js');
const llm = await import('../server/dist/llm.js');
const { errTag } = await import('../server/dist/stats.js');

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
check('ice: a relay candidate passes untouched', sec.relayOnlySignal(relay) === relay);
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
  const pg = createRequire(new URL('../server/dist/store.js', import.meta.url))('pg');
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
  const store = await import('../server/dist/store.js');
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

  // Sign-in keeps a verified email, and only its owner ever gets it back.
  // The same stand-in, grown accounts, players and friends tables; the
  // matches table above stays and answers everything else.
  console.log('\n=== sign-in keeps a verified email, owner only ===');
  const auth = await import('../server/dist/auth.js');
  const { PACES } = await import('../server/dist/protocol.js');
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
