// Bot voice via ElevenLabs text-to-speech. Env-gated: when ELEVENLABS_API_KEY
// is set the bot speaks with a real voice; otherwise the client falls back to
// the free browser voice. eleven_turbo_v2_5 is low-latency AND multilingual, so
// Arabic bots work too. Returns null on any failure (caller degrades to browser).
import { event } from './stats.js';

const MODEL = 'eleven_turbo_v2_5';
// A voice confirmed available on the account. If a bot's assigned voice ever
// fails (retired id, tier limit), we fall back to this so the bot always speaks
// with a REAL voice instead of dropping to the robotic browser voice.
const FALLBACK_VOICE = 'nPczCjzI2devNBz1zQrb'; // Brian (current-gen, verified on this account)

export function ttsConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

async function tryVoice(text: string, voiceId: string): Promise<Buffer | null> {
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
          text,
          model_id: MODEL,
          voice_settings: { stability: 0.4, similarity_boost: 0.8, style: 0.35 },
        }),
        signal: controller.signal,
      },
    );
    if (!res.ok) {
      console.error(`[tts] ElevenLabs ${res.status} (voice ${voiceId}): ${(await res.text()).slice(0, 160)}`);
      event('tts_failed', { status: res.status });
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length < 200 ? null : buf;
  } catch (err) {
    console.error('[tts] failed:', err);
    event('tts_failed');
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function synthesize(
  text: string,
  voiceId: string,
): Promise<{ mime: string; data: Buffer } | null> {
  if (!ttsConfigured()) return null;
  const clean = text.trim().slice(0, 1500);
  if (!clean) return null;

  let buf = await tryVoice(clean, voiceId);
  if (!buf && voiceId !== FALLBACK_VOICE) buf = await tryVoice(clean, FALLBACK_VOICE);
  if (!buf) return null;
  event('tts_ok');
  return { mime: 'audio/mpeg', data: buf };
}
