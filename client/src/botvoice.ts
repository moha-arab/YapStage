// Speak a bot's turn: play the server's synthesized audio (ElevenLabs mp3) when
// it's there, otherwise fall back to the browser voice. Always calls onDone when
// speech finishes (or errors) so the debate advances and never stalls.

let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;

export function stopBotVoice(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

function fallbackMs(text: string): number {
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
    setTimeout(finish, fallbackMs(text));
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
    const timer = setTimeout(finish, fallbackMs(text) + 4000);
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
    setTimeout(finish, fallbackMs(text));
  }
}

export function playBotTurn(
  text: string,
  audio: ArrayBuffer | undefined,
  mime: string | undefined,
  lang: 'en' | 'ar',
  onDone: () => void,
): void {
  stopBotVoice();
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    onDone();
  };

  if (audio && audio.byteLength > 200) {
    try {
      const blob = new Blob([audio], { type: mime || 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      currentUrl = url;
      const a = new Audio(url);
      currentAudio = a;
      const safety = setTimeout(finish, fallbackMs(text) + 6000);
      const cleanup = () => {
        clearTimeout(safety);
        if (currentUrl === url) {
          URL.revokeObjectURL(url);
          currentUrl = null;
        }
        if (currentAudio === a) currentAudio = null;
      };
      a.onended = () => {
        cleanup();
        finish();
      };
      a.onerror = () => {
        cleanup();
        browserSpeak(text, lang, finish);
      };
      void a.play().catch(() => {
        cleanup();
        browserSpeak(text, lang, finish);
      });
      return;
    } catch {
      browserSpeak(text, lang, finish);
      return;
    }
  }
  browserSpeak(text, lang, finish);
}
