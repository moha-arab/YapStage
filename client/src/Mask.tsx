// Human masks. The bots are ANIMALS, so humans are MASKED FIGHTERS — you can
// always tell a machine from a person at a glance, and the fight-poster world
// gets its wrestling-poster half.
//
// THE MASKS HOLD STILL (2026-09-04). They used to work a mouth off the mic,
// and the result was "a smiley face that moves up and down" (his words). A
// mask is a mask: the face under it talks, the mask does not. Who is speaking
// is carried by the ring around it (VideoTile.tsx, .mask-ring).
//
// Register, set by him the same day with the oni and the calavera as the
// only references: big black shapes for eyes and brows, two or three flat
// colours, the stage gels as accents, a menace to it. NO SMILES — the smiling
// luchador is what he called cheap.
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
    <ellipse cx="50" cy="74" rx="15" ry="4" fill="${D}"/>
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
    <path d="M78 40 L90 32 L88 42 L80 46Z" fill="#F0821E"/>`,
  // Oni: horned demon mask, angry brow, tusks. THE reference.
  oni: `
    <path d="M24 22 Q18 10 30 8 Q34 16 32 24Z" fill="#e8d7b8"/>
    <path d="M76 22 Q82 10 70 8 Q66 16 68 24Z" fill="#e8d7b8"/>
    <path d="M50 14 C70 14 84 30 84 52 C84 74 68 88 50 88 C32 88 16 74 16 52 C16 30 30 14 50 14Z" fill="#4d7fd6"/>
    <path d="M24 38 L44 44 L42 50 L24 46Z" fill="${D}"/>
    <path d="M76 38 L56 44 L58 50 L76 46Z" fill="${D}"/>
    <circle cx="34" cy="47" r="4" fill="#ffd23e"/><circle cx="66" cy="47" r="4" fill="#ffd23e"/>
    <path d="M40 30 Q50 26 60 30" stroke="${D}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M34 68 Q50 82 66 68 Q50 76 34 68Z" fill="#2a1410"/>
    <path d="M38 70 L41 78 L44 70Z" fill="#f4efe4"/><path d="M56 70 L59 78 L62 70Z" fill="#f4efe4"/>`,

  // Azul: the second luchador. Same mask, blue, with a lightning panel where
  // the red one has its V. Real rosters are mostly variations on the hood.
  azul: `
    <path d="M50 12 C72 12 84 28 84 50 C84 72 68 88 50 88 C32 88 16 72 16 50 C16 28 28 12 50 12Z" fill="#3a6fd0"/>
    <path d="M47 12 L60 12 L53 30 L61 30 L44 58 L49 38 L41 38Z" fill="#f2e8d5"/>
    <path d="M22 46 Q34 38 44 46 Q34 54 22 46Z" fill="#f2e8d5"/>
    <path d="M78 46 Q66 38 56 46 Q66 54 78 46Z" fill="#f2e8d5"/>
    <circle cx="35" cy="46" r="4.5" fill="${D}"/><circle cx="65" cy="46" r="4.5" fill="${D}"/>
    <circle cx="36.5" cy="44.5" r="1.5" fill="#fff"/><circle cx="66.5" cy="44.5" r="1.5" fill="#fff"/>
    <path d="M50 60 L46 70 L54 70Z" fill="#274d9a"/>
    <path d="M30 20 L34 26 M70 20 L66 26" stroke="#f2e8d5" stroke-width="3" stroke-linecap="round"/>`,
  // Shade: the second hood. Steel grey, the other gel on the band, a
  // narrower slit and the tail on the other side.
  shade: `
    <path d="M50 10 C72 10 84 27 84 50 C84 73 70 90 50 90 C30 90 16 73 16 50 C16 27 28 10 50 10Z" fill="#4b525e"/>
    <path d="M20 38 Q50 30 80 38 L80 52 Q50 58 20 52Z" fill="#e8dfc9"/>
    <path d="M27 45 Q36 40 44 46 Q36 51 27 45Z" fill="${D}"/><path d="M73 45 Q64 40 56 46 Q64 51 73 45Z" fill="${D}"/>
    <circle cx="37" cy="45.5" r="1.4" fill="#fff"/><circle cx="63" cy="45.5" r="1.4" fill="#fff"/>
    <path d="M20 38 Q50 30 80 38 L80 42 Q50 34 20 42Z" fill="#1FC2D4"/>
    <path d="M22 40 L10 32 L12 42 L20 46Z" fill="#1FC2D4"/>`,

  /* ---- saved for later (2026-09-04, his call: too good for the free set) ---- */

  // Tengu: the red mountain goblin. Black hair, white fur brows and
  // moustache, and the long nose, which crosses the speaking ring.
  tengu: `
    <path d="M50 12 C72 12 84 28 84 50 C84 74 68 90 50 90 C32 90 16 74 16 50 C16 28 28 12 50 12Z" fill="#c8352b"/>
    <path d="M16 46 C14 22 30 10 50 10 C70 10 86 22 84 46 C78 30 70 26 50 26 C30 26 22 30 16 46Z" fill="${D}"/>
    <path d="M26 48 Q34 43 43 50 Q34 55 26 48Z" fill="${D}"/>
    <path d="M74 48 Q66 43 57 50 Q66 55 74 48Z" fill="${D}"/>
    <circle cx="35" cy="49" r="2.2" fill="#ffd23e"/><circle cx="65" cy="49" r="2.2" fill="#ffd23e"/>
    <path d="M19 38 Q31 29 45 40 L43 46 Q31 39 21 44Z" fill="#f4efe4"/>
    <path d="M81 38 Q69 29 55 40 L57 46 Q69 39 79 44Z" fill="#f4efe4"/>
    <path d="M50 40 L41 68 L50 97 L59 68Z" fill="#8f1f1a"/>
    <path d="M50 42 L45 68 L50 92Z" fill="#a8281f"/>
    <path d="M28 74 Q39 67 46 76 Q40 79 30 80Z" fill="#f4efe4"/>
    <path d="M72 74 Q61 67 54 76 Q60 79 70 80Z" fill="#f4efe4"/>`,
  // Plague doctor: leather hood, brass goggles, the beak. The forehead
  // strap is the one hard black shape it needs to read at 36px.
  plague: `
    <path d="M50 10 C74 10 86 28 86 52 C86 76 72 90 56 92 L44 92 C28 90 14 76 14 52 C14 28 26 10 50 10Z" fill="#5b4a38"/>
    <path d="M15 36 Q50 22 85 36 L85 41 Q50 28 15 41Z" fill="${D}"/>
    <circle cx="33" cy="46" r="12.5" fill="#c9973a"/><circle cx="67" cy="46" r="12.5" fill="#c9973a"/>
    <circle cx="33" cy="46" r="8.5" fill="#14333a"/><circle cx="67" cy="46" r="8.5" fill="#14333a"/>
    <circle cx="30" cy="43" r="2.6" fill="#f4efe4" opacity="0.75"/><circle cx="64" cy="43" r="2.6" fill="#f4efe4" opacity="0.75"/>
    <path d="M40 56 L60 56 L52 97 L48 97Z" fill="#7a5c3d"/>
    <path d="M50 56 L60 56 L52 97 L50 97Z" fill="#5c4530"/>
    <path d="M46 66 L54 66 M45 74 L55 74 M47 82 L53 82" stroke="${D}" stroke-width="1.8" stroke-linecap="round"/>`,
  // Tiki: carved wood. Geometric eyes, a wall of teeth, and a crest that
  // wears the gels the way the calavera's petals do.
  tiki: `
    <path d="M28 14 L34 3 L40 14Z M45 14 L50 1 L55 14Z M60 14 L66 3 L72 14Z" fill="#F0821E"/>
    <path d="M45 14 L50 1 L55 14Z" fill="#1FC2D4"/>
    <path d="M24 12 H76 Q88 12 88 24 V80 Q88 92 76 92 H24 Q12 92 12 80 V24 Q12 12 24 12Z" fill="#b5672c"/>
    <path d="M18 24 H82" stroke="#7a4218" stroke-width="3" stroke-linecap="round"/>
    <rect x="19" y="30" width="26" height="17" rx="3" fill="#f4efe4"/><rect x="55" y="30" width="26" height="17" rx="3" fill="#f4efe4"/>
    <rect x="25" y="34" width="14" height="9" fill="${D}"/><rect x="61" y="34" width="14" height="9" fill="${D}"/>
    <path d="M42 51 L58 51 L63 62 L37 62Z" fill="#7a4218"/>
    <rect x="18" y="66" width="64" height="17" rx="3" fill="${D}"/>
    <path d="M22 66 L27 75 L32 66Z M34 66 L39 75 L44 66Z M46 66 L51 75 L56 66Z M58 66 L63 75 L68 66Z M70 66 L75 75 L80 66Z" fill="#f4efe4"/>
    <path d="M16 56 V84 M84 56 V84" stroke="#7a4218" stroke-width="3" stroke-linecap="round"/>`,
  // Alien: the grey. All eyes. Nothing on it smiles.
  alien: `
    <path d="M50 8 C74 8 88 24 88 44 C88 66 66 92 50 94 C34 92 12 66 12 44 C12 24 26 8 50 8Z" fill="#a9b2b6"/>
    <path d="M17 40 Q33 32 45 52 Q37 63 24 57 Q13 51 17 40Z" fill="${D}"/>
    <path d="M83 40 Q67 32 55 52 Q63 63 76 57 Q87 51 83 40Z" fill="${D}"/>
    <ellipse cx="25" cy="44" rx="3.2" ry="2" fill="#f4efe4" opacity="0.8"/><ellipse cx="75" cy="44" rx="3.2" ry="2" fill="#f4efe4" opacity="0.8"/>
    <circle cx="47" cy="67" r="1.6" fill="${D}"/><circle cx="53" cy="67" r="1.6" fill="${D}"/>
    <path d="M43 78 Q50 75 57 78" stroke="${D}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
};

/** The set the picker offers, in display order. Mirrors AVATAR_IDS. Explicit,
    not Object.keys: MASKS also holds candidates that are not on the roster. */
export const MASK_IDS = ['luchador', 'ninja', 'azul', 'shade'];

interface Props {
  id: string;
  size?: number | string;
  /** Accent for the frame (the debater's side colour). */
  color?: string;
  /** No frame, no background: just the drawing. The lobby stands its fighters
      in a cone of light, and a bordered box around the face kills that. */
  bare?: boolean;
}

export default function Mask({ id, size = 120, color, bare }: Props) {
  const svg = MASKS[id] ?? MASKS.oni;
  if (bare) {
    return (
      <svg
        viewBox="0 0 100 100"
        style={{ width: size, height: size, display: 'block' }}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  }
  return (
    <div
      className="bot-avatar mask-avatar"
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
