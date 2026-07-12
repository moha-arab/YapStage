import { socket } from './socket';

// Chrome-only Web Speech API. All the quirks live in this file:
// - Chrome silently ends recognition after ~60s or long silence -> restart
// - start() on a running recognizer throws InvalidStateError -> running flag
// - final results can arrive 1-2s after stop() -> keep handler attached,
//   the server accepts trailing chunks for the previous step
const SRCls: any =
  (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;

export const speechSupported: boolean = Boolean(SRCls);

let rec: any = null;
let running = false;
let shouldListen = false;
let currentStep = -1;
let consecutiveErrors = 0;
let warned = false;
let onChunk: (() => void) | null = null;
let speechLang = 'en-US';

/** Match recognition to the UI language. Applies from the next turn. */
export function setSpeechLang(lang: 'en' | 'ar'): void {
  speechLang = lang === 'ar' ? 'ar-SA' : 'en-US';
  if (rec) rec.lang = speechLang;
}

/** UI hook: fires whenever a final transcript chunk is actually captured. */
export function setOnChunk(cb: (() => void) | null): void {
  onChunk = cb;
}

function ensure(): void {
  if (rec || !speechSupported) return;
  rec = new SRCls();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = speechLang;
  rec.onstart = () => {
    running = true;
  };
  rec.onend = () => {
    running = false;
    if (!shouldListen) return;
    // Some Chromium forks (Brave etc.) expose the API but their backend fails
    // every attempt with 'network'. Back off exponentially and give up for the
    // turn instead of hot-looping a restart every 250ms.
    if (consecutiveErrors >= 5) {
      shouldListen = false;
      if (!warned) {
        warned = true;
        console.warn('[speech] recognition backend keeps failing — this side will not be transcribed. Use desktop Chrome.');
      }
      return;
    }
    setTimeout(tryStart, Math.min(2000, 250 * 2 ** consecutiveErrors));
  };
  rec.onerror = (e: any) => {
    if (e?.error === 'not-allowed') {
      shouldListen = false;
      return;
    }
    if (e?.error !== 'no-speech' && e?.error !== 'aborted') consecutiveErrors++;
    // the onend restart path handles recovery
  };
  rec.onresult = (e: any) => {
    consecutiveErrors = 0; // real results = backend healthy
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result = e.results[i];
      if (result.isFinal) {
        const text = String(result[0]?.transcript ?? '').trim();
        if (text && currentStep >= 0) {
          socket.emit('speech:chunk', { stepIndex: currentStep, text });
          onChunk?.();
        }
      }
    }
  };
}

function tryStart(): void {
  if (!rec || running || !shouldListen) return;
  try {
    rec.start();
  } catch {
    // InvalidStateError if already started; onend/restart will recover
  }
}

export function startTurn(stepIndex: number): void {
  if (!speechSupported) return;
  ensure();
  currentStep = stepIndex;
  shouldListen = true;
  consecutiveErrors = 0; // fresh turn, fresh chances
  tryStart();
}

export function stopTurn(): void {
  shouldListen = false;
  try {
    rec?.stop();
  } catch {
    // ignore
  }
}
