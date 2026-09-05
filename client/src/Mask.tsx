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
    <path d="M41 73 H59" stroke="#2a1410" stroke-width="3.5" stroke-linecap="round"/>
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
    <path d="M50 10 C72 10 84 27 84 50 C84 73 70 90 50 90 C30 90 16 73 16 50 C16 27 28 10 50 10Z" fill="#303650"/>
    <path d="M20 38 Q50 30 80 38 L80 54 Q50 60 20 54Z" fill="#e8dfc9"/>
    <circle cx="36" cy="46" r="4.5" fill="${D}"/><circle cx="64" cy="46" r="4.5" fill="${D}"/>
    <circle cx="37.4" cy="44.6" r="1.6" fill="#fff"/><circle cx="65.4" cy="44.6" r="1.6" fill="#fff"/>
    <path d="M28 40 L42 43 M72 40 L58 43" stroke="${D}" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M20 38 Q50 30 80 38 L80 42 Q50 34 20 42Z" fill="#F0821E"/>
    <path d="M78 40 L97 30 L92 38 L98 46 L80 46Z" fill="#F0821E"/>`,
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

  /* ---- the basic four, take four (2026-09-04). What the ninja gets right
     and every failed draft broke: full head coverage, ONLY the eyes showing,
     one accent, and a shape you would see on a real person. ---- */

  // Goggles: the snowboarder. Beanie with its cuff, goggles pushed up onto
  // the beanie (dark frame, turquoise lens: the one accent), neck gaiter over
  // the mouth. Eyes in the gap, the ninja's round eyes.
  goggles: `
    <path d="M50 8 C72 8 84 26 84 50 C84 72 70 90 50 90 C30 90 16 72 16 50 C16 26 28 8 50 8Z" fill="#e8dfc9"/>
    <path d="M16 46 C16 22 30 8 50 8 C70 8 84 22 84 46Z" fill="#8f1f1a"/>
    <path d="M14 40 H86 Q88 44 86 48 H14 Q12 44 14 40Z" fill="#a8281f"/>
    <path d="M34 14 L36 22 M50 12 L50 20 M66 14 L64 22" stroke="#7a1a16" stroke-width="2.2" stroke-linecap="round"/>
    <rect x="18" y="23" width="64" height="16" rx="8" fill="${D}"/>
    <rect x="23" y="26" width="24" height="10" rx="5" fill="#1FC2D4"/><rect x="53" y="26" width="24" height="10" rx="5" fill="#1FC2D4"/>
    <path d="M28 49 L42 51 M72 49 L58 51" stroke="${D}" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="36" cy="55" r="4.5" fill="${D}"/><circle cx="64" cy="55" r="4.5" fill="${D}"/>
    <circle cx="37.4" cy="53.6" r="1.6" fill="#fff"/><circle cx="65.4" cy="53.6" r="1.6" fill="#fff"/>
    <path d="M17 66 Q50 60 83 66 L84 70 C84 80 70 90 50 90 C30 90 16 80 16 70Z" fill="#3b3b40"/>`,
  // Hoodie: hood up, the hood itself pulled over the mouth like a snood,
  // short drawstrings on the chest. Green, so it is not a grey ninja.
  hoodie: `
    <path d="M50 6 C76 6 90 26 90 52 C90 76 76 92 50 92 C24 92 10 76 10 52 C10 26 24 6 50 6Z" fill="#4f6b57"/>
    <path d="M50 18 C66 18 76 32 76 50 C76 66 66 78 50 78 C34 78 24 66 24 50 C24 32 34 18 50 18Z" fill="#24352a"/>
    <path d="M27 40 Q50 34 73 40 L73 60 Q50 66 27 60Z" fill="#e8dfc9"/>
    <path d="M30 44 L44 46 M70 44 L56 46" stroke="${D}" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="37" cy="50" r="4.5" fill="${D}"/><circle cx="63" cy="50" r="4.5" fill="${D}"/>
    <circle cx="38.4" cy="48.6" r="1.6" fill="#fff"/><circle cx="64.4" cy="48.6" r="1.6" fill="#fff"/>
    <path d="M25 60 Q50 54 75 60 L74 76 Q50 88 26 76Z" fill="#4f6b57"/>
    <circle cx="42" cy="83" r="1.6" fill="#24352a"/><circle cx="58" cy="83" r="1.6" fill="#24352a"/>
    <path d="M42 84 L40 97 M58 84 L61 93" stroke="#2b2f2b" stroke-width="2.2" stroke-linecap="round"/>
    <circle cx="40" cy="97.5" r="1.5" fill="#8a8d90"/><circle cx="61" cy="93.5" r="1.5" fill="#8a8d90"/>`,
  // Wrap: the desert scarf, wound round the head at an angle, the end of it
  // hanging loose past the jaw. Diagonal folds, never bandage rings.
  wrap: `
    <path d="M74 36 L94 42 L97 92 L82 90Z" fill="#b8905c"/>
    <path d="M86 56 Q90 70 88 84" stroke="#a67f4e" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M50 10 C72 10 84 27 84 50 C84 73 70 90 50 90 C30 90 16 73 16 50 C16 27 28 10 50 10Z" fill="#c9a06a"/>
    <path d="M22 28 Q50 19 76 33 M20 62 Q50 76 80 64" stroke="#a67f4e" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    <path d="M17 37 Q50 28 83 37 L83 59 Q50 66 17 59Z" fill="#8c6a3e"/>
    <path d="M22 41 Q50 34 78 41 L78 55 Q50 61 22 55Z" fill="#e8dfc9"/>
    <path d="M28 44 L42 46 M72 44 L58 46" stroke="${D}" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="36" cy="49" r="4.5" fill="${D}"/><circle cx="64" cy="49" r="4.5" fill="${D}"/>
    <circle cx="37.4" cy="47.6" r="1.6" fill="#fff"/><circle cx="65.4" cy="47.6" r="1.6" fill="#fff"/>`,

  /* ---- retired from the free set (2026-09-04) ---- */

  // Hockey: the goalie mask. White shell, the vent holes, the straps at the
  // sides. Everybody knows it, nobody has to be told what it is.
  hockey: `
    <path d="M16 42 L7 36 M84 42 L93 36 M18 64 L7 68 M82 64 L93 68" stroke="${D}" stroke-width="3.5" stroke-linecap="round"/>
    <path d="M50 10 C72 10 84 26 84 48 C84 72 68 90 50 90 C32 90 16 72 16 48 C16 26 28 10 50 10Z" fill="#f2ede2"/>
    <path d="M24 44 Q34 37 44 44 Q34 51 24 44Z" fill="${D}"/>
    <path d="M76 44 Q66 37 56 44 Q66 51 76 44Z" fill="${D}"/>
    <path d="M50 48 L45 60 L55 60Z" fill="#d6cfbf"/>
    <circle cx="44" cy="24" r="2.4" fill="#a9a294"/><circle cx="56" cy="24" r="2.4" fill="#a9a294"/><circle cx="50" cy="19" r="2.4" fill="#a9a294"/>
    <circle cx="38" cy="68" r="2.4" fill="#a9a294"/><circle cx="50" cy="68" r="2.4" fill="#a9a294"/><circle cx="62" cy="68" r="2.4" fill="#a9a294"/>
    <circle cx="44" cy="76" r="2.4" fill="#a9a294"/><circle cx="56" cy="76" r="2.4" fill="#a9a294"/>
    <circle cx="28" cy="58" r="2.4" fill="#a9a294"/><circle cx="72" cy="58" r="2.4" fill="#a9a294"/>`,
  // Domino: a plain cream mask with the black band across the eyes. The
  // oldest disguise there is, and the simplest thing on the rack.
  domino: `
    <path d="M50 12 C70 12 82 28 82 50 C82 72 68 88 50 88 C32 88 18 72 18 50 C18 28 30 12 50 12Z" fill="#f2e8d5"/>
    <path d="M12 40 Q31 32 50 42 Q69 32 88 40 L86 53 Q68 60 50 52 Q32 60 14 53Z" fill="${D}"/>
    <path d="M26 45 Q34 40 42 46 Q34 51 26 45Z" fill="#f4efe4"/><path d="M74 45 Q66 40 58 46 Q66 51 74 45Z" fill="#f4efe4"/>
    <circle cx="35" cy="45.6" r="2.4" fill="${D}"/><circle cx="65" cy="45.6" r="2.4" fill="${D}"/>
    <path d="M50 58 L46 66 L54 66Z" fill="#d9cdb6"/>
    <path d="M42 75 H58" stroke="#3a2c26" stroke-width="3" stroke-linecap="round"/>`,

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
export const MASK_IDS = ['ninja', 'goggles', 'hoodie', 'wrap'];

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
