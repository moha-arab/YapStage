// End-to-end server-STT probe: runs a REAL debate on the target server where
// one debater's turns arrive as recorded AUDIO (the new any-browser pipeline)
// alongside a decoy text chunk that Whisper's output must replace. If the
// judge's verdict quotes the audio's marker phrase, the whole chain works:
// upload -> Cloudflare Whisper -> transcript -> judge.
// Usage: URL=https://www.yapstage.com node scripts/stt-probe.mjs
import { io } from 'socket.io-client';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const URL = process.env.URL ?? 'http://localhost:3000';
const here = path.dirname(fileURLToPath(import.meta.url));
const wav = readFileSync(path.join(here, 'stt-probe.wav'));
console.log(`audio clip: ${wav.length} bytes -> ${URL}`);

const connect = () => io(URL, { forceNew: true, transports: ['websocket'] });
const emitP = (sock, ev, payload) => new Promise((res) => sock.emit(ev, payload, res));
const once = (sock, ev, timeoutMs = 30000) =>
  new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(`timeout waiting for ${ev}`)), timeoutMs);
    sock.once(ev, (p) => {
      clearTimeout(t);
      res(p);
    });
  });

const a = connect();
const b = connect();
const created = await emitP(a, 'lobby:create', { sessionId: 'probe-a', name: 'whisperer' });
const code = created.update.code;
await emitP(b, 'lobby:join', { code, sessionId: 'probe-b', name: 'chunker' });
console.log(`lobby ${code}`);

a.emit('pick:topic', 'money-happiness');
b.emit('pick:topic', 'money-happiness');
a.emit('pick:side', 'FOR');
b.emit('pick:side', 'AGAINST');
await new Promise((r) => setTimeout(r, 400));
const started = once(a, 'debate:start', 15000);
a.emit('pick:confirm');
b.emit('pick:confirm');
await started;
console.log('debate started (real speed, ~5 min)...');

a.on('debate:phase', (p) => {
  console.log(`  phase ${p.stepIndex} (${p.activeSpeaker}, ${p.seconds}s)`);
  if (p.activeSpeaker === 'FOR') {
    // the decoy: browser-STT text that Whisper's transcription must replace
    a.emit('speech:chunk', {
      stepIndex: p.stepIndex,
      text: 'DECOY BROWSER TEXT this should not reach the judge for step ' + p.stepIndex,
    });
    // the real thing: recorded audio of this turn
    a.emit('audio:turn', { stepIndex: p.stepIndex, mime: 'audio/wav', data: wav });
  } else {
    b.emit('speech:chunk', {
      stepIndex: p.stepIndex,
      text: 'happiness comes from purpose and relationships not money and my opponent keeps repeating one point',
    });
  }
});

await once(a, 'debate:ended', 400000);
console.log('debate ended; waiting for transcription + judge...');

const verdict = await Promise.race([
  once(a, 'verdict:result', 120000),
  once(a, 'verdict:status', 120000).then((s) =>
    s.state === 'failed' ? Promise.reject(new Error('judge failed: ' + (s.message ?? ''))) : once(a, 'verdict:result', 120000),
  ),
]);

const v = verdict.verdict;
const blob = JSON.stringify(v).toLowerCase();
const markerHit = blob.includes('purple');
const decoyLeaked = blob.includes('decoy');
console.log('\nVERDICT SUMMARY:', v.summary);
console.log('FOR best quote:', v.bestQuote.FOR);
console.log('FOR feedback:', JSON.stringify(v.feedback.FOR));
console.log(`\nmarker phrase ("purple on Tuesdays") in verdict: ${markerHit ? 'YES - Whisper pipeline CONFIRMED' : 'no (check quotes above manually)'}`);
console.log(`decoy text leaked to judge: ${decoyLeaked ? 'YES - REPLACEMENT FAILED' : 'no - replacement worked'}`);

a.disconnect();
b.disconnect();
process.exit(decoyLeaked ? 1 : 0);
