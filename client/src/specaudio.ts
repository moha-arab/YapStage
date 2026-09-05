// Spectator audio: live debate clips arrive as they happen (a bot's whole
// turn, or ~5s segments of a human turn) and play in arrival order. Its own
// long-lived element, separate from the bot voice, unlocked inside the tap
// that starts watching — iOS grants playback per ELEMENT, the lesson the bot
// voice taught us the hard way.

let el: HTMLAudioElement | null = null;
let unlocked = false;
const queue: string[] = [];
let playing = false;

const SILENT_MP3 =
  'data:audio/mpeg;base64,//uQxAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCA' +
  'gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgP////////' +
  '////////////////////////////////8AAAA5TEFNRTMuMTAwAc0AAAAAAAAAABSAJAJAQgAA' +
  'gAAAAnGDVYEBAAAAAAAAAAAAAAAAAAAA';

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
  try {
    const a = element();
    a.src = SILENT_MP3;
    a.volume = 0;
    const p = a.play();
    if (p && typeof p.then === 'function') {
      void p
        .then(() => {
          a.pause();
          a.volume = 1;
          unlocked = true;
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
