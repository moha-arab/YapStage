// Synthesized stage sound. No audio assets: everything is built from noise
// and oscillators using standard drum-synthesis recipes. Every hit gets a
// few ms of attack ramp (instant attacks = click transients = ear pain) and
// the whole chain runs through a compressor so overlapping hits can't spike.
// AudioContext is created/resumed inside a user-gesture handler (the green
// room confirm click) so Chrome's autoplay policy never blocks the verdict.

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let master: DynamicsCompressorNode | null = null;
let muted = false;
let ttsPrimed = false;

export function isSoundMuted(): boolean {
  return muted;
}

export function setSoundMuted(m: boolean): void {
  muted = m;
  if (m && 'speechSynthesis' in window) window.speechSynthesis.cancel();
}

export function initAudio(): void {
  try {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createDynamicsCompressor();
      master.threshold.value = -18;
      master.ratio.value = 4;
      master.attack.value = 0.003;
      master.release.value = 0.25;
      // Global trim: stage sound sits UNDER voices, never competes with them.
      const trim = ctx.createGain();
      trim.gain.value = 0.55;
      master.connect(trim);
      trim.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    if (ctx && !noise) {
      const len = Math.floor(ctx.sampleRate * 0.3);
      noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    // Chrome loads speechSynthesis voices asynchronously; poke the list early
    // so a voice is ready by verdict time. iOS Safari additionally refuses
    // speak() calls that never happened inside a user gesture — prime it with
    // a silent utterance now (we're inside the confirm click).
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      if (!ttsPrimed) {
        ttsPrimed = true;
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        window.speechSynthesis.speak(u);
      }
    }
  } catch {
    ctx = null;
  }
}

/** Gain with a soft attack: never step from silence to full (that pops). */
function envelope(at: number, peak: number, decayTo: number): GainNode {
  const g = ctx!.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(peak, at + 0.006);
  g.gain.exponentialRampToValueAtTime(0.001, at + decayTo);
  g.connect(master!);
  return g;
}

/** One snare hit: rounded noise crack + short drum-body tone. */
function snare(at: number, velocity: number): void {
  if (!ctx || !noise || !master) return;
  const crack = ctx.createBufferSource();
  crack.buffer = noise;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1500;
  bp.Q.value = 0.5;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 4200; // darker: the 5-8k band is what stings ears
  const cg = envelope(at, velocity, 0.12);
  crack.connect(bp);
  bp.connect(lp);
  lp.connect(cg);
  crack.start(at);
  crack.stop(at + 0.14);

  const body = ctx.createOscillator();
  body.type = 'triangle';
  body.frequency.setValueAtTime(185, at);
  body.frequency.exponentialRampToValueAtTime(135, at + 0.05);
  const bg = envelope(at, velocity * 0.5, 0.08);
  body.connect(bg);
  body.start(at);
  body.stop(at + 0.1);
}

/** Single snare tick, one per category-score reveal. */
export function playHit(): void {
  if (muted) return;
  initAudio();
  if (!ctx || !noise) return;
  snare(ctx.currentTime + 0.02, 0.28);
}

/**
 * Accelerating two-hand snare roll: starts soft, builds, human timing jitter,
 * ends on an accent that hands off to the crash.
 */
export function playDrumRoll(durationMs = 3000): void {
  if (muted) return;
  initAudio();
  if (!ctx || !noise) return;
  const start = ctx.currentTime + 0.05;
  const dur = durationMs / 1000;
  let t = 0;
  let interval = 0.095;
  while (t < dur - 0.1) {
    const progress = t / dur;
    const velocity = (0.07 + 0.17 * progress) * (0.85 + Math.random() * 0.3);
    const jitter = (Math.random() - 0.5) * 0.012;
    snare(start + t + jitter, Math.min(0.28, velocity));
    t += interval;
    interval = Math.max(0.048, interval * 0.972); // builds, but never machine-gun
  }
  snare(start + dur, 0.38);
}

/** Crash: metallic inharmonic partials + noise wash + low thump. */
export function playCrash(): void {
  if (muted) return;
  initAudio();
  if (!ctx || !noise || !master) return;
  const at = ctx.currentTime + 0.02;

  // Sine partials, not square: square waves at 3-9kHz are literal ear-stabs.
  const partials = [3117, 4110, 5253, 6488];
  for (const freq of partials) {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * (0.99 + Math.random() * 0.02);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2800;
    const g = envelope(at, 0.035, 1.3 + Math.random() * 0.4);
    osc.connect(hp);
    hp.connect(g);
    osc.start(at);
    osc.stop(at + 1.9);
  }

  const wash = ctx.createBufferSource();
  wash.buffer = noise;
  wash.loop = true;
  const whp = ctx.createBiquadFilter();
  whp.type = 'highpass';
  whp.frequency.value = 4500;
  const wlp = ctx.createBiquadFilter();
  wlp.type = 'lowpass';
  wlp.frequency.value = 9000; // shimmer without the dog-whistle top end
  const wg = envelope(at, 0.12, 1.3);
  wash.connect(whp);
  whp.connect(wlp);
  wlp.connect(wg);
  wash.start(at);
  wash.stop(at + 1.6);

  const thump = ctx.createOscillator();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(115, at);
  thump.frequency.exponentialRampToValueAtTime(48, at + 0.28);
  const tg = envelope(at, 0.5, 0.4);
  thump.connect(tg);
  thump.start(at);
  thump.stop(at + 0.45);
}

/**
 * Pick the least-robotic voice available. Chrome desktop ships Google voices
 * that are far better than the OS defaults it would otherwise use.
 */
function pickVoice(langPrefix: string): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis.getVoices();
  const match = voices.filter((v) => v.lang.toLowerCase().startsWith(langPrefix));
  return (
    match.find((v) => /google/i.test(v.name) && /us/i.test(v.name)) ??
    match.find((v) => /google/i.test(v.name)) ??
    match.find((v) => /natural|neural|online/i.test(v.name)) ??
    match[0] ??
    null
  );
}

/** Browser TTS reads the judge's ruling. Free, local, skipped if unsupported. */
export function speak(text: string): void {
  if (muted || !text) return;
  if (!('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    // The judge answers in the debate's language; match the voice to it.
    const isArabic = /[؀-ۿ]/.test(text);
    const voice = pickVoice(isArabic ? 'ar' : 'en');
    if (voice) u.voice = voice;
    if (isArabic) u.lang = 'ar-SA';
    u.rate = 1.0;
    u.pitch = 1.0;
    window.speechSynthesis.speak(u);
  } catch {
    // best effort only
  }
}
