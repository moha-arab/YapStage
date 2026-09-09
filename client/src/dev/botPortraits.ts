// DEV ONLY: candidate bot portraits for the "greatest arguers" ladder,
// drawn 2026-09-05 so he can judge the register before a cast is locked.
// Not imported by the app. If a cast is approved these move into
// BotAvatar.tsx and the animals retire.
//
// The format that separates a BOT from a MASK: a portrait. A person in a
// round frame, head and shoulders, face showing. Masks are a disguise with
// nothing behind them; bots are somebody. Same flat poster style, same
// 100x100 box, drawn to read at 36px.

const D = '#1a1712';

/** The serious attempt (2026-09-05, "make the best image you can of
    Napoleon"). Drawn in a 200-box for precision: real facial structure,
    individual eyes with lids and irises, a nose with nostrils, lips, the
    forward-combed fringe, the bicorne worn side-on with the cockade, the coat
    with collar, lapels and epaulettes. Light from the upper left, two tones
    per surface, no gradients. */
export const NAPOLEON_200 = `
  <circle cx="100" cy="100" r="98" fill="#1b2340"/>
  <circle cx="100" cy="100" r="88" fill="#26325c"/>
  <path d="M28 200 C28 168 56 154 100 154 C144 154 172 168 172 200Z" fill="#1f3a6b"/>
  <path d="M100 154 C144 154 172 168 172 200 L100 200Z" fill="#183059"/>
  <path d="M78 132 H122 V162 L100 174 L78 162Z" fill="#e9c8a4"/>
  <path d="M100 132 H122 V162 L100 174Z" fill="#d8b28a"/>
  <path d="M74 152 L100 176 L126 152 L130 160 L100 190 L70 160Z" fill="#a8281f"/>
  <path d="M100 176 L126 152 L130 160 L100 190Z" fill="#8f1f1a"/>
  <path d="M86 166 L100 184 L114 166 L100 178Z" fill="#f2ede2"/>
  <circle cx="100" cy="188" r="2.6" fill="#c9a04a"/>
  <path d="M28 176 L60 166 L64 176 L34 188Z" fill="#c9a04a"/>
  <path d="M28 176 L60 166 L61 169 L30 179Z" fill="#e2bd5e"/>
  <path d="M34 188 L38 198 M42 186 L46 197 M50 183 L54 194 M58 180 L62 191" stroke="#b08a2e" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M172 176 L140 166 L136 176 L166 188Z" fill="#b08a2e"/>
  <path d="M166 188 L162 198 M158 186 L154 197 M150 183 L146 194 M142 180 L138 191" stroke="#8f6f22" stroke-width="2.4" stroke-linecap="round"/>
  <ellipse cx="52" cy="102" rx="7" ry="10" fill="#d8b28a"/><ellipse cx="148" cy="102" rx="7" ry="10" fill="#d8b28a"/>
  <path d="M100 40 C134 40 150 66 150 98 C150 124 142 146 120 154 Q100 164 80 154 C58 146 50 124 50 98 C50 66 66 40 100 40Z" fill="#e9c8a4"/>
  <path d="M150 98 C150 124 142 146 120 154 Q100 164 80 154 Q100 156 112 150 C132 142 142 124 142 98 C142 72 128 54 110 46 C134 50 150 70 150 98Z" fill="#d8b28a"/>
  <path d="M50 96 C50 60 70 42 100 42 C130 42 150 60 150 96 C142 72 126 62 100 62 C74 62 58 72 50 96Z" fill="#3a2a1e"/>
  <path d="M50 84 Q58 78 66 88 L58 126Z M150 84 Q142 78 134 88 L142 126Z" fill="#3a2a1e"/>
  <path d="M58 66 C74 64 100 66 118 62 C112 74 98 86 82 90 C88 82 76 74 58 66Z" fill="#3a2a1e"/>
  <path d="M6 62 Q28 18 46 24 Q100 44 154 24 Q172 18 194 62 Q100 74 6 62Z" fill="${D}"/>
  <path d="M6 62 Q28 18 46 24 Q76 36 100 38 Q56 42 6 62Z" fill="#2a2529"/>
  <circle cx="46" cy="44" r="11" fill="#1f3a6b"/><circle cx="46" cy="44" r="7.4" fill="#f4efe4"/><circle cx="46" cy="44" r="3.6" fill="#a8281f"/>
  <path d="M66 89 Q82 86 97 93" stroke="#2a1d14" stroke-width="4.5" fill="none" stroke-linecap="round"/>
  <path d="M103 93 Q118 86 134 89" stroke="#2a1d14" stroke-width="4.5" fill="none" stroke-linecap="round"/>
  <path d="M69 101 Q80 92 91 101 Q80 109 69 101Z" fill="#f4efe4"/>
  <path d="M109 101 Q120 92 131 101 Q120 109 109 101Z" fill="#f4efe4"/>
  <circle cx="80" cy="101" r="4.6" fill="#4a5a6a"/><circle cx="120" cy="101" r="4.6" fill="#4a5a6a"/>
  <circle cx="80" cy="101" r="2.4" fill="${D}"/><circle cx="120" cy="101" r="2.4" fill="${D}"/>
  <circle cx="81.4" cy="99.3" r="1.2" fill="#fff"/><circle cx="121.4" cy="99.3" r="1.2" fill="#fff"/>
  <path d="M69 101 Q80 92 91 101 Q80 98 69 101Z" fill="#d8b28a"/><path d="M109 101 Q120 92 131 101 Q120 98 109 101Z" fill="#d8b28a"/>
  <path d="M69 101 Q80 96 91 101" stroke="#2a1d14" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M109 101 Q120 96 131 101" stroke="#2a1d14" stroke-width="2.2" fill="none" stroke-linecap="round"/>
  <path d="M100 96 L107 124 Q104 130 98 129 L100 124Z" fill="#d8b28a"/>
  <path d="M91 127 Q100 133 109 127" stroke="#b5875c" stroke-width="2.6" fill="none" stroke-linecap="round"/>
  <circle cx="93.5" cy="126" r="1.6" fill="#b5875c"/><circle cx="106.5" cy="126" r="1.6" fill="#b5875c"/>
  <path d="M91 139 Q100 137 109 139" stroke="#7a4a3a" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <path d="M94 148 Q100 152 106 148" stroke="#c9a07a" stroke-width="2" fill="none" stroke-linecap="round"/>
  <path d="M40 206 L82 184" stroke="#1f3a6b" stroke-width="18"/>
  <path d="M44 198 L80 179" stroke="#2a4a80" stroke-width="4" stroke-linecap="round"/>
  <path d="M52 199 L86 181" stroke="#183059" stroke-width="6"/>
  <path d="M74 178 L84 196" stroke="#a8281f" stroke-width="5"/>
  <path d="M80 180 C92 177 104 181 107 188 C105 195 92 197 82 195Z" fill="#e9c8a4"/>
  <path d="M91 181 L93 194 M97 182 L99 193" stroke="#d8b28a" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M100 176 L126 152 L130 160 L100 190Z" fill="#8f1f1a"/>`;

export const BOT_PORTRAITS: Record<string, string> = {
  // 200. The Cyclops: one eye, one idea. Grey-green giant, shaggy, sulking.
  cyclops: `
    <circle cx="50" cy="50" r="47" fill="#2b3a35"/>
    <path d="M14 100 C14 82 28 76 50 76 C72 76 86 82 86 100Z" fill="#5a4a3a"/>
    <path d="M50 14 C74 14 86 32 86 54 C86 74 70 84 50 84 C30 84 14 74 14 54 C14 32 26 14 50 14Z" fill="#8a9a7b"/>
    <path d="M16 44 C18 22 30 10 50 10 C70 10 82 22 84 44 C78 34 66 30 50 30 C34 30 22 34 16 44Z" fill="${D}"/>
    <path d="M26 42 Q50 34 74 42 L74 47 Q50 40 26 47Z" fill="${D}"/>
    <circle cx="50" cy="54" r="12" fill="#f4efe4"/>
    <circle cx="50" cy="54" r="6" fill="${D}"/>
    <circle cx="52" cy="52" r="2" fill="#fff"/>
    <path d="M40 74 Q50 69 60 74" stroke="${D}" stroke-width="3" fill="none" stroke-linecap="round"/>
    <path d="M44 62 L50 68 L56 62" stroke="#6f7f62" stroke-width="2.5" fill="none" stroke-linecap="round"/>`,
  // 800. Diogenes: bald, wild beard, sun-dark, a rag over one shoulder, and
  // the lantern he carried looking for an honest man.
  diogenes: `
    <circle cx="50" cy="50" r="47" fill="#3a2f26"/>
    <path d="M14 100 C14 82 28 76 50 76 C72 76 86 82 86 100Z" fill="#6b4b32"/>
    <path d="M50 78 L84 100 L50 100Z" fill="#8a6a48"/>
    <path d="M50 16 C70 16 80 30 80 50 C80 68 68 80 50 80 C32 80 20 68 20 50 C20 30 30 16 50 16Z" fill="#c98b5a"/>
    <path d="M22 36 Q16 44 20 54 M78 36 Q84 44 80 54" stroke="#d8d2c4" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M26 54 Q26 90 50 92 Q74 90 74 54 Q62 62 50 60 Q38 62 26 54Z" fill="#d8d2c4"/>
    <path d="M30 42 L42 45 M70 42 L58 45" stroke="${D}" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M32 49 Q37 46 42 49 Q37 52 32 49Z" fill="${D}"/><path d="M68 49 Q63 46 58 49 Q63 52 68 49Z" fill="${D}"/>
    <path d="M44 57 Q50 60 56 56" stroke="#a86a3a" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <rect x="78" y="62" width="14" height="18" rx="3" fill="#2f2419"/>
    <rect x="81" y="66" width="8" height="10" rx="2" fill="#F0821E"/>
    <path d="M85 62 L85 56" stroke="#2f2419" stroke-width="2.5" stroke-linecap="round"/>`,
  // 1400. Napoleon: the bicorne, the cockade, the navy coat with brass, and
  // a face that has already decided.
  napoleon: `
    <circle cx="50" cy="50" r="47" fill="#2a3352"/>
    <path d="M14 100 C14 82 28 76 50 76 C72 76 86 82 86 100Z" fill="#1f3a6b"/>
    <path d="M40 78 L50 100 L60 78 L50 84Z" fill="#a8281f"/>
    <path d="M24 84 L20 100 L34 100 L34 82Z" fill="#c9a04a"/><path d="M76 84 L80 100 L66 100 L66 82Z" fill="#c9a04a"/>
    <path d="M50 20 C68 20 78 34 78 52 C78 68 66 80 50 80 C34 80 22 68 22 52 C22 34 32 20 50 20Z" fill="#e8c9a3"/>
    <path d="M24 44 C26 30 36 24 50 24 C64 24 74 30 76 44 C70 38 60 36 50 36 C40 36 30 38 24 44Z" fill="#3a2a1e"/>
    <path d="M6 34 Q50 10 94 34 Q50 26 6 34Z" fill="${D}"/>
    <path d="M8 34 Q50 42 92 34 L90 38 Q50 46 10 38Z" fill="${D}"/>
    <circle cx="66" cy="33" r="4" fill="#a8281f"/><circle cx="66" cy="33" r="2.2" fill="#f4efe4"/><circle cx="66" cy="33" r="1" fill="#1f3a6b"/>
    <path d="M32 46 L44 48 M68 46 L56 48" stroke="${D}" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M33 52 Q38 49 43 52 Q38 55 33 52Z" fill="${D}"/><path d="M67 52 Q62 49 57 52 Q62 55 67 52Z" fill="${D}"/>
    <path d="M50 54 L47 63 L53 63Z" fill="#d1a273"/>
    <path d="M44 70 H56" stroke="#8a5a3a" stroke-width="2.5" stroke-linecap="round"/>`,
  // 2000. Lincoln: the stovepipe, the gaunt face, the chin beard with no
  // moustache, the bow tie.
  lincoln: `
    <circle cx="50" cy="50" r="47" fill="#2e2a33"/>
    <path d="M14 100 C14 82 28 76 50 76 C72 76 86 82 86 100Z" fill="${D}"/>
    <path d="M42 80 L50 76 L58 80 L50 86Z" fill="#f4efe4"/><path d="M38 78 L46 82 L38 86Z M62 78 L54 82 L62 86Z" fill="#2f2419"/>
    <path d="M50 22 C66 22 74 34 74 52 C74 70 64 82 50 82 C36 82 26 70 26 52 C26 34 34 22 50 22Z" fill="#e3c39c"/>
    <path d="M28 66 Q28 86 50 88 Q72 86 72 66 Q62 74 50 72 Q38 74 28 66Z" fill="#2f2419"/>
    <path d="M40 66 Q50 70 60 66" stroke="#b08a66" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    <path d="M28 44 C30 30 38 24 50 24 C62 24 70 30 72 44 C64 38 58 36 50 36 C42 36 36 38 28 44Z" fill="#2f2419"/>
    <rect x="30" y="2" width="40" height="30" rx="2" fill="${D}"/>
    <path d="M18 30 H82 Q84 32 82 35 H18 Q16 32 18 30Z" fill="${D}"/>
    <path d="M30 26 H70" stroke="#4a4040" stroke-width="3"/>
    <path d="M33 47 L44 49 M67 47 L56 49" stroke="${D}" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M34 53 Q39 50 44 53 Q39 56 34 53Z" fill="${D}"/><path d="M66 53 Q61 50 56 53 Q61 56 66 53Z" fill="${D}"/>
    <path d="M50 54 L46 64 L54 64Z" fill="#c9a07a"/>`,
  // 2600. Socrates: bald, snub nose, the white beard, a robe over one
  // shoulder, and one eyebrow already up.
  socrates: `
    <circle cx="50" cy="50" r="47" fill="#3b3428"/>
    <path d="M14 100 C14 82 28 76 50 76 C72 76 86 82 86 100Z" fill="#e8dfc9"/>
    <path d="M14 100 C14 84 26 78 40 76 L30 100Z" fill="#d1a273"/>
    <path d="M50 14 C70 14 80 28 80 48 C80 66 68 78 50 78 C32 78 20 66 20 48 C20 28 30 14 50 14Z" fill="#d1a273"/>
    <path d="M22 44 Q16 50 20 58 M78 44 Q84 50 80 58" stroke="#e6e2d8" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M24 56 Q24 90 50 92 Q76 90 76 56 Q64 64 50 62 Q36 64 24 56Z" fill="#e6e2d8"/>
    <path d="M30 40 L42 44 M70 38 L58 44" stroke="${D}" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M32 49 Q37 46 42 49 Q37 52 32 49Z" fill="${D}"/><path d="M68 49 Q63 46 58 49 Q63 52 68 49Z" fill="${D}"/>
    <path d="M44 52 Q50 60 56 52 Q50 58 44 52Z" fill="#b07d4a"/>
    <path d="M45 60 H55" stroke="#a86a3a" stroke-width="2.5" stroke-linecap="round"/>`,
  // 2800. Athena: the Corinthian helmet pushed up, the crest, the owl on the
  // shoulder, and a face that is not worried about you.
  athena: `
    <circle cx="50" cy="50" r="47" fill="#2b3548"/>
    <path d="M14 100 C14 82 28 76 50 76 C72 76 86 82 86 100Z" fill="#e8dfc9"/>
    <path d="M50 20 C68 20 78 34 78 52 C78 70 66 82 50 82 C34 82 22 70 22 52 C22 34 32 20 50 20Z" fill="#d9b48a"/>
    <path d="M22 50 C22 24 34 10 50 10 C66 10 78 24 78 50 L72 50 C72 32 62 24 50 24 C38 24 28 32 28 50Z" fill="#b07d3a"/>
    <path d="M42 8 Q50 -2 58 8 L60 26 Q50 22 40 26Z" fill="#a8281f"/>
    <path d="M28 50 L18 62 L30 60Z M72 50 L82 62 L70 60Z" fill="#b07d3a"/>
    <path d="M32 46 L44 48 M68 46 L56 48" stroke="${D}" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M33 52 Q38 49 43 52 Q38 55 33 52Z" fill="${D}"/><path d="M67 52 Q62 49 57 52 Q62 55 67 52Z" fill="${D}"/>
    <circle cx="38.5" cy="51.4" r="1.2" fill="#fff"/><circle cx="62.5" cy="51.4" r="1.2" fill="#fff"/>
    <path d="M50 54 L47 63 L53 63Z" fill="#c49466"/>
    <path d="M44 70 H56" stroke="#8a5a3a" stroke-width="2.5" stroke-linecap="round"/>
    <path d="M80 70 C88 70 92 76 92 84 C92 90 88 94 80 94 C72 94 68 90 68 84 C68 76 72 70 80 70Z" fill="#6b5a45"/>
    <circle cx="76" cy="80" r="3.2" fill="#f4efe4"/><circle cx="84" cy="80" r="3.2" fill="#f4efe4"/>
    <circle cx="76" cy="80" r="1.5" fill="${D}"/><circle cx="84" cy="80" r="1.5" fill="${D}"/>
    <path d="M78 85 L80 88 L82 85Z" fill="#F0821E"/>`,
};

/* Aristotle, drawn from the Lysippos type (the Roman copies in Vienna and the
   Palazzo Altemps): high receding hairline with the crown thinly covered,
   short tight curls at the sides, a SHORT curly beard that stops well clear of
   the chest (Plato's and Zeus's are long — that is the tell), a long straight
   narrow nose, deep-set eyes under a heavy brow, hollow cheeks, and the
   himation off the right shoulder. */
export const ARISTOTLE_200 = `
  <path d="M28 200 C32 178 46 163 70 156 L100 150 L130 156 C154 163 168 178 172 200Z" fill="#a9a294"/>
  <path d="M172 200 C168 178 155 163 134 156 C147 167 153 183 155 200Z" fill="#8f887c"/>
  <path d="M64 200 C80 192 94 180 102 166" stroke="#948d80" stroke-width="2.4" fill="none" stroke-linecap="round"/>
  <path d="M100 200 C114 193 128 183 138 172" stroke="#948d80" stroke-width="2.1" fill="none" stroke-linecap="round"/>
  <path d="M28 200 C32 178 46 163 70 156 L92 152 C88 166 76 180 58 190 L42 200Z" fill="#b38058"/>
  <path d="M92 152 C88 166 76 180 58 190 L42 200" stroke="#8a8377" stroke-width="3.2" fill="none"/>
  <path d="M60 174 C68 170 78 167 86 166" stroke="#a5714a" stroke-width="1.6" fill="none" stroke-linecap="round" opacity="0.45"/>
  <path d="M78 148 C88 159 112 159 122 148 L126 159 C114 169 86 169 74 159Z" fill="#6f6a60" opacity="0.34"/>
  <path d="M100 22 C120 22 134 44 134 80 C134 99 130 119 122 132 C114 144 107 148 100 148 C93 148 86 144 78 132 C70 119 66 99 66 80 C66 44 80 22 100 22Z" fill="#d5a578"/>
  <path d="M100 22 C120 22 134 44 134 80 C134 99 130 119 122 132 C119 136 116 141 113 144 C119 130 124 108 124 84 C124 54 116 32 98 23 C99 22 99.5 22 100 22Z" fill="#c08a5c"/>
  <path d="M127 86 C126 99 122 110 116 118 L109 114 C116 107 120 97 121 86Z" fill="#b07d50" opacity="0.45"/>
  <path d="M78 88 C82 86 87 87 89 90 C85 92 80 92 78 88Z" fill="#e2b98e" opacity="0.4"/>
  <path d="M84 54 C88 49.5 94 49.5 97.2 53 C93.5 57 87 57 84 54Z" fill="#e2b98e" opacity="0.14"/>
  <path d="M116 54 C112 49.5 106 49.5 102.8 53 C106.5 57 113 57 116 54Z" fill="#e2b98e" opacity="0.08"/>
  <path d="M66 100 C64 78 64 50 78 32 C84 25 92 21 100 21 C108 21 116 25 122 32 C136 50 136 78 134 100 L127 104 C129 86 130 64 126 52 C123 42 117 35 109 32.8 C105.5 34.6 103 35.4 100 35.4 C97 35.4 94.5 34.6 91 32.8 C83 35.4 78 42 74 53 C70 65 71 86 73 104Z" fill="#cdc4b6"/>
  <path d="M134 100 C136 78 136 50 122 32 C119 29 116 27 113 25 C124 34 129 52 128 74 C128 84 128 94 127 104Z" fill="#b3aa9c"/>
  <path d="M70 56 C67 59 68 62 71 63" stroke="#b3aa9c" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <path d="M69 72 C66 76 67 79 70 80" stroke="#b3aa9c" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <path d="M72 88 C69 91 70 94 73 95" stroke="#b3aa9c" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <path d="M130 58 C133 61 132 64 129 65" stroke="#a9a5a2" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <path d="M131 75 C134 79 133 82 130 83" stroke="#a9a5a2" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <path d="M128 91 C131 94 130 97 127 98" stroke="#a9a5a2" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <path d="M71 83 C66 81 62.5 85 63 90 C63.5 95.5 67.5 99.5 71.5 98 C68.5 93.5 68 88 71 83Z" fill="#c08a5c"/>
  <path d="M69 87 C66 88 65.5 92 67.5 95" stroke="#a5714a" stroke-width="1.3" fill="none" stroke-linecap="round"/>
  <path d="M129 83 C134 81 137.5 85 137 90 C136.5 95.5 132.5 99.5 128.5 98 C131.5 93.5 132 88 129 83Z" fill="#c08a5c"/>
  <path d="M131 87 C134 88 134.5 92 132.5 95" stroke="#a5714a" stroke-width="1.3" fill="none" stroke-linecap="round"/>
  <path d="M78 65 C86 59 94 58 100 58 C106 58 114 59 122 65" stroke="#bf8f66" stroke-width="1.8" fill="none" stroke-linecap="round" opacity="0.6"/>
  <path d="M90 51 C95 48.5 106 48.5 111 51" stroke="#bf8f66" stroke-width="1.1" fill="none" stroke-linecap="round" opacity="0.28"/>
  <path d="M97.5 71 L97 78 M102.5 71 L103 78" stroke="#bf8f66" stroke-width="1.2" fill="none" stroke-linecap="round" opacity="0.75"/>
  <path d="M74 79 C79 73.5 87 72.5 93 76.5 L92.5 79.8 C87 76.6 80 77.6 75.5 82Z" fill="#8a7561"/>
  <path d="M126 78.5 C121 73 113 72 107 76 L107.5 79.3 C113 76.1 120 77.1 124.5 81.5Z" fill="#8a7561"/>
  <path d="M77 86.5 C81 82.5 88 82 91.5 86 C88 90 81 90.5 77 86.5Z" fill="#ddd3c3"/>
  <path d="M123 86.5 C119 82.5 112 82 108.5 86 C112 90 119 90.5 123 86.5Z" fill="#ddd3c3"/>
  <circle cx="84.5" cy="86.4" r="3.6" fill="#6b5334"/><circle cx="115.5" cy="86.4" r="3.6" fill="#6b5334"/>
  <circle cx="84.5" cy="86.4" r="1.7" fill="#241c12"/><circle cx="115.5" cy="86.4" r="1.7" fill="#241c12"/>
  <path d="M76.8 86.6 C80.8 82.4 88 81.8 91.7 85.8 L91.7 86.9 C88 83.8 81.2 84.4 77.7 88Z" fill="#a5714a"/>
  <path d="M123.2 86.6 C119.2 82.4 112 81.8 108.3 85.8 L108.3 86.9 C112 83.8 118.8 84.4 122.3 88Z" fill="#a5714a"/>
  <path d="M77.5 89.4 C81.5 92 88 91.8 91.5 88.6" stroke="#b98d5f" stroke-width="1.1" fill="none" stroke-linecap="round"/>
  <path d="M122.5 89.4 C118.5 92 112 91.8 108.5 88.6" stroke="#b98d5f" stroke-width="1.1" fill="none" stroke-linecap="round"/>
  <path d="M92.5 108.6 C92.5 104 96 101.4 100 101.4 C104 101.4 107.5 104 107.5 108.6 C107.5 112.2 104.6 114 100 114 C95.4 114 92.5 112.2 92.5 108.6Z" fill="#c08a5c"/>
  <path d="M100.4 75 C101.4 86 102.6 95 104.2 100.5 C106.4 105.6 105.4 111.8 100 111.8 C98.4 111.8 97 111.6 96 111.2 C100.8 111 103 108.6 102.2 103.4 C101.2 96 100 86 99.2 75Z" fill="#b07d50"/>
  <path d="M97.6 96 C96 101 95.6 106 96.6 110.4 L99.6 111 C98.8 106.6 98.8 101 99.4 96Z" fill="#e2b98e" opacity="0.55"/>
  <path d="M92.4 110 C92.4 107 94.6 105.6 96.4 107.2 C97.8 108.5 97.6 111 96 111.9 C94 113 92.4 112 92.4 110Z" fill="#96643e"/>
  <path d="M107.6 110 C107.6 107 105.4 105.6 103.6 107.2 C102.2 108.5 102.4 111 104 111.9 C106 113 107.6 112 107.6 110Z" fill="#96643e"/>
  <path d="M96.2 106 C94.6 109.4 95 112.4 97.6 113.4 C100 114.2 101.4 112.4 101 110 C100.6 108 99.2 106.2 98.2 105.4Z" fill="#e6c096"/>
  <path d="M97.2 113.6 H102.8" stroke="#96643e" stroke-width="1.2" fill="none" stroke-linecap="round"/>
  <path d="M108 110 C110.6 115 110.6 119.5 108 124" stroke="#a5714a" stroke-width="1.8" fill="none" stroke-linecap="round" opacity="0.5"/>
  <path d="M92 110 C89.8 114.5 89.8 118 91.6 121.8" stroke="#a5714a" stroke-width="1.4" fill="none" stroke-linecap="round" opacity="0.25"/>
  <path d="M74 98 C72 112 74 128 82 140 C88 149 94 156 100 156 C106 156 112 149 118 140 C126 128 128 112 126 98 C124 108 121 118 115 124 C109 131 105 136 100 136 C95 136 91 131 85 124 C79 118 76 108 74 98Z" fill="#cdc4b6"/>
  <circle cx="78" cy="121" r="6.5" fill="#cdc4b6"/><circle cx="122" cy="123" r="5.5" fill="#cdc4b6"/>
  <circle cx="85" cy="140" r="6" fill="#cdc4b6"/><circle cx="116" cy="142" r="7" fill="#cdc4b6"/>
  <circle cx="97" cy="151" r="6" fill="#cdc4b6"/>
  <path d="M126 98 C128 112 126 128 118 140 C114 146 110 151 106 154 C114 143 120 128 122 112 C123 106 123 102 122 99Z" fill="#b3aa9c" opacity="0.32"/>
  <path d="M80 126 C77 130 78 133 81 134" stroke="#b3aa9c" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <path d="M85 139 C82 143 83 146 86 147" stroke="#b3aa9c" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <path d="M119 128 C122 132 121 135 118 136" stroke="#a9a5a2" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <path d="M114 142 C117 146 116 149 113 150" stroke="#a9a5a2" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <path d="M81 124 C80.5 118.5 87 114 94.6 113.6 C97.6 113.6 99.3 115 99.4 116.6 L99.4 120 C96.5 124.6 89 126.5 81 124Z" fill="#bfb5a6"/>
  <path d="M119 124 C119.5 118.5 113 114 105.4 113.6 C102.4 113.6 100.7 115 100.6 116.6 L100.6 120 C103.5 124.6 111 126.5 119 124Z" fill="#bfb5a6"/>
  <path d="M99.4 115 L100.6 115 L100.6 120.6 L99.4 120.6Z" fill="#9c9284"/>
  <path d="M93 116 C89 118 86 120.5 84 123.5" stroke="#a89e8f" stroke-width="1.1" fill="none" stroke-linecap="round"/>
  <path d="M107 116 C111 118 114 120.5 116 123.5" stroke="#a89e8f" stroke-width="1.1" fill="none" stroke-linecap="round"/>
  <path d="M87.5 126.6 C94 123.8 106 123.8 112.5 126.6 C106 129.2 94 129.2 87.5 126.6Z" fill="#6b5342"/>
  <path d="M90.5 128.4 C95.5 130.6 104.5 130.6 109.5 128.4 C106 134 94 134 90.5 128.4Z" fill="#dda877" opacity="0.8"/>
`;
