import { useEffect, useState } from 'react';

/**
 * Live audio level (0..1) for a MediaStream — powers the mic meters and the
 * masks' mouths.
 *
 * Tuned for the MOUTH, not the meter (2026-08-22, his report: "I could stop
 * talking and it would keep talking"). Three things caused that lag:
 *   - the analyser's default smoothingTimeConstant of 0.8 keeps ~80% of the
 *     previous frame, so the reading takes most of a second to fall silent
 *   - a 100ms poll on top of that
 *   - a 0.05 speaking threshold that ambient room noise could clear
 * A mouth that trails your voice reads as broken lip-sync; a meter that is a
 * touch jumpy reads as a live meter. So: light smoothing, a faster poll, and
 * a fast release envelope — the level rises instantly with speech and decays
 * hard within ~200ms of silence.
 */
export function useAudioLevel(stream: MediaStream | null): number {
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) {
      setLevel(0);
      return;
    }
    const Ctx: typeof AudioContext =
      window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    let ctx: AudioContext;
    try {
      ctx = new Ctx();
    } catch {
      return;
    }
    void ctx.resume().catch(() => {});
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.4;
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    let held = 0;
    const id = setInterval(() => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const next = Math.min(1, sum / data.length / 70);
      // Instant attack, fast release: the mouth opens the moment you speak
      // and is closed two ticks after you stop.
      held = next >= held ? next : held * 0.5;
      const snapped = held < 0.02 ? 0 : held;
      setLevel((prev) => (Math.abs(snapped - prev) > 0.015 ? snapped : prev));
    }, 80);

    return () => {
      clearInterval(id);
      source.disconnect();
      void ctx.close().catch(() => {});
    };
  }, [stream]);

  return level;
}
