/** The light each fighter stands in. It belongs to the fighter, not to the
    stage: one shared drawing behind both of them drifts off-centre the moment
    one side is a mask and the other is an empty ring.

    Lived in Home.tsx until the fight card (FightCard.tsx) needed the same
    light, so the match intro and the lobby are lit by one drawing. */
export default function Cone({ color, id }: { color: string; id: string }) {
  return (
    <svg className="lb-cone" viewBox="0 0 300 560" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.55" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points="100,-20 200,-20 300,560 0,560" fill={`url(#${id})`} />
    </svg>
  );
}
