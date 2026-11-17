// THE ROSTER IS THE CAST: fourteen characters drawn as busts,
// in cast.ts, spread into MASKS below. Everything else in this file is the
// vault: the head-only masks the roster used to be, drawn, kept, off the
// roster. The notes below date from those masks and still hold for them.
// The old oni, calavera, gamer, huckster, plague, alien and the helmet
// athena are gone from here: their bust versions in cast.ts replaced them
// (Shuten, Marisol, Quip, Bally, Corvin, Garn, Athena). git has the heads.
//
// Human masks. The bots are ANIMALS, so humans are MASKED FIGHTERS — you can
// always tell a machine from a person at a glance, and the fight-poster world
// gets its wrestling-poster half.
//
// THE MASKS HOLD STILL. They used to work a mouth off the mic, which read as
// a smiley face moving up and down. A mask is a mask: the face under it
// talks, the mask does not. Who is speaking is carried by the ring around it
// (VideoTile.tsx, .mask-ring).
//
// Register, with the oni and the calavera as the only references: big black
// shapes for eyes and brows, two or three flat colours, the stage gels as
// accents, a menace to it. NO SMILES — a smiling luchador reads as cheap.
//
// Drawn at the size they actually ship at (96-120px): details that read fine
// at 300px turn to mud on a card.

import { CAST } from './cast';

const D = '#1a1712';

export const MASKS: Record<string, string> = {
  // The roster: the fourteen characters, drawn in cast.ts.
  ...CAST,

  /* ---- the vault: head-only masks, drawn, off the roster ---- */
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
  // Ninja: hood, eye slit, all business. The dark one the roster lacked.
  ninja: `
    <path d="M50 10 C72 10 84 27 84 50 C84 73 70 90 50 90 C30 90 16 73 16 50 C16 27 28 10 50 10Z" fill="#303650"/>
    <path d="M20 38 Q50 30 80 38 L80 54 Q50 60 20 54Z" fill="#dcae83"/>
    <circle cx="36" cy="46" r="4.5" fill="${D}"/><circle cx="64" cy="46" r="4.5" fill="${D}"/>
    <circle cx="37.4" cy="44.6" r="1.6" fill="#fff"/><circle cx="65.4" cy="44.6" r="1.6" fill="#fff"/>
    <path d="M28 40 L42 43 M72 40 L58 43" stroke="${D}" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M20 38 Q50 30 80 38 L80 42 Q50 34 20 42Z" fill="#F0821E"/>
    <path d="M78 40 L97 30 L92 38 L98 46 L80 46Z" fill="#F0821E"/>`,




  /* ---- the basic four, take four. What the ninja gets right
     and every failed draft broke: full head coverage, ONLY the eyes showing,
     one accent, and a shape you would see on a real person. ---- */

  // Climber: the base build kept exactly — red headgear on top, goggles
  // across it, eyes in the gap, gaiter over the mouth. The knit beanie became
  // a hard-shell climbing helmet (vent slots, a lipped brim, strap anchors, a
  // headlamp on the crown), with a braid out the side. "Crux" is the hardest
  // move on a route and the middle of an argument.
  climber: `
    <path d="M68 43 C80 44 88 49 90 57 L78 60 C76 52 73 48 66 47Z" fill="#c9a05c"/>
    <ellipse cx="84" cy="59" rx="10.5" ry="9" fill="#c9a05c"/>
    <ellipse cx="86.5" cy="71" rx="9.5" ry="8.5" fill="#c9a05c"/>
    <ellipse cx="86" cy="82" rx="8" ry="7.5" fill="#c9a05c"/>
    <path d="M74 55 C79 51 88 52 92 57" stroke="#a67f40" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M77 67 C81 63 90 64 94 69" stroke="#a67f40" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M78 78 C82 74 90 75 93 80" stroke="#a67f40" stroke-width="2.2" fill="none" stroke-linecap="round"/>
    <path d="M74 51 C79 47 87 48 91 54" stroke="#e0c07a" stroke-width="2.6" fill="none" stroke-linecap="round"/>
    <path d="M80 89 H92" stroke="#8f2a20" stroke-width="4.2" stroke-linecap="round"/>
    <path d="M82.5 91 L79.5 99 L83.5 99Z M88.5 91 L91.5 99 L87.5 99Z" fill="#c9a05c"/>
    <path d="M81.5 90 H90" stroke="#8f2a20" stroke-width="4" stroke-linecap="round"/>
    <path d="M83 94 C83 96 84 97.5 85 98 M88 94 C88 96 87 97.5 86 98" stroke="#a67f40" stroke-width="2" fill="none" stroke-linecap="round"/>
    <path d="M50 8 C72 8 84 26 84 50 C84 72 70 90 50 90 C30 90 16 72 16 50 C16 26 28 8 50 8Z" fill="#e8dfc9"/>
    <path d="M16 46 C16 22 30 8 50 8 C70 8 84 22 84 46Z" fill="#b83a2e"/>
    <path d="M16 40 C16 20 29 8 50 8 C56 8 61 9 66 11 C50 12 38 20 34 32 C32 38 31 42 31 46 L16 46Z" fill="#d14a3a"/>
    <path d="M36 13 L38 23 M50 11 L50 21 M64 13 L62 23" stroke="#7a1a16" stroke-width="4.5" stroke-linecap="round"/>
    <rect x="41" y="9" width="18" height="8" rx="3" fill="${D}"/>
    <rect x="45" y="11" width="10" height="4.5" rx="2" fill="#f6f1e2"/>
    <path d="M13 39 H87 L87 44 Q50 48 13 44Z" fill="#8f2a20"/>
    <path d="M13 39 L13 44 Q15 45 18 44.6 L18 39Z M87 39 L87 44 Q85 45 82 44.6 L82 39Z" fill="#6e1f18"/>
    <rect x="18" y="23" width="64" height="16" rx="8" fill="${D}"/>
    <rect x="23" y="26" width="24" height="10" rx="5" fill="#1FC2D4"/><rect x="53" y="26" width="24" height="10" rx="5" fill="#1FC2D4"/>
    <path d="M28 49 L42 51 M72 49 L58 51" stroke="${D}" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="36" cy="55" r="4.5" fill="${D}"/><circle cx="64" cy="55" r="4.5" fill="${D}"/>
    <circle cx="37.4" cy="53.6" r="1.6" fill="#fff"/><circle cx="65.4" cy="53.6" r="1.6" fill="#fff"/>
    <path d="M17 66 Q50 60 83 66 L84 70 C84 80 70 90 50 90 C30 90 16 80 16 70Z" fill="#3b3b40"/>
    <path d="M17 66 Q50 60 83 66 L83 69 Q50 63 17 69Z" fill="#2b2b30"/>`,
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

  /* ---- retired from the free set ---- */

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

  /* ---- candidate: a mask that reads as female ---- */

  // Rider: motocross helmet. Purple shell, the peak out both sides, a
  // green stripe over the crown, eyes in the port, ponytail out the back.
  // The ponytail is the whole female read at 36px.
  rider: `
    <path d="M74 46 C91 47 97 62 94 76 C92 85 90 91 87 96 C83 90 84 78 79 68 C74 59 66 52 74 46Z" fill="#8a4b2a"/>
    <path d="M50 8 C71 8 82 24 82 44 L82 66 C82 81 68 92 50 92 C32 92 18 81 18 66 L18 44 C18 24 29 8 50 8Z" fill="#7a52c0"/>
    <path d="M19 36 Q50 30 81 36 L81 47 Q50 41 19 47Z" fill="${D}"/>
    <path d="M21 42 Q50 36 79 42 L79 60 Q50 66 21 60Z" fill="#c68e5d"/>
    <path d="M29 48 L42 52 M71 48 L58 52" stroke="${D}" stroke-width="2.6" stroke-linecap="round"/>
    <circle cx="36" cy="54" r="4.5" fill="${D}"/><circle cx="64" cy="54" r="4.5" fill="${D}"/>
    <circle cx="37.4" cy="52.6" r="1.6" fill="#fff"/><circle cx="65.4" cy="52.6" r="1.6" fill="#fff"/>
    <path d="M28 63 Q50 58 72 63 L71 77 C70 86 62 91 50 91 C38 91 30 86 29 77Z" fill="#8f66cf"/>
    <path d="M43 8.4 Q50 7.4 57 8.4 L61 32 Q50 29.4 39 32Z" fill="#efe7d6"/>`,
  // Fencer: the mesh screen in a pale metal rim, bib under the chin.
  // The one accent is the green bib.
  fencer: `
    <path d="M29 66 L28 86 Q28 90 33 90 L67 90 Q72 90 72 86 L71 66Z" fill="#2FBF6B"/>
    <path d="M50 8 C74 8 88 26 88 47 L88 58 C88 71 72 80 50 80 C28 80 12 71 12 58 L12 47 C12 26 26 8 50 8Z" fill="#d4dae1"/>
    <path d="M50 13 C71 13 83 29 83 46 L83 57 C83 69 68 77 50 77 C32 77 17 69 17 57 L17 46 C17 29 29 13 50 13Z" fill="#565e68"/>
    <path d="M30 21 H70 M23 27.5 H77 M19.5 34 H80.5 M19 40.5 H81 M19.5 62 H80.5 M24 68 H76 M34 73.5 H66" stroke="#474e57" stroke-width="2.2"/>
    <path d="M22 42 Q50 37 78 42 L78 58 Q50 64 22 58Z" fill="#d8a87e"/>
    <path d="M28 44 L42 47 M72 44 L58 47" stroke="#1a1712" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="36" cy="50" r="4.5" fill="#1a1712"/><circle cx="64" cy="50" r="4.5" fill="#1a1712"/>
    <circle cx="37.4" cy="48.6" r="1.6" fill="#fff"/><circle cx="65.4" cy="48.6" r="1.6" fill="#fff"/>`,
  // Boxer: sparring headgear. Red shell, ear holes, cheek pads and chin
  // cup. The cream brow rim is what keeps it gear and not a hat.
  boxer: `
    <path d="M50 8 C73 8 87 26 87 48 L87 62 L13 62 L13 48 C13 26 27 8 50 8Z" fill="#d24a38"/>
    <rect x="6" y="34" width="23" height="42" rx="10" fill="#9c2a20"/><rect x="71" y="34" width="23" height="42" rx="10" fill="#9c2a20"/>
    <circle cx="17.5" cy="56" r="4.8" fill="#1a1712"/><circle cx="82.5" cy="56" r="4.8" fill="#1a1712"/>
    <ellipse cx="50" cy="80" rx="21" ry="11" fill="#9c2a20"/>
    <path d="M50 37 C64 37 73.5 44 73.5 54.5 C73.5 64 71 71 66 76.5 C61.5 81.5 55.2 83.5 50 83.5 C44.8 83.5 38.5 81.5 34 76.5 C29 71 26.5 64 26.5 54.5 C26.5 44 36 37 50 37Z" fill="#6b4226"/>
    <path d="M21 41 Q50 25 79 41 L79 48 Q50 32 21 48Z" fill="#efe7d6"/>
    <path d="M29.5 47 L43.5 51 M70.5 47 L56.5 51" stroke="#1a1712" stroke-width="3" stroke-linecap="round"/>
    <circle cx="36" cy="57" r="4.5" fill="#1a1712"/><circle cx="64" cy="57" r="4.5" fill="#1a1712"/>
    <circle cx="37.4" cy="55.6" r="1.6" fill="#fff"/><circle cx="65.4" cy="55.6" r="1.6" fill="#fff"/>
    <path d="M43.5 75.5 Q50 78.2 56.5 75.5" stroke="#1a1712" stroke-width="2.9" fill="none" stroke-linecap="round"/>`,


// Athena: the Corinthian helmet, worn DOWN.

  /* ---- saved for later: held back from the free set ---- */

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
};

/** The set the picker offers, in display order. Mirrors AVATAR_IDS. Explicit,
    not Object.keys: MASKS also holds candidates that are not on the roster,
    and the grey silhouette (cast.ts `guest`), which nobody picks: the server
    alone seats a signed-out player in it. */
export const MASK_IDS = ['napoleon', 'socrates', 'aristotle', 'diogenes', 'athena', 'lincoln', 'dracula', 'humpty', 'bally', 'shuten', 'marisol', 'quip', 'corvin', 'garn', 'fuma', 'crux'];

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
  const svg = MASKS[id] ?? MASKS.shuten;
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
