// Synthesized stage sound — no audio assets. The AudioContext is created and
// resumed inside a user-gesture handler (the green room Ready click) so
// Chrome's autoplay policy never blocks the verdict drum roll minutes later.

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
      const len = Math.floor(ctx.sampleRate * 0.25);
      noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
  } catch {
    ctx = null;
  }
}

function hit(at: number, dur: number, gainVal: number, freq: number): void {
  if (!ctx || !noise) return;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gainVal, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(ctx.destination);
  src.start(at);
  src.stop(at + dur + 0.05);
}

/** Accelerating snare roll, ~durationMs long. */
export function playDrumRoll(durationMs = 3000): void {
  if (muted) return;
  initAudio();
  if (!ctx || !noise) return;
  const start = ctx.currentTime + 0.05;
  const dur = durationMs / 1000;
  let t = 0;
  let interval = 0.095;
  while (t < dur) {
    const progress = t / dur;
    hit(start + t, 0.09, 0.12 + 0.3 * progress, 900 + 600 * progress);
    t += interval;
    interval = Math.max(0.028, interval * 0.962);
  }
}

/** Cymbal crash + low thump for the YapMaster stamp. */
export function playCrash(): void {
  if (muted) return;
  initAudio();
  if (!ctx || !noise) return;
  const at = ctx.currentTime + 0.02;

  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 3500;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + 1.4);
  src.connect(hp);
  hp.connect(g);
  g.connect(ctx.destination);
  src.start(at);
  src.stop(at + 1.5);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(140, at);
  osc.frequency.exponentialRampToValueAtTime(45, at + 0.3);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.6, at);
  og.gain.exponentialRampToValueAtTime(0.001, at + 0.4);
  osc.connect(og);
  og.connect(ctx.destination);
  osc.start(at);
  osc.stop(at + 0.45);
}

/** Browser TTS reads the judge's ruling. Free, local, skipped if unsupported. */
export function speak(text: string): void {
  if (muted || !text) return;
  if (!('speechSynthesis' in window)) return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.04;
    u.pitch = 1.15;
    window.speechSynthesis.speak(u);
  } catch {
    // best effort only
  }
}
