// The opening: a beat between typing the address and the game. The two quote
// marks land one after the other, the wordmark comes up under them, and the
// house lights go down on the lobby. About a second, once per tab.
//
// Two jobs, one drawing. As an OVERLAY it is the animation, laid over the app
// so /auth/me and the fonts load underneath it and nothing waits on it. As the
// HOLD it is the same lockup at rest, standing in for the empty plum div the
// app used to paint while it asked the server who you are; the first frame of
// YapStage was a blank screen and this is the fix. Because both are the same
// lockup at the same size, the overlay fading out over the hold is invisible.
//
// It never traps anyone: any tap or key ends it, it caps itself at 1.4s even if
// the account has not answered, and reduced motion gets a still lockup and a
// short fade.
import { useEffect, useState } from 'react';
import Brand from './Brand';

const SPLASH_KEY = 'yap.splash';

/* The mark lands by 0.85s and the fade takes the rest of the second. If the
   account is still in flight at 0.85s the mark waits for it, but only up to
   the cap: a slow /auth/me is the hold's problem, not the animation's. */
const NATURAL_MS = 850;
const CAP_MS = 1150;
const REDUCED_MS = 300;
const FADE_MS = 250;
/* The wordmark comes up after the quotes have landed, and never in the serif
   fallback: on a cold cache Ultra can take a few hundred ms, and a splash is
   the one screen where a font swap would be seen. */
const WORD_AT_MS = 350;

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/* Brand.tsx sizes the word from the mark, so the phone size is decided here
   rather than fought over in CSS. Read once: this is a one-second screen. */
function markSize(): number {
  try {
    return window.matchMedia('(max-width: 620px)').matches ? 48 : 64;
  } catch {
    return 64;
  }
}

/** Once per tab, and never on a link that is going somewhere: an invite code
    or the return leg of a Google sign-in lands on the lobby twice, and a
    splash on each of those is two splashes. Storage blocked reads as "play
    it": one extra opening beats none. */
export function splashWanted(): boolean {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.has('code') || q.has('auth')) return false;
    if (sessionStorage.getItem(SPLASH_KEY)) return false;
  } catch {
    // storage blocked
  }
  return true;
}

interface Props {
  /** The boot screen: the lockup at rest, no timer, no exit. */
  hold?: boolean;
  /** Overlay only: the app underneath knows who you are, so it may fade. */
  ready?: boolean;
  onDone?: () => void;
}

export default function Splash({ hold, ready, onDone }: Props) {
  const [reduced] = useState(reducedMotion);
  const [size] = useState(markSize);
  const [elapsed, setElapsed] = useState(false);
  const [capped, setCapped] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const [word, setWord] = useState(() => Boolean(hold) || reducedMotion());

  useEffect(() => {
    if (hold) return;
    try {
      sessionStorage.setItem(SPLASH_KEY, '1');
    } catch {
      // storage blocked: it plays again next load, which is fine
    }
    const natural = setTimeout(() => setElapsed(true), reduced ? REDUCED_MS : NATURAL_MS);
    const cap = setTimeout(() => setCapped(true), CAP_MS);
    const skip = () => setSkipped(true);
    window.addEventListener('pointerdown', skip);
    window.addEventListener('keydown', skip);
    return () => {
      clearTimeout(natural);
      clearTimeout(cap);
      window.removeEventListener('pointerdown', skip);
      window.removeEventListener('keydown', skip);
    };
  }, [hold, reduced]);

  useEffect(() => {
    if (hold || word) return;
    let on = true;
    const fonts = 'fonts' in document ? document.fonts.load('1em Ultra').catch(() => undefined) : Promise.resolve();
    const beat = new Promise<void>((res) => setTimeout(res, WORD_AT_MS));
    void Promise.all([fonts, beat]).then(() => {
      if (on) setWord(true);
    });
    return () => {
      on = false;
    };
  }, [hold, word]);

  const leaving = !hold && (skipped || capped || (elapsed && Boolean(ready)));
  useEffect(() => {
    if (!leaving) return;
    const id = setTimeout(() => onDone?.(), FADE_MS);
    return () => clearTimeout(id);
  }, [leaving, onDone]);

  return (
    <div
      className={`splash ${hold ? 'splash-hold' : ''} ${word ? 'splash-word-in' : ''} ${leaving ? 'splash-out' : ''}`}
      aria-hidden="true"
    >
      <Brand size={size} />
    </div>
  );
}
