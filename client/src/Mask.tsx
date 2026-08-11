// Human masks. The bots are ANIMALS, so humans are MASKED FIGHTERS — you can
// always tell a machine from a person at a glance, and the fight-poster world
// gets its wrestling-poster half. `speaking` works the mouth off the mic, the
// same trick the bot avatars use, which is what lets a debate render with no
// camera at all.
//
// Drawn at the size they actually ship at (96-120px): details that read fine
// at 300px turn to mud on a card. Same lesson the capybara taught.

const D = '#1a1712';

export const MASKS: Record<string, string> = {
  // Luchador: the classic. Bold face-mask panel, laced back, eye holes.
  luchador: `
    <path d="M50 12 C72 12 84 28 84 50 C84 72 68 88 50 88 C32 88 16 72 16 50 C16 28 28 12 50 12Z" fill="#d8342c"/>
    <path d="M50 12 C58 12 64 16 68 22 L50 40 L32 22 C36 16 42 12 50 12Z" fill="#f2e8d5"/>
    <path d="M22 44 Q34 36 44 44 Q34 52 22 44Z" fill="#f2e8d5"/>
    <path d="M78 44 Q66 36 56 44 Q66 52 78 44Z" fill="#f2e8d5"/>
    <circle cx="35" cy="44" r="4.5" fill="${D}"/><circle cx="65" cy="44" r="4.5" fill="${D}"/>
    <circle cx="36.5" cy="42.5" r="1.5" fill="#fff"/><circle cx="66.5" cy="42.5" r="1.5" fill="#fff"/>
    <path d="M50 52 L46 62 L54 62Z" fill="#8f1f1a"/>
    <path class="bot-mouth" d="M38 72 Q50 80 62 72 L62 76 Q50 84 38 76Z" fill="#2a1410"/>
    <path d="M30 20 L34 26 M70 20 L66 26" stroke="#f2e8d5" stroke-width="3" stroke-linecap="round"/>`,
  // Kitsune: Japanese fox mask, all curves and paint strokes.
  kitsune: `
    <path d="M50 14 C70 14 82 30 80 52 C78 72 64 88 50 88 C36 88 22 72 20 52 C18 30 30 14 50 14Z" fill="#f4efe4"/>
    <path d="M26 20 L34 40 L18 36Z" fill="#f4efe4"/><path d="M74 20 L66 40 L82 36Z" fill="#f4efe4"/>
    <path d="M27 24 L32 37 L22 34Z" fill="#d8342c"/><path d="M73 24 L68 37 L78 34Z" fill="#d8342c"/>
    <path d="M26 42 Q36 34 46 42 Q36 50 26 42Z" fill="${D}"/>
    <path d="M74 42 Q64 34 54 42 Q64 50 74 42Z" fill="${D}"/>
    <path d="M22 32 Q32 28 42 33" stroke="#d8342c" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    <path d="M78 32 Q68 28 58 33" stroke="#d8342c" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    <path d="M24 58 Q34 62 40 58" stroke="#d8342c" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M76 58 Q66 62 60 58" stroke="#d8342c" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path class="bot-mouth" d="M42 74 Q50 82 58 74 Q50 78 42 74Z" fill="#d8342c"/>`,
  // Oni: horned demon mask, angry brow, tusks.
  oni: `
    <path d="M24 22 Q18 10 30 8 Q34 16 32 24Z" fill="#e8d7b8"/>
    <path d="M76 22 Q82 10 70 8 Q66 16 68 24Z" fill="#e8d7b8"/>
    <path d="M50 14 C70 14 84 30 84 52 C84 74 68 88 50 88 C32 88 16 74 16 52 C16 30 30 14 50 14Z" fill="#4d7fd6"/>
    <path d="M24 38 L44 44 L42 50 L24 46Z" fill="${D}"/>
    <path d="M76 38 L56 44 L58 50 L76 46Z" fill="${D}"/>
    <circle cx="34" cy="47" r="4" fill="#ffd23e"/><circle cx="66" cy="47" r="4" fill="#ffd23e"/>
    <path d="M40 30 Q50 26 60 30" stroke="${D}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path class="bot-mouth" d="M34 68 Q50 82 66 68 Q50 76 34 68Z" fill="#2a1410"/>
    <path d="M38 70 L41 78 L44 70Z" fill="#f4efe4"/><path d="M56 70 L59 78 L62 70Z" fill="#f4efe4"/>`,
  // Masque: venetian carnival, the mysterious one.
  masque: `
    <ellipse cx="50" cy="52" rx="34" ry="36" fill="#2b2340"/>
    <path d="M16 44 Q30 30 50 34 Q70 30 84 44 Q80 60 66 62 Q56 60 50 52 Q44 60 34 62 Q20 60 16 44Z" fill="#e8b34a"/>
    <ellipse cx="34" cy="46" rx="8" ry="6" fill="${D}"/><ellipse cx="66" cy="46" rx="8" ry="6" fill="${D}"/>
    <circle cx="35" cy="46" r="3" fill="#fff" opacity="0.9"/><circle cx="67" cy="46" r="3" fill="#fff" opacity="0.9"/>
    <path d="M20 38 Q28 32 36 36" stroke="#f2e8d5" stroke-width="2" fill="none"/>
    <path d="M80 38 Q72 32 64 36" stroke="#f2e8d5" stroke-width="2" fill="none"/>
    <circle cx="50" cy="40" r="3" fill="#f2e8d5"/>
    <path class="bot-mouth" d="M40 72 Q50 80 60 72 Q50 76 40 72Z" fill="#c9506a"/>
    <path d="M22 22 L28 30 M78 22 L72 30" stroke="#e8b34a" stroke-width="3" stroke-linecap="round"/>`,
  // Knight: visored helm, the armored debater.
  knight: `
    <path d="M50 10 C70 10 80 24 80 46 L80 66 C80 80 66 90 50 90 C34 90 20 80 20 66 L20 46 C20 24 30 10 50 10Z" fill="#9aa3ad"/>
    <path d="M50 10 C60 10 68 16 72 26 L28 26 C32 16 40 10 50 10Z" fill="#b9c2cc"/>
    <rect x="24" y="40" width="52" height="12" rx="3" fill="${D}"/>
    <circle cx="36" cy="46" r="3" fill="#ffd23e"/><circle cx="64" cy="46" r="3" fill="#ffd23e"/>
    <rect x="30" y="60" width="40" height="5" rx="2" fill="${D}"/>
    <rect class="bot-mouth" x="30" y="70" width="40" height="7" rx="2.5" fill="${D}"/>
    <path d="M50 6 L50 14" stroke="#d8342c" stroke-width="4" stroke-linecap="round"/>
    <path d="M46 4 Q50 -2 54 4 Q50 8 46 4Z" fill="#d8342c"/>`,
  // Boxer: headgear, the honest brawler.
  boxer: `
    <path d="M50 12 C72 12 82 28 82 50 C82 74 68 88 50 88 C32 88 18 74 18 50 C18 28 28 12 50 12Z" fill="#8f2f28"/>
    <path d="M32 34 Q50 26 68 34 L68 60 Q50 68 32 60Z" fill="#e8c193"/>
    <circle cx="40" cy="46" r="4" fill="${D}"/><circle cx="60" cy="46" r="4" fill="${D}"/>
    <circle cx="41.3" cy="44.7" r="1.4" fill="#fff"/><circle cx="61.3" cy="44.7" r="1.4" fill="#fff"/>
    <path d="M33 38 Q40 34 47 37 M67 38 Q60 34 53 37" stroke="#6b4a2f" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M50 50 Q47 56 50 58 Q53 56 50 50Z" fill="#c98a6a"/>
    <path class="bot-mouth" d="M42 64 Q50 70 58 64" stroke="#6b4a2f" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M18 50 Q10 50 12 58 Q16 62 20 58Z" fill="#8f2f28"/>
    <path d="M82 50 Q90 50 88 58 Q84 62 80 58Z" fill="#8f2f28"/>`,
  // Goalie: the hockey mask. Menacing on purpose.
  goalie: `
    <path d="M50 10 C70 10 82 26 82 50 C82 74 68 90 50 90 C32 90 18 74 18 50 C18 26 30 10 50 10Z" fill="#eae4d6"/>
    <ellipse cx="35" cy="44" rx="8" ry="7" fill="${D}"/><ellipse cx="65" cy="44" rx="8" ry="7" fill="${D}"/>
    <circle cx="50" cy="60" r="4" fill="${D}"/>
    <circle cx="40" cy="66" r="2.6" fill="${D}"/><circle cx="60" cy="66" r="2.6" fill="${D}"/>
    <circle cx="34" cy="70" r="2.2" fill="${D}"/><circle cx="66" cy="70" r="2.2" fill="${D}"/>
    <path class="bot-mouth" d="M38 76 Q50 82 62 76" stroke="${D}" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    <path d="M50 14 L50 34" stroke="#c33" stroke-width="4"/>
    <path d="M30 22 L38 32 M70 22 L62 32" stroke="#c33" stroke-width="3.5" stroke-linecap="round"/>`,
  // Astro: mirrored visor. Nobody sees anything.
  astro: `
    <path d="M50 10 C72 10 84 26 84 48 C84 72 68 88 50 88 C32 88 16 72 16 48 C16 26 28 10 50 10Z" fill="#e6e9ee"/>
    <path d="M50 22 C68 22 76 34 76 48 C76 62 66 70 50 70 C34 70 24 62 24 48 C24 34 32 22 50 22Z" fill="#1b2a3a"/>
    <path d="M32 34 Q44 26 58 28 Q44 32 36 44Z" fill="#5fa8d3" opacity="0.75"/>
    <ellipse class="bot-mouth" cx="50" cy="56" rx="12" ry="5" fill="#0d1620"/>
    <rect x="12" y="42" width="8" height="14" rx="3" fill="#c9ced6"/>
    <rect x="80" y="42" width="8" height="14" rx="3" fill="#c9ced6"/>
    <circle cx="68" cy="30" r="3" fill="#ffd23e"/>`,
};

/** The set the picker offers, in display order. Mirrors AVATAR_IDS. */
export const MASK_IDS = Object.keys(MASKS);

interface Props {
  id: string;
  speaking?: boolean;
  size?: number;
  /** Poster accent for the frame (the debater's side color). */
  color?: string;
}

export default function Mask({ id, speaking, size = 120, color }: Props) {
  const svg = MASKS[id] ?? MASKS.luchador;
  return (
    <div
      className={`bot-avatar mask-avatar ${speaking ? 'bot-speaking' : ''}`}
      style={{ width: size, height: size, borderColor: color ?? 'var(--gold)' }}
    >
      <svg
        viewBox="0 0 100 100"
        width="100%"
        height="100%"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}
