// Character avatars — flat, colorful animals, one per bot. `speaking` pulses
// the frame and works the mouth during the bot's turn. The SVGs are static and
// self-authored, so dangerouslySetInnerHTML is safe here and keeps them legible.

const COLOR: Record<string, string> = {
  for: 'var(--for)',
  against: 'var(--against)',
  gold: 'var(--gold)',
  ink: 'var(--ink)',
};

const D = '#1a1712';


// QUALITY PASS (Pip first, as the test). Flat fills read as clip art at 96px.
// What actually separates "character" from "shape pile", in order of payoff:
//   1. a light source — one consistent highlight top-left, shadow bottom-right
//   2. depth layers — under-shadow behind the body, not just outlines
//   3. eye craft — iris + pupil + specular dot + a lid, instead of a dot
//   4. asymmetry — nothing perfectly centred; faces are never symmetrical
//   5. line weight variety — thick where forms meet, thin for detail
// All of it is still hand-authored SVG, so it stays crisp at any size, costs
// no network request, and the mouth can still animate.
const PAINT = `
  <defs>
    <radialGradient id="lit" cx="36%" cy="26%" r="80%">
      <stop offset="0%" stop-color="#fff" stop-opacity=".45"/>
      <stop offset="52%" stop-color="#fff" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity=".3"/>
    </radialGradient>
    <radialGradient id="blush" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ff7a4a" stop-opacity=".7"/>
      <stop offset="100%" stop-color="#ff7a4a" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="beak" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffb63e"/>
      <stop offset="100%" stop-color="#e0701a"/>
    </linearGradient>
    <linearGradient id="down" x1="0" y1="0" x2="0.3" y2="1">
      <stop offset="0%" stop-color="#ffe27a"/>
      <stop offset="60%" stop-color="#ffd23e"/>
      <stop offset="100%" stop-color="#f0b21e"/>
    </linearGradient>
  </defs>`;

const ANIMALS: Record<string, string> = {
  // Pip, the quality test. Same duckling, built properly: fluffy silhouette
  // instead of one ellipse, a lit body, layered eyes with lids that make him
  // read as nervous rather than blank, and a beak with a seam.
  duckling: `
    ${PAINT}
    <ellipse cx="50" cy="88" rx="26" ry="5" fill="#000" opacity=".22"/>
    <path d="M50 24 C64 24 74 32 78 44 C86 52 84 68 74 76 C66 84 58 87 50 87
             C42 87 34 84 26 76 C16 68 14 52 22 44 C26 32 36 24 50 24Z"
          fill="url(#down)"/>
    <path d="M50 24 C64 24 74 32 78 44 C86 52 84 68 74 76 C66 84 58 87 50 87
             C42 87 34 84 26 76 C16 68 14 52 22 44 C26 32 36 24 50 24Z"
          fill="url(#lit)"/>
    <path d="M40 26 q4 -11 8 -1 q4 -12 9 0 q5 -10 8 2" stroke="#f7c62e"
          stroke-width="4.5" fill="none" stroke-linecap="round"/>
    <ellipse cx="27" cy="63" rx="7" ry="5.5" fill="url(#blush)"/>
    <ellipse cx="73" cy="63" rx="7" ry="5.5" fill="url(#blush)"/>
    <ellipse cx="39.5" cy="52" rx="9" ry="9.5" fill="#fffdf6"/>
    <ellipse cx="60.5" cy="52" rx="9" ry="9.5" fill="#fffdf6"/>
    <ellipse cx="40.5" cy="54" rx="5" ry="5.4" fill="#4a3a1a"/>
    <ellipse cx="61.5" cy="54" rx="5" ry="5.4" fill="#4a3a1a"/>
    <circle cx="40.5" cy="54.5" r="3.1" fill="${D}"/>
    <circle cx="61.5" cy="54.5" r="3.1" fill="${D}"/>
    <circle cx="42.4" cy="51.8" r="1.9" fill="#fff"/>
    <circle cx="63.4" cy="51.8" r="1.9" fill="#fff"/>
    <circle cx="38.6" cy="57" r="1" fill="#fff" opacity=".55"/>
    <circle cx="59.6" cy="57" r="1" fill="#fff" opacity=".55"/>
    <path d="M31 46.5 q8.5 -4.5 17 -0.5" stroke="#f0b21e" stroke-width="3"
          fill="none" stroke-linecap="round"/>
    <path d="M69 46 q-8.5 -5 -17 -1" stroke="#f0b21e" stroke-width="3"
          fill="none" stroke-linecap="round"/>
    <ellipse class="bot-mouth" cx="50" cy="68" rx="11" ry="6.5" fill="url(#beak)"/>
    <path d="M39.5 68 q10.5 3 21 0" stroke="#c25c12" stroke-width="1.4" fill="none"/>
    <ellipse cx="46" cy="65.5" rx="3" ry="1.2" fill="#fff" opacity=".35"/>`,
  // Capybara, NOT a bear. The difference is all in the proportions: a bear has
  // a round head with big round ears on top and a small snout. A capybara has a
  // brick-shaped head, tiny ears tucked at the SIDES, eyes shoved right up to
  // the top, and an enormous blunt snout with a broad dark nose pad.
  capybara: `
    <rect x="20" y="21" width="60" height="67" rx="13" fill="#cf9a5c"/>
    <ellipse cx="22" cy="33" rx="3.4" ry="2.9" fill="#8a5f33"/><ellipse cx="78" cy="33" rx="3.4" ry="2.9" fill="#8a5f33"/>
    <rect x="29" y="50" width="42" height="38" rx="14" fill="#e8c193"/>
    <rect x="35" y="52" width="30" height="16" rx="5.5" fill="#4a3120"/>
    <ellipse cx="43" cy="60" rx="2.8" ry="2.1" fill="#17120d"/><ellipse cx="57" cy="60" rx="2.8" ry="2.1" fill="#17120d"/>
    <circle cx="32" cy="38" r="4" fill="${D}"/><circle cx="68" cy="38" r="4" fill="${D}"/>
    <circle cx="33.3" cy="36.7" r="1.4" fill="#fff"/><circle cx="69.3" cy="36.7" r="1.4" fill="#fff"/>
    <path class="bot-mouth" d="M42 79 q8 5 16 0" stroke="#8a5f33" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  fox: `
    <polygon points="20,22 34,50 12,46" fill="#e8622e"/><polygon points="80,22 66,50 88,46" fill="#e8622e"/>
    <polygon points="22,26 32,46 17,43" fill="#3a2418"/><polygon points="78,26 68,46 83,43" fill="#3a2418"/>
    <path d="M20 44 Q50 30 80 44 Q72 78 50 84 Q28 78 20 44Z" fill="#e8622e"/>
    <path d="M34 58 Q50 50 66 58 Q58 80 50 84 Q42 80 34 58Z" fill="#f2e8d5"/>
    <path d="M36 52 l10 4 -9 3z" fill="${D}"/><path d="M64 52 l-10 4 9 3z" fill="${D}"/>
    <circle cx="42" cy="55" r="3" fill="${D}"/><circle cx="58" cy="55" r="3" fill="${D}"/>
    <ellipse class="bot-mouth" cx="50" cy="66" rx="5" ry="4" fill="${D}"/>`,
  owl: `
    <path d="M24 30 L34 44 L20 42Z" fill="#6a5a4a"/><path d="M76 30 L66 44 L80 42Z" fill="#6a5a4a"/>
    <ellipse cx="50" cy="56" rx="34" ry="32" fill="#6a5a4a"/>
    <path d="M18 52 q10 12 22 4 M82 52 q-10 12 -22 4" stroke="#4a3d30" stroke-width="3" fill="none"/>
    <circle cx="37" cy="50" r="15" fill="#f2e8d5"/><circle cx="63" cy="50" r="15" fill="#f2e8d5"/>
    <circle cx="37" cy="50" r="13" fill="none" stroke="#ffc72e" stroke-width="2.5"/><circle cx="63" cy="50" r="13" fill="none" stroke="#ffc72e" stroke-width="2.5"/>
    <circle cx="38" cy="51" r="7" fill="${D}"/><circle cx="62" cy="51" r="7" fill="${D}"/>
    <circle cx="40" cy="49" r="2" fill="#fff"/><circle cx="64" cy="49" r="2" fill="#fff"/>
    <polygon class="bot-mouth" points="50,58 45,66 55,66" fill="#ffc72e"/>`,
  bull: `
    <path d="M30 40 Q10 30 12 16 Q24 22 34 34Z" fill="#f2e8d5"/><path d="M70 40 Q90 30 88 16 Q76 22 66 34Z" fill="#f2e8d5"/>
    <path d="M24 40 Q50 26 76 40 Q80 66 50 82 Q20 66 24 40Z" fill="#9e4636"/>
    <ellipse cx="50" cy="66" rx="20" ry="15" fill="#c98a6a"/>
    <ellipse cx="42" cy="66" rx="4" ry="6" fill="${D}"/><ellipse cx="58" cy="66" rx="4" ry="6" fill="${D}"/>
    <circle cx="50" cy="58" r="4" fill="none" stroke="#ffc72e" stroke-width="3"/>
    <line x1="34" y1="46" x2="46" y2="52" stroke="${D}" stroke-width="5" stroke-linecap="round"/>
    <line x1="66" y1="46" x2="54" y2="52" stroke="${D}" stroke-width="5" stroke-linecap="round"/>
    <circle cx="42" cy="54" r="3.5" fill="${D}"/><circle cx="58" cy="54" r="3.5" fill="${D}"/>
    <path class="bot-mouth" d="M42 76 q8 5 16 0" stroke="${D}" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  // The YapMaster itself: judicial wig, tiny spectacles, gavel. Tutorial only.
  tutor: `
    <path d="M26 90 Q50 76 74 90 L74 98 L26 98Z" fill="#2a2015"/>
    <path d="M44 82 L56 82 L53 92 L47 92Z" fill="#ffc72e"/>
    <circle cx="50" cy="50" r="25" fill="#e8c193"/>
    <circle cx="31" cy="37" r="8.5" fill="#f2ede2"/><circle cx="40" cy="30" r="9" fill="#f2ede2"/>
    <circle cx="51" cy="27" r="9.5" fill="#f2ede2"/><circle cx="62" cy="30" r="9" fill="#f2ede2"/>
    <circle cx="70" cy="37" r="8.5" fill="#f2ede2"/>
    <circle cx="26" cy="48" r="6.5" fill="#f2ede2"/><circle cx="74" cy="48" r="6.5" fill="#f2ede2"/>
    <circle cx="26" cy="59" r="5.5" fill="#f2ede2"/><circle cx="74" cy="59" r="5.5" fill="#f2ede2"/>
    <circle cx="42" cy="52" r="7" fill="none" stroke="#ffc72e" stroke-width="2.5"/>
    <circle cx="60" cy="52" r="7" fill="none" stroke="#ffc72e" stroke-width="2.5"/>
    <line x1="49" y1="52" x2="53" y2="52" stroke="#ffc72e" stroke-width="2.5"/>
    <circle cx="42" cy="52" r="3.2" fill="${D}"/><circle cx="60" cy="52" r="3.2" fill="${D}"/>
    <path d="M36 43 q6 -4 11 -1 M66 43 q-6 -4 -11 -1" stroke="#8a6a4a" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path class="bot-mouth" d="M43 65 q7 5 14 0" stroke="#8a5f33" stroke-width="3" fill="none" stroke-linecap="round"/>
    <line x1="76" y1="80" x2="88" y2="68" stroke="#8a5a2a" stroke-width="4" stroke-linecap="round"/>
    <rect x="82" y="58" width="14" height="9" rx="2.5" fill="#a8702a" transform="rotate(45 89 62.5)"/>`,
  giraffe: `
    <rect x="42" y="52" width="16" height="42" rx="6" fill="#e0a94a"/>
    <circle cx="47" cy="64" r="3.5" fill="#a8702a"/><circle cx="53" cy="78" r="3.5" fill="#a8702a"/><circle cx="46" cy="88" r="3" fill="#a8702a"/>
    <ellipse cx="50" cy="40" rx="17" ry="15" fill="#e8b558"/>
    <ellipse cx="50" cy="52" rx="12" ry="9" fill="#e0a94a"/>
    <line x1="41" y1="26" x2="39" y2="16" stroke="#8a5a2a" stroke-width="4" stroke-linecap="round"/><circle cx="38" cy="14" r="4" fill="#c98a4a"/>
    <line x1="59" y1="26" x2="61" y2="16" stroke="#8a5a2a" stroke-width="4" stroke-linecap="round"/><circle cx="62" cy="14" r="4" fill="#c98a4a"/>
    <circle cx="43" cy="38" r="4" fill="${D}"/><circle cx="57" cy="38" r="4" fill="${D}"/>
    <path d="M38 34 q5 -3 9 -1 M62 34 q-5 -3 -9 -1" stroke="${D}" stroke-width="2" fill="none" stroke-linecap="round"/>
    <ellipse cx="45" cy="52" rx="2.5" ry="3.5" fill="#a8702a"/><ellipse cx="55" cy="52" rx="2.5" ry="3.5" fill="#a8702a"/>
    <path class="bot-mouth" d="M44 56 q6 4 12 0" stroke="#a8702a" stroke-width="2" fill="none" stroke-linecap="round"/>`,
};

interface Props {
  botId: string;
  color: string;
  speaking?: boolean;
  size?: number;
}

export default function BotAvatar({ botId, color, speaking, size = 120 }: Props) {
  const c = COLOR[color] ?? 'var(--gold)';
  const svg = ANIMALS[botId] ?? ANIMALS.owl;
  return (
    <div
      className={`bot-avatar ${speaking ? 'bot-speaking' : ''}`}
      style={{ width: size, height: size, borderColor: c }}
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
