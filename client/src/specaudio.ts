// Spectator audio: live debate clips arrive as they happen (a bot's whole
// turn, or ~5s segments of a human turn) and play in arrival order. Its own
// long-lived element, separate from the bot voice, unlocked inside the tap
// that starts watching — iOS grants playback per ELEMENT, so an element the
// user has never tapped through stays blocked (see botvoice.ts).

import { SILENT_WAV } from './botvoice';

let el: HTMLAudioElement | null = null;
let unlocked = false;
const queue: string[] = [];
let playing = false;

function element(): HTMLAudioElement {
  if (!el) {
    el = new Audio();
    el.preload = 'auto';
    el.setAttribute('playsinline', '');
  }
  return el;
}

/** The element itself, for the speaking ring to read its level off. */
export function spectateAudioElement(): HTMLAudioElement {
  return element();
}

/** Call inside the click that starts spectating. */
export function unlockSpectateAudio(): void {
  if (unlocked) return;
  // A clip owns the element: swapping in the silence would cut it off.
  if (playing) return;
  try {
    const a = element();
    // A finished clip's handlers must not fire for the silence (they would
    // advance a queue that is not playing).
    a.onended = null;
    a.onerror = null;
    a.src = SILENT_WAV;
    a.volume = 0;
    const p = a.play();
    if (p && typeof p.then === 'function') {
      void p
        .then(() => {
          unlocked = true;
          if (!playing) a.pause(); // a clip may have taken the element since
          a.volume = 1;
        })
        .catch(() => {
          a.volume = 1;
        });
    } else {
      a.volume = 1;
      unlocked = true;
    }
  } catch {
    // no audio element: spectating stays silent but functional
  }
}

function playNext(): void {
  const url = queue.shift();
  if (!url) {
    playing = false;
    return;
  }
  playing = true;
  const a = element();
  const done = () => {
    URL.revokeObjectURL(url);
    playNext();
  };
  a.onended = done;
  a.onerror = done;
  a.src = url;
  void a.play().catch(done);
}

/** Queue one live clip. Clips play back to back in arrival order. */
export function enqueueSpectateAudio(data: ArrayBuffer, mime: string): void {
  if (!data || data.byteLength < 200) return;
  // A spectator who tabs away can build a backlog; past ~12 clips we are no
  // longer "live", so drop the oldest rather than drift a minute behind.
  if (queue.length > 12) {
    const stale = queue.shift();
    if (stale) URL.revokeObjectURL(stale);
  }
  queue.push(URL.createObjectURL(new Blob([data], { type: mime || 'audio/mpeg' })));
  if (!playing) playNext();
}

export function stopSpectateAudio(): void {
  for (const url of queue.splice(0)) URL.revokeObjectURL(url);
  playing = false;
  if (el) {
    el.pause();
    try {
      el.removeAttribute('src');
      el.load();
    } catch {
      // ignore
    }
  }
}
