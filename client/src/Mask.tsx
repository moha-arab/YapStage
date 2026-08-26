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
  // Calavera: sugar skull. Festive-macabre, and the petal eyes carry the two
  // stage gels, so the roster wears the brand without being told to.
  calavera: `
    <path d="M50 10 C72 10 82 26 82 46 C82 60 76 66 74 74 L70 88 L30 88 L26 74 C24 66 18 60 18 46 C18 26 28 10 50 10Z" fill="#f4efe4"/>
    <circle cx="35" cy="44" r="11" fill="${D}"/><circle cx="65" cy="44" r="11" fill="${D}"/>
    <circle cx="35" cy="44" r="5" fill="#1FC2D4"/><circle cx="65" cy="44" r="5" fill="#F0821E"/>
    <path d="M35 29 l2.5 5 -5 0z M35 59 l2.5 -5 -5 0z M20 44 l5 2.5 0 -5z M50 44 l-5 2.5 0 -5z" fill="#e2574c"/>
    <path d="M65 29 l2.5 5 -5 0z M65 59 l2.5 -5 -5 0z M50 44 l5 2.5 0 -5z M80 44 l-5 2.5 0 -5z" fill="#e2574c"/>
    <path d="M50 56 L45 64 L55 64Z" fill="${D}"/>
    <ellipse class="bot-mouth" cx="50" cy="74" rx="15" ry="4" fill="${D}"/>
    <path d="M40 70 L40 78 M47 70 L47 78 M54 70 L54 78 M61 70 L61 78" stroke="${D}" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="50" cy="17" r="4" fill="#1FC2D4"/><circle cx="42" cy="14" r="2.5" fill="#F0821E"/><circle cx="58" cy="14" r="2.5" fill="#e2574c"/>`,
  // Ninja: hood, eye slit, all business. The dark one the roster lacked.
  ninja: `
    <path d="M50 10 C72 10 84 27 84 50 C84 73 70 90 50 90 C30 90 16 73 16 50 C16 27 28 10 50 10Z" fill="#2b3044"/>
    <path d="M20 38 Q50 30 80 38 L80 54 Q50 60 20 54Z" fill="#e8dfc9"/>
    <circle cx="36" cy="46" r="4.5" fill="${D}"/><circle cx="64" cy="46" r="4.5" fill="${D}"/>
    <circle cx="37.4" cy="44.6" r="1.6" fill="#fff"/><circle cx="65.4" cy="44.6" r="1.6" fill="#fff"/>
    <path d="M28 40 L42 43 M72 40 L58 43" stroke="${D}" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M20 38 Q50 30 80 38 L80 42 Q50 34 20 42Z" fill="#F0821E"/>
    <ellipse class="bot-mouth" cx="50" cy="72" rx="9" ry="3" fill="#171b28"/>
    <path d="M78 40 L90 32 L88 42 L80 46Z" fill="#F0821E"/>`,
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
};

/** The set the picker offers, in display order. Mirrors AVATAR_IDS. */
export const MASK_IDS = Object.keys(MASKS);

interface Props {
  id: string;
  speaking?: boolean;
  size?: number | string;
  /** Accent for the frame (the debater's side colour). */
  color?: string;
  /** No frame, no background: just the drawing. The lobby stands its fighters
      in a cone of light, and a bordered box around the face kills that. */
  bare?: boolean;
}

export default function Mask({ id, speaking, size = 120, color, bare }: Props) {
  const svg = MASKS[id] ?? MASKS.luchador;
  if (bare) {
    return (
      <svg
        viewBox="0 0 100 100"
        // bot-speaking on the svg itself: the mouth animation's selector is
        // `.bot-speaking .bot-mouth`, and bare masks have no frame div to
        // carry the class — without this a bare mask's mouth never moves.
        className={speaking ? 'bot-speaking' : undefined}
        style={{ width: size, height: size, display: 'block' }}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }
  return (
    <div
      className={`bot-avatar mask-avatar ${speaking ? 'bot-speaking' : ''}`}
      style={{ width: size, height: size, borderColor: color ?? 'var(--house-3)' }}
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
