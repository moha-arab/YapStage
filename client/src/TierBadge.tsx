// Tier badges: one crest, eight metals. The shape is a shield carrying the
// brand's facing quotes — your rank in this house is how well you argue, so
// the crest wears the argument mark, not a sword.
//
// Design rules, so a ninth tier doesn't break the system:
//   - ONE silhouette for the seven metals; recognition comes from colour, the
//     way every game ladder works. Iron is matte and quiet, Diamond gets
//     facets, Master gets the star. Progression should be readable at 16px in
//     a chip and at 64px on the landing.
//   - HEADLINER breaks the silhouette on purpose: it is not a bigger metal,
//     it is the name on the marquee — house-dark crest, marquee rays, and the
//     quotes in their true colours. The only badge that wears the brand gels.
//   - Flat fills only. A gradient here and the whole poster language dies.

interface Palette {
  /** face, rim (darker), quotes (darkest, reads as engraving) */
  face: string;
  rim: string;
  ink: string;
}

const METALS: Record<string, Palette> = {
  iron: { face: '#878B96', rim: '#5C606B', ink: '#3D404A' },
  bronze: { face: '#C98146', rim: '#96562A', ink: '#6E3D1B' },
  silver: { face: '#CDD2DC', rim: '#98A0AF', ink: '#6E7686' },
  gold: { face: '#FFC72E', rim: '#D49A10', ink: '#8F6608' },
  platinum: { face: '#BCE3DE', rim: '#82B7B1', ink: '#4F827D' },
  diamond: { face: '#8FDCEC', rim: '#4BA9C4', ink: '#2E7A93' },
  master: { face: '#B68CEC', rim: '#8154C4', ink: '#5A3494' },
};

const SHIELD = 'M32 5 L55 13 V33 Q55 49 32 59 Q9 49 9 33 V13 Z';
const RIM = 'M32 5 L55 13 V33 Q55 49 32 59 Q9 49 9 33 V13 L32 5 M32 10.3 L14 16.6 V33 Q14 45.5 32 53.7 Q50 45.5 50 33 V16.6 Z';
// The facing quotes, shrunk into the crest's heart.
const Q1 = 'M22.6 22 h9.4 v9.4 q0 5.6 -6.6 7.5 v-3.8 q3.3 -1.4 3.3 -3.7 h-6.1 z';
const Q2 = 'M41.4 39 h-9.4 v-9.4 q0 -5.6 6.6 -7.5 v3.8 q-3.3 1.4 -3.3 3.7 h6.1 z';

function metalBadge(key: string, p: Palette): string {
  // Master trades the quotes for a star — you beat the last bot; the argument
  // mark gives way to the medal. Everything below Master argues.
  const heart =
    key === 'master'
      ? `<path d="M32 15 L36.4 24.6 L46.8 25.8 L39 32.9 L41.2 43.2 L32 37.9 L22.8 43.2 L25 32.9 L17.2 25.8 L27.6 24.6 Z" fill="${p.ink}"/>`
      : `<path d="${Q1}" fill="${p.ink}"/><path d="${Q2}" fill="${p.ink}"/>`;
  const extras =
    key === 'diamond'
      ? // facet lines: the one metal that is a cut stone
        `<path d="M32 5 L32 10.3 M9 33 L14 33 M55 33 L50 33 M13.5 11.5 L17 15.5 M50.5 11.5 L47 15.5" stroke="${p.rim}" stroke-width="1.6"/>`
      : '';
  return `
    <path d="${SHIELD}" fill="${p.face}"/>
    <path d="${RIM}" fill="${p.rim}" fill-rule="evenodd"/>
    ${extras}
    ${heart}`;
}

const HEADLINER = `
  <g fill="#FFC72E">
    <path d="M32 0.5 L34 6 L30 6 Z"/>
    <path d="M13.2 6.2 L17.6 10.1 L14.2 12.2 Z"/>
    <path d="M50.8 6.2 L46.4 10.1 L49.8 12.2 Z"/>
    <path d="M3 20 L9 21.8 L6.4 24.8 Z"/>
    <path d="M61 20 L55 21.8 L57.6 24.8 Z"/>
  </g>
  <path d="${SHIELD}" fill="#1D1E36"/>
  <path d="${RIM}" fill="#FFC72E" fill-rule="evenodd"/>
  <path d="${Q1}" fill="#F0821E"/>
  <path d="${Q2}" fill="#1FC2D4"/>`;

export const TIER_BADGES: Record<string, string> = {
  ...Object.fromEntries(Object.entries(METALS).map(([k, p]) => [k, metalBadge(k, p)])),
  headliner: HEADLINER,
};

interface Props {
  tier: string;
  size?: number | string;
}

export default function TierBadge({ tier, size = 20 }: Props) {
  const svg = TIER_BADGES[tier] ?? TIER_BADGES.iron;
  return (
    <svg
      viewBox="0 0 64 64"
      style={{ width: size, height: size, display: 'block', flex: 'none' }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
