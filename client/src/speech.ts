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

function ensure(): void {
  if (rec || !speechSupported) return;
  rec = new SRCls();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'en-US';
  rec.onstart = () => {
    running = true;
  };
  rec.onend = () => {
    running = false;
    if (shouldListen) setTimeout(tryStart, 250);
  };
  rec.onerror = (e: any) => {
    if (e?.error === 'not-allowed') shouldListen = false;
    // no-speech / aborted / network: the onend restart path handles it
  };
  rec.onresult = (e: any) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const result = e.results[i];
      if (result.isFinal) {
        const text = String(result[0]?.transcript ?? '').trim();
        if (text && currentStep >= 0) {
          socket.emit('speech:chunk', { stepIndex: currentStep, text });
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
