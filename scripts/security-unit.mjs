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

console.log('\n=== no transcript in filed matches ===');
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
    transcript: [{ stepIndex: 0, side: 'FOR', text: 'secret words', at: 1 }],
    topic: { en: 'a motion' },
    pace: 'blitz',
  };
  const rows = matchRowsFor(lobby, verdict);
  const hostRow = rows.find((r) => r.playerId === 'pid-host');
  const guestRow = rows.find((r) => r.playerId === 'pid-guest');
  check('match rows: one per human seat', rows.length === 2);
  check('match rows: no transcript field at all', rows.every((r) => !('transcript' in r)));
  check('match rows: the words are nowhere in the row', !JSON.stringify(rows).includes('secret words'));
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
