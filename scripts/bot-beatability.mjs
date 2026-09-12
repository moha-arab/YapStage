// Bot-ladder beatability eval: can a HUMAN actually beat the bots the ladder
// says they should beat? Runs REAL bot debates (live bot generation + the real
// judge with the channel-asymmetry note) against a local fast-mode server,
// with a scripted human whose lines mimic speech-to-text of live speaking.
//
// Run the server with DEBATE_SPEED=fast (ideally ELEVENLABS_API_KEY='' to skip
// TTS spend), then: node scripts/bot-beatability.mjs
//
// Ladder target (docs/CALIBRATION.md, phase D): the average profile beats
// Pip and Cappy, splits with Vivi, loses to Nora and everything above; the
// strong profile beats through Nora, splits with Ozzy, loses to Brutus and
// above. The scripts cannot respond to the bot, so they are a lower bound.
import { io } from 'socket.io-client';

const URL = process.env.URL ?? 'http://localhost:3000';
const RUNS = Number(process.env.RUNS ?? 3); // debates per (profile x bot)
// rank 1 floor / 4 placement / 8 boss; BOTS=owl reruns a single rung after
// tuning. The full ladder, rank order:
//   duckling,capybara,fox,collie,owl,bull,elephant,giraffe
const BOTS = (process.env.BOTS ?? 'duckling,collie,giraffe').split(',');

// Human argues FOR "money can buy happiness" (topic id money-happiness).
// Lines are written the way Whisper renders live speech: lowercase, run-ons,
// spoken grammar, no tidy structure. Content quality is the variable.
const PROFILES = {
  average: {
    // decent points, some engagement, no stats — a normal person having a go
    0: "okay so look money can absolutely buy happiness because like the biggest source of stress in most peoples lives is money problems right rent bills debt all of it and if you have money that whole layer of misery is just gone plus you can actually do stuff you love instead of grinding all the time",
    2: "you said happiness comes from friends and love and whatever but like have you ever tried keeping friendships when you're working two jobs and cant afford to go anywhere money is what gives you the time to even have those relationships so your point kind of proves mine",
    5: "you came at my stress point but you didnt actually deny that money removes the thing causing the stress so that part of my case is still standing fine",
    7: "so yeah at the end of the day money removes the bad stuff and buys you the time for the good stuff thats basically the whole game nobody is happy stressed and broke",
  },
  strong: {
    // sharper: specifics, direct clash, structured spoken delivery
    0: "so theres actual research on this the famous princeton study said happiness flattens around seventy five thousand but the newer killingsworth study in 2021 found it keeps rising with income so the data says money does buy happiness and beyond studies its obvious money buys back your time your health your safety the exact ingredients of a happy life",
    2: "my opponent says the best things in life are free but thats exactly backwards free time isnt free you buy it by not working a second shift and even their own example of family dinners falls apart when you cant afford the dinner the research point still stands unanswered by the way happiness rises with income they never touched it",
    5: "they went after my killingsworth citation but only by calling it a survey which doesnt touch the finding itself the correlation holds across every income band they never produced a counter study so my evidence survives intact",
    7: "so to close they never answered the killingsworth data and they never explained how youre supposed to enjoy all these free best things in life while broke and exhausted money buys time security and options and those are the raw materials of happiness thats the match",
  },
};

let failures = 0;
const connect = () => io(URL, { forceNew: true, transports: ['websocket'] });
const once = (sock, ev, timeoutMs = 30000) =>
  new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`timeout waiting for ${ev}`)), timeoutMs);
    sock.once(ev, (p) => {
      clearTimeout(t);
      res(p);
    });
  });
const emitP = (sock, ev, payload) => new Promise((res) => sock.emit(ev, payload, res));

async function runDebate(profileName, botId, runIdx) {
  const lines = PROFILES[profileName];
  const h = connect();
  try {
    const res = await emitP(h, 'bot:start', {
      sessionId: `beat-${profileName}-${botId}-${runIdx}`,
      name: 'evalhuman',
      botId,
      topicMode: 'agree',
      topicId: 'money-happiness',
      side: 'FOR',
      lang: 'en',
    });
    if (!res?.ok) throw new Error(`bot:start rejected: ${JSON.stringify(res)}`);

    h.on('debate:phase', (ph) => {
      if (ph.activeSpeaker === 'FOR' && lines[ph.stepIndex]) {
        h.emit('speech:chunk', { stepIndex: ph.stepIndex, text: lines[ph.stepIndex] });
      }
    });
    h.on('bot:turn', (bt) => h.emit('bot:done', { stepIndex: bt.stepIndex }));

    await once(h, 'debate:ended', 300000);
    const v = await once(h, 'verdict:result', 120000);
    const s = v.verdict.scores;
    const total = (c) => c.argument + c.evidence + c.clash + c.delivery;
    return {
      humanWon: v.verdict.winner === 'FOR',
      human: total(s.FOR),
      bot: total(s.AGAINST),
    };
  } finally {
    h.disconnect();
  }
}

console.log(`beatability eval: ${Object.keys(PROFILES).length} profiles x ${BOTS.length} bots x ${RUNS} runs\n`);

const results = {};
for (const profile of Object.keys(PROFILES)) {
  for (const bot of BOTS) {
    // sequential per cell, cells could parallelize but keep server load sane
    const cell = [];
    for (let i = 0; i < RUNS; i++) {
      try {
        const r = await runDebate(profile, bot, i);
        cell.push(r);
        console.log(
          `${profile.padEnd(8)} vs ${bot.padEnd(9)} run ${i + 1}: ${r.humanWon ? 'HUMAN WINS' : 'bot wins '} ${r.human}-${r.bot}`,
        );
      } catch (err) {
        failures++;
        console.log(`${profile.padEnd(8)} vs ${bot.padEnd(9)} run ${i + 1}: ERROR ${err.message}`);
      }
    }
    results[`${profile}/${bot}`] = cell;
  }
}

console.log('\n=== summary (human win rate, avg margin) ===');
for (const [key, cell] of Object.entries(results)) {
  if (cell.length === 0) continue;
  const wins = cell.filter((r) => r.humanWon).length;
  const margin = Math.round(cell.reduce((a, r) => a + r.human - r.bot, 0) / cell.length);
  console.log(`${key.padEnd(18)} ${wins}/${cell.length} wins, avg margin ${margin >= 0 ? '+' : ''}${margin}`);
}

// Ladder sanity: average human should beat easy MORE than they beat hard.
const rate = (k) => {
  const c = results[k] ?? [];
  return c.length ? c.filter((r) => r.humanWon).length / c.length : 0;
};
const laddered = rate('average/duckling') >= rate('average/giraffe');
console.log(`\nladder direction (avg human: easy >= boss): ${laddered ? 'OK' : 'INVERTED'}`);
process.exit(failures === 0 ? 0 : 1);
