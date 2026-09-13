// Server-side speech-to-text via Cloudflare Workers AI (Whisper large-v3-turbo).
// This is what frees YapStage from "Chrome on a laptop": every browser can
// record audio; Whisper transcribes it better than any browser recognizer,
// in English AND Arabic (auto-detected). ~$0.0005 per audio minute.
// Docs: https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/

import { errTag, event } from './stats.js';

const MODEL = '@cf/openai/whisper-large-v3-turbo';

// Whisper does not return empty text for silence — it HALLUCINATES. Trained on
// scraped subtitle tracks, it emits the boilerplate that pads the end of those
// files: "Продолжение следует...", "Subtitles by the Amara.community", "Thanks
// for watching!", and so on. Left alone this is worse than no transcript at
// all: rule 4 lets the judge handle a missing side gracefully, but fabricated
// text looks exactly like speech, so it gets scored, quoted back as a "best
// quote", and coached on. Observed live: a fully silent debate came back as
// 'Продолжение следует... You Продолжение следует... You.'
const SILENCE_ARTIFACTS = [
  /продолжение следует/i,
  /subtitles?\s+(by|created|provided)/i,
  /amara\.org|amara\.community/i,
  /thanks?\s+for\s+watching/i,
  /subscribe\s+to\s+(my|our)\s+channel/i,
  /редактор субтитров/i,
  /корректор/i,
  /^\s*(you|thank you|thanks|bye|okay|ok|so|uh|um|hmm|\.|\?|!)[\s.?!]*$/i,
  /^\s*♪+\s*$/,
  /^\s*\[\s*(music|silence|applause|blank_audio|inaudible)\s*\]\s*$/i,
  /^\s*\(\s*(music|silence|applause|inaudible)\s*\)\s*$/i,
];

/** Strip Whisper's silence boilerplate. Returns '' when nothing real is left.
    Exported for the smoke test: this is the guard between a dead mic and a
    debater being scored on fabricated speech. */
export function stripHallucinations(raw: string): string {
  // Split on sentence-ish boundaries so one artifact doesn't nuke real speech
  // sitting beside it, and so repeated artifacts collapse.
  const parts = raw
    .split(/(?<=[.!?؟۔])\s+|\n+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .filter((p) => !SILENCE_ARTIFACTS.some((re) => re.test(p)));

  const kept = parts.join(' ').trim();
  if (!kept) return '';

  // A turn that is one short fragment repeated is the other failure shape
  // (Whisper looping on room tone). Two distinct words minimum to count.
  const words = kept.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
  if (words.length < 3) return '';
  if (new Set(words).size < 2) return '';
  return kept;
}

export function sttConfigured(): boolean {
  return Boolean(process.env.CF_ACCOUNT_ID && process.env.CF_AI_API_TOKEN);
}

/** Transcribe one turn's audio. Returns null on any failure — the caller
    falls back to whatever browser transcription arrived. */
export async function transcribe(audio: Buffer): Promise<string | null> {
  if (!sttConfigured()) return null;
  const url = `https://api.cloudflare.com/client/v4/accounts/${process.env.CF_ACCOUNT_ID}/ai/run/${MODEL}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.CF_AI_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ audio: audio.toString('base64') }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`[stt] Workers AI ${res.status}`);
      event('stt_failed', { status: res.status });
      return null;
    }
    const data = (await res.json()) as {
      result?: {
        text?: string;
        transcription_info?: { text?: string };
        segments?: { text?: string }[];
      };
    };
    // Defensive parsing: the text has moved between fields across model versions.
    const r = data.result;
    const text =
      r?.text ??
      r?.transcription_info?.text ??
      (Array.isArray(r?.segments) ? r.segments.map((s) => s.text ?? '').join(' ') : '');
    const clean = stripHallucinations(String(text ?? '').trim());
    if (clean.length > 0) {
      event('stt_ok');
      return clean;
    }
    // Silence (real or hallucinated) reports as nothing said, which is exactly
    // what the judge is built to handle.
    event('stt_empty');
    return null;
  } catch (err) {
    console.error(`[stt] transcription failed: ${errTag(err)}`);
    event('stt_failed', { err: errTag(err) });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
