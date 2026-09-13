// Edge-case checks for launch (QA pass, 2026-09-12). Modelled on smoke.mjs:
// fake socket clients drive a DEBATE_SPEED=fast server with the mock judge.
//
//   URL=http://localhost:3012 node scripts/smoke-edge.mjs
//   ONLY=e1,e3 ...            run a subset
//   LONG=1 ONLY=e9 ...        the ~11 minute rematch-timer check
//
// Every check states the behaviour we WANT. A FAIL here is a bug report, not
// a broken test: the message says what actually happened. Checks that need a
// database (ratings, placement, history) cannot bite against a store-less
// server and say so in their detail.
import { io } from 'socket.io-client';

const URL = process.env.URL ?? 'http://localhost:3012';
const ONLY = (process.env.ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const LONG = process.env.LONG === '1';
const want = (id) => ONLY.length === 0 || ONLY.includes(id);
const U = Date.now().toString(36).slice(-5);
let failures = 0;

function check(name, cond, detail = '') {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${name}${!cond && detail ? `\n       ${detail}` : ''}`);
}
const info = (msg) => console.log(`  info: ${msg}`);

const connect = () => io(URL, { forceNew: true, transports: ['websocket'] });
const emitP = (sock, ev, payload) => new Promise((res) => sock.emit(ev, payload, res));
const once = (sock, ev, timeoutMs = 20000) =>
  new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`timeout waiting for ${ev}`)), timeoutMs);
    sock.once(ev, (p) => {
      clearTimeout(t);
      res(p);
    });
  });
const maybe = (p) => p.then((v) => v).catch(() => null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Everything `ev` delivers on `sock` over the next `ms`. */
const collect = (sock, ev, ms) =>
  new Promise((res) => {
    const got = [];
    const h = (p) => got.push(p);
    sock.on(ev, h);
    setTimeout(() => {
      sock.off(ev, h);
      res(got);
    }, ms);
  });
/** The server's event trail. Keyed since 2026-09-12: run the server with
    STATS_KEY set and pass the same STATS_KEY here, or every check that
    reads events has nothing to read. */
const STATS_KEY = process.env.STATS_KEY ?? '';
if (!STATS_KEY) console.log('  warning: STATS_KEY is not set, so /stats/events is closed and the event-based checks cannot see anything');
const events = async (code) =>
  (
    await fetch(`${URL}/stats/events?limit=400${code ? `&code=${code}` : ''}`, {
      headers: STATS_KEY ? { 'x-stats-key': STATS_KEY } : {},
    }).then((r) => (r.ok ? r.json() : {}))
  ).events ?? [];

// Checks that have to wait out a grace window run at the end, together.
const deferred = [];
const defer = (at, fn) => deferred.push({ at, fn });

const WORDS20 =
  'my case rests on incentives and the other side has not answered the incentive point at all so it stands';

/** A friend room, host seated FOR, both confirmed. Resolves at debate:start. */
async function friendDebate(tag) {
  const a = connect();
  const b = connect();
  const sa = `${tag}a${U}`;
  const sb = `${tag}b${U}`;
  // Signed-out names are the device's GuestNNNN and nothing else (2026-09-12).
  const cr = await emitP(a, 'lobby:create', { sessionId: sa, name: 'Guest2101', playerId: `pid-${sa}` });
  const code = cr.update.code;
  const jr = await emitP(b, 'lobby:join', { code, sessionId: sb, name: 'Guest2102', playerId: `pid-${sb}` });
  if (!jr.ok) throw new Error(`join failed: ${jr.error}`);
  a.emit('pick:side', 'FOR');
  await sleep(150);
  const stA = once(a, 'debate:start', 10000);
  const stB = once(b, 'debate:start', 10000);
  a.emit('pick:confirm');
  b.emit('pick:confirm');
  const [startA, startB] = await Promise.all([stA, stB]);
  return { a, b, sa, sb, code, startA, startB };
}

/** Each seat speaks its own turns and passes the mic. `line(side, step)` may
    return null to stay silent, or a function to do something else instead. */
function drive(bySide, line) {
  for (const [side, s] of Object.entries(bySide)) {
    s.on('debate:phase', (ph) => {
      if (ph.activeSpeaker !== side) return;
      const l = line(side, ph.stepIndex);
      if (typeof l === 'function') l(s, ph);
      else if (l) s.emit('speech:chunk', { stepIndex: ph.stepIndex, text: l });
      setTimeout(() => s.emit('turn:done', { stepIndex: ph.stepIndex }), 150);
    });
  }
}

const health = await fetch(`${URL}/healthz`).then((r) => r.json());
console.log(`server: ${URL} ${JSON.stringify(health)}`);
const storeUp = health.share === 'stored';

// ---------- E1: double-tap Go on a bot game ----------
// Home.startBot / App.startBotAs / TutorialIntro have no in-flight guard, and
// bot:start never refuses a socket that is already seated in a live debate.
if (want('e1')) {
  console.log('\n=== E1: double-tap Go on a bot game ===');
  const g = connect();
  await new Promise((r) => g.once('connect', r));
  const since = new Date().toISOString();
  const starts = collect(g, 'debate:start', 2500);
  const p = { sessionId: `e1${U}`, name: 'Guest2002', playerId: `pid-e1${U}`, botId: 'mouse', topicMode: 'random', side: 'FOR', lang: 'en' };
  const [r1, r2] = await Promise.all([emitP(g, 'bot:start', p), emitP(g, 'bot:start', p)]);
  const got = await starts;
  info(`acks: ${r1.ok}/${r2.ok}`);
  check('E1 a double-tapped bot start opens ONE debate', got.length === 1, `one socket received ${got.length} debate:start events (two live bot debates, both emitting phases and bot turns to it)`);
  const codes = (await events())
    .filter((e) => e.evt === 'bot_debate_started' && e.t >= since)
    .map((e) => e.code);
  info(`bot debates started for this socket: ${codes.join(', ')}`);
  g.disconnect();
  const at = Date.now() + 18000;
  defer(at, async () => {
    const alive = [];
    for (const code of codes) {
      const ev = await events(code);
      if (!ev.some((e) => e.evt === 'debate_aborted')) alive.push(code);
    }
    check(
      'E1 closing the tab ends every debate that socket had open',
      alive.length === 0,
      `still running 18s after the tab closed: ${alive.join(', ')} (bot turns, TTS and a judge call still get spent; a loss gets filed)`,
    );
  });
}

// ---------- E7 (setup): placement lock after an abort ----------
if (want('e7')) {
  console.log('\n=== E7: a placement that died (setup; checked after the grace window) ===');
  const h = connect();
  await new Promise((r) => h.once('connect', r));
  const pid = `pid-e7${U}`;
  const since = new Date().toISOString();
  const st = once(h, 'debate:start', 10000);
  const r = await emitP(h, 'bot:start', { sessionId: `e7${U}`, name: 'Guest2009', playerId: pid, botId: 'x', topicMode: 'random', placement: true, lang: 'en' });
  if (!r.ok) {
    info(`placement refused up front (${r.error}); Google must be on. Skipping E7.`);
  } else {
    await st;
    // Ask the event trail a few times: a single look right after debate:start
    // came back empty on one run (2026-09-13) and silently skipped E12.
    let code;
    for (let i = 0; i < 6 && !code; i++) {
      code = (await events()).find((e) => e.evt === 'bot_debate_started' && e.t >= since)?.code;
      if (!code) await new Promise((res) => setTimeout(res, 300));
    }
    h.disconnect(); // wifi drops, or the tab is closed
    defer(Date.now() + 17500, async () => {
      const h2 = connect();
      const r2 = await emitP(h2, 'bot:start', { sessionId: `e7b${U}`, name: 'Guest2009', playerId: pid, botId: 'x', topicMode: 'random', placement: true, lang: 'en' });
      check(
        'E7 after a placement is aborted the player can start it again',
        r2.ok === true,
        `refused with "${r2.error}" (client shows errPlacing "already running in another tab"); the dead lobby blocks it for 60s, and a judge-failed one until the 30 min sweep`,
      );
      h2.disconnect();
      // A watcher who opens the dead debate by code. The code comes from the
      // keyed event trail; without it E12 used to vanish from the run without
      // a word, which made pass counts disagree between runs. Say so instead.
      if (!code) check('E12 watching a debate that was called off says so', false, 'no room code for the aborted placement in /stats/events (is STATS_KEY set on both sides?), so E12 could not run');
      if (code) {
        const w = connect();
        const stP = maybe(once(w, 'spectate:state', 3000));
        const j = await emitP(w, 'spectate:join', { code });
        const s = await stP;
        check(
          'E12 watching a debate that was called off says so',
          !j.ok || (s && s.status !== 'verdict'),
          `spectate:state says status "${s?.status}" with no verdict and no abort reason: the Spectate screen has nothing to render`,
        );
        w.disconnect();
      }
    });
  }
}

// ---------- E3: ranked guest drops in the green room ----------
if (want('e3')) {
  console.log('\n=== E3: ranked green room, the guest drops ===');
  const x = connect();
  const y = connect();
  const z = connect();
  const mx = once(x, 'queue:matched', 8000);
  const my = once(y, 'queue:matched', 8000);
  await emitP(x, 'queue:join', { sessionId: `e3x${U}`, playerId: `pid-e3x${U}`, name: 'Guest2013' });
  await emitP(y, 'queue:join', { sessionId: `e3y${U}`, playerId: `pid-e3y${U}`, name: 'Guest2014' });
  const [ux] = await Promise.all([mx, my]);
  const code = ux.update.code;
  const back = maybe(once(x, 'lobby:update', 5000));
  // The ranked guest gets the same 15-second grace as a host (a blip can
  // come back), and then the room closes: wait out the grace.
  const closed = maybe(once(x, 'lobby:closed', 18000));
  y.disconnect(); // refresh, or the phone locks
  const lu = await back;
  info(`host now sees participantCount=${lu?.participantCount}, ranked=${lu?.ranked}`);
  check(
    'E3 the ranked host is told the match is off (not left in an empty ranked room)',
    Boolean(await closed),
    'no lobby:closed: the host sits in a one-seat ranked room with a copyable invite code and no way back to the queue except Leave',
  );
  const zj = await emitP(z, 'lobby:join', { code, sessionId: `e3z${U}`, name: 'Guest2006', playerId: `pid-e3z${U}` });
  check(
    'E3 a stranger cannot walk into a ranked seat by code',
    !zj.ok,
    `joined ok, update.ranked=${zj.update?.ranked}: the rating on that seat still belongs to the player who left (lobby.ranked.guest)`,
  );
  x.disconnect();
  z.disconnect();
}

// ---------- E2: double-tap the ranked queue ----------
if (want('e2')) {
  console.log('\n=== E2: double-tapped queue join ===');
  const x = connect();
  const y = connect();
  const z = connect();
  await Promise.all([x, y, z].map((s) => new Promise((r) => s.once('connect', r))));
  const xm = collect(x, 'queue:matched', 3500);
  const px = { sessionId: `e2x${U}`, playerId: `pid-e2x${U}`, name: 'Guest2010' };
  await Promise.all([emitP(x, 'queue:join', px), emitP(x, 'queue:join', px)]);
  await sleep(200);
  const ym = once(y, 'queue:matched', 5000);
  await emitP(y, 'queue:join', { sessionId: `e2y${U}`, playerId: `pid-e2y${U}`, name: 'Guest2011' });
  await ym;
  await sleep(300);
  await emitP(z, 'queue:join', { sessionId: `e2z${U}`, playerId: `pid-e2z${U}`, name: 'Guest2012' });
  const got = await xm;
  check(
    'E2 one socket that taps Find twice is matched once',
    got.length === 1,
    `matched ${got.length} times into ${got.map((m) => m.update.code).join(' and ')}: the first opponent is stranded in a green room with nobody${storeUp ? '' : ' (no DB here; with a DB the window is wider)'}`,
  );
  if (got.length === 1) info(storeUp ? 'race not hit this run' : 'no DB: getPlayer resolves at once, so the race window is tiny here; it is a DB round trip in production');
  x.disconnect();
  y.disconnect();
  z.disconnect();
}

// ---------- E4: a blip during the fight card ----------
if (want('e4')) {
  console.log('\n=== E4: resume during the fight-card reveal ===');
  const a = connect();
  const b = connect();
  const cr = await emitP(a, 'lobby:create', { sessionId: `e4a${U}`, name: 'Guest2007', playerId: `pid-e4a${U}` });
  if (!cr?.ok) {
    // Usually the per-address waiting-room cap, full of rooms another suite
    // left open on this server: run this suite against a fresh server.
    throw new Error(`E4: lobby:create was refused (${cr?.error}); run the edge suite against a fresh server`);
  }
  const code = cr.update.code;
  await emitP(b, 'lobby:join', { code, sessionId: `e4b${U}`, name: 'Guest2003', playerId: `pid-e4b${U}` });
  const sb = once(b, 'debate:start', 8000);
  a.emit('pick:confirm');
  b.emit('pick:confirm');
  await sb;
  // The guest's socket drops and comes straight back while the card is up.
  const b2 = connect();
  await new Promise((r) => b2.once('connect', r));
  const order = [];
  b2.on('debate:start', () => order.push('start'));
  b2.on('debate:phase', () => order.push('phase'));
  const rr = await emitP(b2, 'lobby:resume', { code, sessionId: `e4b${U}` });
  await sleep(4000); // FAST reveal is 3s
  info(`resume ok=${rr.ok}; resumed socket saw: ${order.join(', ') || 'nothing'}`);
  check(
    'E4 a socket resumed during the reveal gets debate:start before the first phase',
    order[0] === 'start',
    'resendState skips stepIndex -1, so a client that missed debate:start renders phases with no topic, side or names',
  );
  a.disconnect();
  b2.disconnect();
}

// ---------- E8: the watcher hops to the next debate ----------
if (want('e8')) {
  console.log('\n=== E8: spectator hops rooms (the feed\'s "next") ===');
  const ha = connect();
  const hb = connect();
  const s = connect();
  const ra = await emitP(ha, 'lobby:create', { sessionId: `e8a${U}`, name: 'Guest2004', playerId: `pid-e8a${U}` });
  const rb = await emitP(hb, 'lobby:create', { sessionId: `e8b${U}`, name: 'Guest2005', playerId: `pid-e8b${U}` });
  const cA = maybe(once(ha, 'spectate:count', 2000));
  const j1 = await emitP(s, 'spectate:join', { code: ra.update.code });
  await cA;
  const j2 = await emitP(s, 'spectate:join', { code: rb.update.code });
  info(`joins: ${j1.ok}/${j2.ok}`);
  const countA = maybe(once(ha, 'spectate:count', 1500));
  const stray = maybe(once(s, 'lobby:closed', 2500));
  await sleep(200);
  ha.emit('lobby:leave'); // room A closes while the watcher is on room B
  const got = await stray;
  const ca = await countA;
  check(
    'E8 moving to a second debate leaves the first one',
    !got,
    `the watcher of room B received room A's lobby:closed (App.resetToHome kicks them out); phases, verdicts and audio of A also keep arriving`,
  );
  info(`room A's host was ${ca ? `told n=${ca.n}` : 'never told the watcher left'}`);
  hb.disconnect();
  s.disconnect();
  ha.disconnect();
}

// ---------- E6: skipping the bot's turn ----------
if (want('e6')) {
  console.log('\n=== E6: the human ends the bot\'s turns before it speaks ===');
  const g = connect();
  const st = once(g, 'debate:start', 10000);
  await emitP(g, 'bot:start', { sessionId: `e6${U}`, name: 'Guest2008', playerId: `pid-e6${U}`, botId: 'mouse', topicMode: 'random', side: 'FOR', lang: 'en' });
  const s = await st;
  const botSide = s.yourSide === 'FOR' ? 'AGAINST' : 'FOR';
  const botSteps = new Set([0, 1, 2, 3, 4, 5, 6, 7].filter((i) => ['FOR', 'AGAINST', 'FOR', 'AGAINST', 'AGAINST', 'FOR', 'AGAINST', 'FOR'][i] === botSide));
  const botTurns = [];
  g.on('bot:turn', (bt) => botTurns.push(bt.stepIndex));
  g.on('debate:phase', (ph) => {
    if (ph.activeSpeaker !== s.yourSide) return;
    g.emit('speech:chunk', { stepIndex: ph.stepIndex, text: WORDS20 });
    g.emit('turn:done', { stepIndex: ph.stepIndex });
    // One devtools line: end the bot's next turn(s) before it has said a word.
    for (let n = ph.stepIndex + 1; botSteps.has(n); n++) g.emit('bot:done', { stepIndex: n });
  });
  const v = await once(g, 'verdict:result', 120000);
  info(`heard=${JSON.stringify(v.heard)} bot:turn events=${botTurns.length}`);
  check(
    'E6 the bot always gets its turns (bot:done cannot end a turn the bot has not spoken)',
    (v.heard?.[botSide] ?? 0) > 0,
    `the bot said 0 words and the judge still ruled; on the placement match applyPlacement only checks the HUMAN's 40 words, so this places a new account at the 1700 cap`,
  );
  g.disconnect();
}

// ---------- E10 / E21 / E14: one friend debate, three checks ----------
if (want('e10')) {
  console.log('\n=== E10: caption flood, E21: shared coach budget, E14: verdict re-sent on resume ===');
  const d = await friendDebate('ft');
  const bySide = { [d.startA.yourSide]: d.a, [d.startB.yourSide]: d.b };
  drive(bySide, (side, step) => {
    if (side === 'FOR' && step === 0) {
      // 400 caption chunks in one turn, no audio: the transcript cap is global.
      return (s, ph) => {
        for (let i = 0; i < 400; i++) s.emit('speech:chunk', { stepIndex: ph.stepIndex, text: 'filler words that go on and on and on forever' });
      };
    }
    return WORDS20;
  });
  const v = await once(d.a, 'verdict:result', 120000);
  info(`heard=${JSON.stringify(v.heard)}`);
  check(
    'E10 one side flooding captions cannot silence the other side',
    (v.heard?.AGAINST ?? 0) > 0,
    'AGAINST spoke every turn and the judge got 0 of its words (MAX_TRANSCRIPT_ENTRIES=400 is shared by both sides): judge rule 4 then hands FOR the win by default',
  );
  check(
    'E10 caption volume per turn is bounded',
    (v.heard?.FOR ?? 0) < 1500,
    `FOR put ${v.heard?.FOR} words into one 5-second turn; speech:chunk has no rate limit, all of it goes to Opus`,
  );

  // E21: the post-verdict coach. 8 asks per LOBBY, shared by both debaters.
  for (let i = 0; i < 8; i++) {
    const r = once(d.a, 'coach:reply', 20000);
    d.a.emit('coach:ask', { question: `question number ${i + 1}, why did I lose?` });
    await r;
  }
  const rb = once(d.b, 'coach:reply', 20000);
  d.b.emit('coach:ask', { question: 'my first question: what should I have said?' });
  const bRep = await rb;
  check(
    'E21 one debater using the coach does not use up the other\'s questions',
    Boolean(bRep.text) && !bRep.done,
    'the guest\'s very first question came back empty with done:true because the host asked 8 (coachAsks is per lobby, not per side)',
  );

  // E14: the post-debate refresh path (App boot-resume) re-fetches the verdict.
  const a2 = connect();
  const re = once(a2, 'verdict:result', 8000);
  await emitP(a2, 'lobby:resume', { code: d.code, sessionId: d.sa });
  const rv = await maybe(re);
  check(
    'E14 a verdict re-sent after a refresh carries heard/elo/placement like the original',
    Boolean(rv && rv.heard),
    `re-sent payload keys: ${rv ? Object.keys(rv).join(', ') : 'none'}. The refreshed screen loses the rating delta, the placement rating and the "judge heard nothing from you" line`,
  );
  a2.disconnect();
  d.b.disconnect();
  d.a.disconnect();
}

// ---------- E5: resumed clock on a bot turn ----------
if (want('e5')) {
  console.log('\n=== E5: resume during a bot turn ===');
  const g = connect();
  await new Promise((r) => g.once('connect', r));
  const since = new Date().toISOString();
  const ph = once(g, 'debate:phase', 10000);
  const sid = `e5${U}`;
  await emitP(g, 'bot:start', { sessionId: sid, name: 'Guest2001', playerId: `pid-e5${U}`, botId: 'mouse', topicMode: 'random', side: 'AGAINST', lang: 'en' });
  const p0 = await ph; // step 0 is the bot's (it argues FOR)
  const code = (await events()).find((e) => e.evt === 'bot_debate_started' && e.t >= since)?.code;
  const g2 = connect();
  const rp = once(g2, 'debate:phase', 5000);
  await emitP(g2, 'lobby:resume', { code, sessionId: sid });
  const p1 = await maybe(rp);
  const left0 = p0.deadline - p0.serverNow;
  const left1 = p1 ? p1.deadline - p1.serverNow : NaN;
  check(
    'E5 a resumed socket gets the bot turn\'s real clock',
    p1 && Math.abs(p1.deadline - p0.deadline) < 1500,
    `original window ${left0}ms, re-sent ${left1}ms (resendState uses step.seconds, emitStep used grace + seconds)`,
  );
  g2.disconnect();
}

// ---------- E22: a bot game survives a socket blip ----------
// The client keeps the room code from the bot:start ack and, after a blip,
// resumes from a NEW socket. socket.io flushes whatever the old socket had
// queued (bot:done, speech, audio, turn:done) BEFORE the client's resume, so
// those land on a socket that is not seated yet and must change nothing.
if (want('e22')) {
  console.log('\n=== E22: a bot game resumed from a new socket, stale events first ===');
  const g = connect();
  await new Promise((r) => g.once('connect', r));
  const sid = `e22${U}`;
  const firstPhase = once(g, 'debate:phase', 12000);
  const ack = await emitP(g, 'bot:start', { sessionId: sid, name: 'Guest2201', playerId: `pid-e22${U}`, botId: 'mouse', topicMode: 'random', side: 'FOR', lang: 'en' });
  check('E22 the bot:start ack carries the room code', ack.ok === true && typeof ack.code === 'string' && ack.code.length === 6, JSON.stringify(ack));
  const p0 = await firstPhase; // step 0 is the human's (FOR)
  g.disconnect();
  const g2 = connect();
  await new Promise((r) => g2.once('connect', r));
  // What socket.io flushes from the offline buffer, ahead of the resume.
  g2.emit('bot:done', { stepIndex: 1 });
  g2.emit('turn:done', { stepIndex: 0 });
  g2.emit('speech:chunk', { stepIndex: 0, text: 'queued while offline' });
  g2.emit('audio:turn', { stepIndex: 0, mime: 'audio/webm', data: new Uint8Array(2000).buffer, seq: 0 });
  const ph = once(g2, 'debate:phase', 5000);
  const rr = await emitP(g2, 'lobby:resume', { code: ack.code, sessionId: sid });
  const p1 = await maybe(ph);
  check('E22 lobby:resume re-seats the human in a bot game', rr.ok === true);
  check(
    'E22 events queued before the resume changed nothing (still the same turn, same clock)',
    Boolean(p1) && p1.stepIndex === p0.stepIndex && Math.abs(p1.deadline - p0.deadline) < 1500,
    `before ${p0.stepIndex}@${p0.deadline}, after ${p1?.stepIndex}@${p1?.deadline}`,
  );
  const bt = once(g2, 'bot:turn', 30000);
  g2.emit('speech:chunk', { stepIndex: p0.stepIndex, text: WORDS20 });
  g2.emit('turn:done', { stepIndex: p0.stepIndex });
  const got = await maybe(bt);
  check('E22 the bot\'s next turn reaches the resumed socket', Boolean(got) && got.stepIndex === p0.stepIndex + 1);
  // A second blip during the bot's step, after it spoke: the turn comes again.
  g2.disconnect();
  const g3 = connect();
  await new Promise((r) => g3.once('connect', r));
  const again = once(g3, 'bot:turn', 5000);
  await emitP(g3, 'lobby:resume', { code: ack.code, sessionId: sid });
  const re = await maybe(again);
  check('E22 a socket resumed during the bot\'s step gets the bot\'s turn again', Boolean(re) && re.stepIndex === p0.stepIndex + 1);
  g3.emit('lobby:leave'); // a bot game can be walked out of mid-debate
  await sleep(200);
  g3.disconnect();
}

// ---------- E9 (LONG): a rematch outlives the first verdict's cleanup ----------
if (LONG && want('e9')) {
  console.log('\n=== E9: rematch vs the ten-minute destroy timer (about 11 minutes) ===');
  const d = await friendDebate('rt');
  const bySide = { [d.startA.yourSide]: d.a, [d.startB.yourSide]: d.b };
  drive(bySide, () => WORDS20);
  await once(d.a, 'verdict:result', 120000);
  const verdictAt = Date.now();
  d.a.removeAllListeners('debate:phase');
  d.b.removeAllListeners('debate:phase');
  const go = once(d.a, 'rematch:go', 5000);
  d.a.emit('rematch');
  d.b.emit('rematch');
  await go;
  info('rematched; waiting in the green room until 9:35 after the first verdict');
  await sleep(verdictAt + 9 * 60_000 + 35_000 - Date.now());
  const st = once(d.a, 'debate:start', 8000);
  d.a.emit('pick:confirm');
  d.b.emit('pick:confirm');
  await st;
  const phases = [];
  d.a.on('debate:phase', (p) => phases.push(p.stepIndex));
  const end = await Promise.race([
    once(d.a, 'debate:ended', 90000).then(() => 'ended'),
    once(d.a, 'debate:aborted', 90000).then((x) => `aborted:${x.reason}`),
  ]).catch(() => 'silence');
  check(
    'E9 a rematch that runs past the first verdict\'s 10-minute mark still finishes',
    end === 'ended',
    `outcome "${end}" after phases [${phases.join(',')}]: runJudge's destroy timer from the FIRST verdict deleted the lobby mid-rematch, no event sent`,
  );
  d.a.disconnect();
  d.b.disconnect();
}

// ---------- the deferred checks ----------
for (const { at, fn } of deferred.sort((x, y) => x.at - y.at)) {
  const wait = at - Date.now();
  if (wait > 0) await sleep(wait);
  await fn();
}

console.log(`\n${failures === 0 ? 'ALL EDGE CHECKS PASSED' : failures + ' EDGE CHECK(S) FAILED (each one is a bug report, see above)'}`);
process.exit(failures === 0 ? 0 : 1);
