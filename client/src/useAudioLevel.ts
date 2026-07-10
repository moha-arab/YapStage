import { useEffect, useState } from 'react';

/**
 * Live audio level (0..1) for a MediaStream — powers the green-room mic
 * meters so a dead microphone is obvious BEFORE the debate, not after the
 * verdict comes back with one side missing.
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
    source.connect(analyser);
    const data = new Uint8Array(analyser.frequencyBinCount);

    // 10Hz is plenty for a meter and avoids re-rendering at 60fps.
    const id = setInterval(() => {
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const next = Math.min(1, sum / data.length / 70);
      setLevel((prev) => (Math.abs(next - prev) > 0.015 ? next : prev));
    }, 100);

    return () => {
      clearInterval(id);
      source.disconnect();
      void ctx.close().catch(() => {});
    };
  }, [stream]);

  return level;
}
