// Server-side speech-to-text via Cloudflare Workers AI (Whisper large-v3-turbo).
// This is what frees YapStage from "Chrome on a laptop": every browser can
// record audio; Whisper transcribes it better than any browser recognizer,
// in English AND Arabic (auto-detected). ~$0.0005 per audio minute.
// Docs: https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/

const MODEL = '@cf/openai/whisper-large-v3-turbo';

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
      console.error(`[stt] Workers AI ${res.status}: ${(await res.text()).slice(0, 200)}`);
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
    const clean = String(text ?? '').trim();
    return clean.length > 0 ? clean : null;
  } catch (err) {
    console.error('[stt] transcription failed:', err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
