// Synthesized stage sound. No audio assets: everything is built from noise
// and oscillators using standard drum-synthesis recipes (snare = filtered
// noise crack + drum body tone; cymbal = inharmonic metallic partials).
// AudioContext is created/resumed inside a user-gesture handler (the green
// room Ready click) so Chrome's autoplay policy never blocks the verdict.

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let muted = false;

export function isSoundMuted(): boolean {
  return muted;
}

export function setSoundMuted(m: boolean): void {
  muted = m;
  if (m && 'speechSynthesis' in window) window.speechSynthesis.cancel();
}

export function initAudio(): void {
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    if (ctx && !noise) {
      const len = Math.floor(ctx.sampleRate * 0.3);
      noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    // Chrome loads speechSynthesis voices asynchronously; poke the list early
    // so a voice is ready by verdict time.
    if ('speechSynthesis' in window) window.speechSynthesis.getVoices();
  } catch {
    ctx = null;
  }
}

/** One snare hit: bright noise crack + short drum-body tone. */
function snare(at: number, velocity: number): void {
  if (!ctx || !noise) return;
  const crack = ctx.createBufferSource();
  crack.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1900;
  bp.Q.value = 0.7;
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(velocity, at);
  cg.gain.exponentialRampToValueAtTime(0.001, at + 0.11);
  crack.connect(bp);
  bp.connect(cg);
  cg.connect(ctx.destination);
  crack.start(at);
  crack.stop(at + 0.12);

  const body = ctx.createOscillator();
  body.type = 'triangle';
  body.frequency.setValueAtTime(190, at);
  body.frequency.exponentialRampToValueAtTime(140, at + 0.05);
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(velocity * 0.5, at);
  bg.gain.exponentialRampToValueAtTime(0.001, at + 0.07);
  body.connect(bg);
  bg.connect(ctx.destination);
  body.start(at);
  body.stop(at + 0.08);
}

/** Single snare tick, one per category-score reveal. */
export function playHit(): void {
  if (muted) return;
  initAudio();
  if (!ctx || !noise) return;
  snare(ctx.currentTime + 0.02, 0.5);
}

/**
 * Accelerating two-hand snare roll with human imperfection: velocity varies
 * hit to hit, timing drifts a few ms, and it crescendos into a final accent.
 */
export function playDrumRoll(durationMs = 3000): void {
  if (muted) return;
  initAudio();
  if (!ctx || !noise) return;
  const start = ctx.currentTime + 0.05;
  const dur = durationMs / 1000;
  let t = 0;
  let interval = 0.085;
  while (t < dur - 0.1) {
    const progress = t / dur;
    const velocity = (0.16 + 0.4 * progress) * (0.85 + Math.random() * 0.3);
    const jitter = (Math.random() - 0.5) * 0.012;
    snare(start + t + jitter, Math.min(0.65, velocity));
    t += interval;
    interval = Math.max(0.03, interval * 0.965);
  }
  snare(start + dur, 0.8); // the accent that hands off to the crash
}

/** Crash: metallic inharmonic partials + noise wash + low tom thump. */
export function playCrash(): void {
  if (muted) return;
  initAudio();
  if (!ctx || !noise) return;
  const at = ctx.currentTime + 0.02;

  // metallic character: six inharmonic square partials (classic cymbal recipe)
  const partials = [3117, 4110, 5253, 6488, 7615, 9037];
  for (const freq of partials) {
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq * (0.99 + Math.random() * 0.02);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2800;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.09, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 1.6 + Math.random() * 0.4);
    osc.connect(hp);
    hp.connect(g);
    g.connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 2.1);
  }

  // air
  const wash = ctx.createBufferSource();
  wash.buffer = noise;
  wash.loop = true;
  const whp = ctx.createBiquadFilter();
  whp.type = 'highpass';
  whp.frequency.value = 5500;
  const wg = ctx.createGain();
  wg.gain.setValueAtTime(0.3, at);
  wg.gain.exponentialRampToValueAtTime(0.001, at + 1.5);
  wash.connect(whp);
  whp.connect(wg);
  wg.connect(ctx.destination);
  wash.start(at);
  wash.stop(at + 1.6);

  // weight
  const thump = ctx.createOscillator();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(120, at);
  thump.frequency.exponentialRampToValueAtTime(48, at + 0.28);
  const tg = ctx.createGain();
  tg.gain.setValueAtTime(0.7, at);
  tg.gain.exponentialRampToValueAtTime(0.001, at + 0.4);
  thump.connect(tg);
  tg.connect(ctx.destination);
  thump.start(at);
  thump.stop(at + 0.45);
}

/**
 * Pick the least-robotic voice available. Chrome desktop ships Google voices
 * that are far better than the OS defaults it would otherwise use.
 */
function pickVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const en = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  return (
    en.find((v) => /google/i.test(v.name) && /us/i.test(v.name)) ??
    en.find((v) => /google/i.test(v.name)) ??
    en.find((v) => /natural|neural|online/i.test(v.name)) ??
    en[0] ??
    null
  );
}

/** Browser TTS reads the judge's ruling. Free, local, skipped if unsupported. */
export function speak(text: string): void {
  if (muted || !text) return;
  if (!('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) u.voice = voice;
    u.rate = 1.0;
    u.pitch = 1.0;
    window.speechSynthesis.speak(u);
  } catch {
    // best effort only
  }
}
