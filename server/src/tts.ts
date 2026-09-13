// Bot voice via ElevenLabs text-to-speech. Env-gated: when ELEVENLABS_API_KEY
// is set the bot speaks with a real voice; otherwise the client falls back to
// the free browser voice. eleven_turbo_v2_5 is low-latency AND multilingual, so
// Arabic bots work too. Returns null on any failure (caller degrades to browser).
import { errTag, event } from './stats.js';

const MODEL = 'eleven_turbo_v2_5';
// A voice confirmed available on the account. If a bot's assigned voice ever
// fails (retired id, tier limit), we fall back to this so the bot always speaks
// with a REAL voice instead of dropping to the robotic browser voice.
const FALLBACK_VOICE = 'nPczCjzI2devNBz1zQrb'; // Brian (current-gen, verified on this account)

export function ttsConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

interface TtsAttempt {
  buf: Buffer | null;
  /** Worth one retry: timeout, network error, 429, or 5xx. A 4xx (bad voice,
      exhausted quota, revoked key) is not — retrying just adds latency. */
  transient: boolean;
}

async function tryVoice(text: string, voiceId: string): Promise<TtsAttempt> {
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
      console.error(`[tts] ElevenLabs ${res.status} (voice ${voiceId})`);
      event('tts_failed', { status: res.status });
      return { buf: null, transient: res.status === 429 || res.status >= 500 };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    return { buf: buf.length < 200 ? null : buf, transient: false };
  } catch (err) {
    console.error(`[tts] failed: ${errTag(err)}`);
    event('tts_failed');
    return { buf: null, transient: true };
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

  // One blip must not turn the bot robotic for a turn: retry the character's
  // own voice once on transient failures, then try the known-good fallback
  // voice, and only then let the client degrade to the browser voice.
  let attempt = await tryVoice(clean, voiceId);
  if (!attempt.buf && attempt.transient) attempt = await tryVoice(clean, voiceId);
  if (!attempt.buf && voiceId !== FALLBACK_VOICE) attempt = await tryVoice(clean, FALLBACK_VOICE);
  if (!attempt.buf) return null;
  event('tts_ok');
  return { mime: 'audio/mpeg', data: attempt.buf };
}
