// Bot voice via ElevenLabs text-to-speech. Env-gated: when ELEVENLABS_API_KEY
// is set the bot speaks with a real voice; otherwise the client falls back to
// the free browser voice. eleven_turbo_v2_5 is low-latency AND multilingual, so
// Arabic bots work too. Returns null on any failure (caller degrades to browser).
import { event } from './stats.js';

const MODEL = 'eleven_turbo_v2_5';

export function ttsConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

export async function synthesize(
  text: string,
  voiceId: string,
): Promise<{ mime: string; data: Buffer } | null> {
  if (!ttsConfigured()) return null;
  const clean = text.trim().slice(0, 1500);
  if (!clean) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY!,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: clean,
          model_id: MODEL,
          voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.4 },
        }),
        signal: controller.signal,
      },
    );
    if (!res.ok) {
      console.error(`[tts] ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
      event('tts_failed', { status: res.status });
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 200) return null; // too small to be real audio
    event('tts_ok');
    return { mime: 'audio/mpeg', data: buf };
  } catch (err) {
    console.error('[tts] failed:', err);
    event('tts_failed');
    return null;
  } finally {
    clearTimeout(timer);
  }
}
