// Speak a bot's turn: play the server's synthesized audio (ElevenLabs mp3) when
// it's there, otherwise fall back to the browser voice. Always calls onDone when
// speech finishes (or errors) so the debate advances and never stalls.
//
// MOBILE AUTOPLAY, the thing that made this look broken on phones:
// iOS grants playback permission to an ELEMENT, not to the page. A fresh
// `new Audio()` created during the bot's turn has never been touched by a user,
// so play() rejects, we fall through to browser speech, and the bot sounds like
// a robot. Worse, the rejection resolves instantly, so the turn ended before
// anything was said and the voice then talked over the human's turn.
// The fix is one long-lived element, unlocked by playing it silently inside the
// tap that starts the debate, then reused forever by swapping its src.

let el: HTMLAudioElement | null = null;
let unlocked = false;
let currentUrl: string | null = null;
/** Bumped by every playBotTurn. A turn's timers and handlers check it, so a
    turn that has been replaced can never speak, cut the new one off, or free
    its audio. */
let turn = 0;

/** A tenth of a second of silence as a 16-bit PCM WAV, built here rather than
    pasted in. The silent MP3 this replaces did not decode in Chrome: play()
    rejected with NotSupportedError on every start, so the element was never
    unlocked, every tap re-ran the unlock, and its error event fired whatever
    onerror the last turn had left behind (which read the PREVIOUS verdict out
    loud through the browser voice). Plain PCM WAV decodes in every browser
    that has an audio element. Shared with the spectator audio. */
export const SILENT_WAV: string = (() => {
  const rate = 22_050;
  const samples = rate / 10;
  const bytes = new Uint8Array(44 + samples * 2); // the samples stay zero: silence
  const v = new DataView(bytes.buffer);
  const tag = (at: number, s: string) => {
    for (let i = 0; i < s.length; i++) bytes[at + i] = s.charCodeAt(i);
  };
  tag(0, 'RIFF');
  v.setUint32(4, 36 + samples * 2, true);
  tag(8, 'WAVE');
  tag(12, 'fmt ');
  v.setUint32(16, 16, true); // fmt chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); // byte rate
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  tag(36, 'data');
  v.setUint32(40, samples * 2, true);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return `data:audio/wav;base64,${btoa(bin)}`;
})();

function element(): HTMLAudioElement {
  if (!el) {
    el = new Audio();
    el.preload = 'auto';
    // Keeps iOS from handing playback to the lock screen / picture-in-picture.
    el.setAttribute('playsinline', '');
  }
  return el;
}

/** The element itself, for the speaking ring to read its level off. */
export function botVoiceElement(): HTMLAudioElement {
  return element();
}

/** Call from a real user gesture (the tap that starts a debate). Without this
    the bot is silent-then-robotic on every phone. */
export function unlockBotVoice(): void {
  if (unlocked) return;
  // A turn owns the element: swapping in the silence would cut it off.
  if (currentUrl) return;
  try {
    const a = element();
    // Nothing a previous turn left on the element may react to this.
    a.onended = null;
    a.onerror = null;
    const at = turn;
    a.src = SILENT_WAV;
    a.volume = 0;
    const p = a.play();
    if (p && typeof p.then === 'function') {
      void p
        .then(() => {
          unlocked = true;
          // Only stop the silence: a turn may have taken the element since.
          if (turn === at && !currentUrl) {
            a.pause();
            a.currentTime = 0;
          }
          a.volume = 1;
        })
        .catch(() => {
          // Autoplay still refused. We'll try again on the next gesture.
          a.volume = 1;
        });
    } else {
      unlocked = true;
      a.volume = 1;
    }
  } catch {
    // No audio element available: browser speech remains the fallback.
  }
}

function releaseUrl(): void {
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
}

export function stopBotVoice(): void {
  if (el) {
    // Clear the handlers first: emptying the element must not look like an
    // error to a turn that is over.
    el.onended = null;
    el.onerror = null;
    el.pause();
    try {
      el.removeAttribute('src');
      el.load();
    } catch {
      // ignore
    }
  }
  releaseUrl();
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

/** Roughly how long this text takes to say. Used as a FLOOR so a blocked or
    instantly-resolving voice can't end the bot's turn in milliseconds. */
function spokenMs(text: string): number {
  return Math.max(3500, (text?.length ?? 40) * 65);
}

function browserSpeak(text: string, lang: 'en' | 'ar', onDone: () => void): void {
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    onDone();
  };
  if (!('speechSynthesis' in window) || !text) {
    setTimeout(finish, spokenMs(text));
    return;
  }
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    u.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    const v = voices.find((vo) => vo.lang?.toLowerCase().startsWith(lang));
    if (v) u.voice = v;
    // Some browsers never fire onend for long text — belt-and-suspenders timer.
    const timer = setTimeout(finish, spokenMs(text) + 4000);
    u.onend = () => {
      clearTimeout(timer);
      finish();
    };
    u.onerror = () => {
      clearTimeout(timer);
      finish();
    };
    window.speechSynthesis.speak(u);
  } catch {
    setTimeout(finish, spokenMs(text));
  }
}

export function playBotTurn(
  text: string,
  audio: ArrayBuffer | undefined,
  mime: string | undefined,
  lang: 'en' | 'ar',
  onDone: () => void,
  maxMs?: number,
): void {
  stopBotVoice();
  const mine = ++turn;
  const live = () => mine === turn;
  const startedAt = Date.now();
  let done = false;
  let cutoff: ReturnType<typeof setTimeout> | null = null;

  // A turn must never end before the words could plausibly have been said. If
  // playback was blocked and the promise rejected in 5ms, holding the floor is
  // what stops the bot from "passing instantly, then talking over you".
  // A turn replaced by a newer one is over and says nothing more.
  const floor = Math.min(spokenMs(text), maxMs ?? Number.MAX_SAFE_INTEGER);
  const finish = (respectFloor: boolean) => {
    if (done || !live()) return;
    const waited = Date.now() - startedAt;
    if (respectFloor && waited < floor) {
      setTimeout(() => finish(false), floor - waited);
      return;
    }
    done = true;
    if (cutoff) clearTimeout(cutoff);
    onDone();
  };
  // The browser voice reads THIS turn's text only, and only while this is
  // still the turn.
  const fallback = () => {
    if (!live()) return;
    browserSpeak(text, lang, () => finish(true));
  };

  // The bot gets the same shot clock a human gets: when its speaking allowance
  // expires, the mic is taken away mid-sentence — no monologuing past the bell.
  if (maxMs && maxMs > 0) {
    cutoff = setTimeout(() => {
      if (!live()) return;
      stopBotVoice();
      finish(false);
    }, maxMs);
  }

  if (audio && audio.byteLength > 200) {
    try {
      const blob = new Blob([audio], { type: mime || 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      currentUrl = url;
      const a = element();
      // Safety net for an element whose onended never fires. It must NOT end
      // the turn while audio is audibly playing — that advanced the debate
      // with the voice still going, so the bot talked into the next turn. If
      // the element is genuinely mid-clip, wait; the maxMs cutoff still
      // bounds it.
      let safety: ReturnType<typeof setTimeout> | null = null;
      const armSafety = (ms: number) => {
        safety = setTimeout(() => {
          if (!live()) return;
          if (!a.paused && !a.ended && a.currentTime > 0) {
            armSafety(5000);
            return;
          }
          releaseUrl();
          finish(false);
        }, ms);
      };
      armSafety(spokenMs(text) + 6000);
      a.onended = () => {
        if (safety) clearTimeout(safety);
        if (!live()) return;
        releaseUrl();
        finish(false); // real audio finished: it genuinely took its time
      };
      a.onerror = () => {
        if (safety) clearTimeout(safety);
        if (!live()) return;
        releaseUrl();
        fallback();
      };
      a.src = url;
      a.volume = 1;
      void a.play().catch(() => {
        if (safety) clearTimeout(safety);
        if (!live()) return;
        releaseUrl();
        // Blocked (no gesture yet). Speak it, and hold the floor either way.
        fallback();
      });
      return;
    } catch {
      fallback();
      return;
    }
  }
  fallback();
}
