import { useEffect, useState } from 'react';
import { audioContext } from './sound';

/**
 * Live level (0..1) of a playing <audio> element: the bot's voice, the
 * spectator feed. Same envelope as useAudioLevel, so the speaking ring moves
 * the same way whether the voice is a person's mic or an mp3.
 *
 * createMediaElementSource is PERMANENT and single-shot: once an element is
 * tapped its sound only ever reaches the speakers through that graph, and a
 * second tap throws. So each element is tapped once, cached for its lifetime,
 * and only ever through the app's one unlocked AudioContext (sound.ts). If
 * that context is not running we do not tap at all — a suspended graph would
 * silence the bot, and a still ring is a far cheaper failure than a mute bot.
 */
const taps = new WeakMap<HTMLMediaElement, AnalyserNode>();

function tap(el: HTMLMediaElement): AnalyserNode | null {
  const have = taps.get(el);
  if (have) return have;
  const ctx = audioContext();
  if (!ctx || ctx.state !== 'running') return null;
  try {
    const source = ctx.createMediaElementSource(el);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.4;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    taps.set(el, analyser);
    return analyser;
  } catch {
    return null;
  }
}

export function useElementLevel(el: HTMLMediaElement | null): number {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!el) {
      setLevel(0);
      return;
    }
    let analyser: AnalyserNode | null = null;
    const data = new Uint8Array(128);
    let held = 0;
    const id = setInterval(() => {
      // The context may not have been running at mount (the unlock tap can
      // land a beat later), so keep trying until the tap takes.
      if (!analyser) analyser = tap(el);
      if (!analyser) return;
      const ctx = audioContext();
      if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => {});
      if (el.paused || el.ended) {
        held = 0;
        setLevel((prev) => (prev === 0 ? prev : 0));
        return;
      }
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const next = Math.min(1, sum / data.length / 70);
      held = next >= held ? next : held * 0.5;
      const snapped = held < 0.02 ? 0 : held;
      setLevel((prev) => (Math.abs(snapped - prev) > 0.015 ? snapped : prev));
    }, 80);
    return () => clearInterval(id);
  }, [el]);

  return level;
}
