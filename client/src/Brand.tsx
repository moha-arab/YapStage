// The mark, inline, so it inherits colour and needs no network round trip in a
// top bar that renders on every screen.
//
// Two quote marks facing each other: the left one opens, the right one
// answers. It replaced a colour-split letter Y in August 2026 because it is
// the only one of six tested directions that still reads at 16px — a debate is
// two people quoting each other, and quote marks are the one piece of
// punctuation everyone already knows means "somebody said this".
//
// Amber and turquoise are theatre gels, not teams. Red versus blue in an app
// about arguing reads Republican versus Democrat before it reads two debaters.
// See brand/build.cjs, which generates every static version of this from the
// same two paths.

interface Props {
  /** Mark height in px. The wordmark scales with it. */
  size?: number;
  /** Mark only, for tight bars and avatars. */
  markOnly?: boolean;
}

export default function Brand({ size = 28, markOnly }: Props) {
  return (
    <span className="brand-lockup">
      <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label="YapStage">
        <path d="M8 14 h20 v20 q0 12 -14 16 v-8 q7 -3 7 -8 h-13 z" fill="var(--amber)" />
        <path d="M56 50 h-20 v-20 q0 -12 14 -16 v8 q-7 3 -7 8 h13 z" fill="var(--turq)" />
      </svg>
      {markOnly ? null : (
        <span className="brand-word" style={{ fontSize: Math.round(size * 0.75) }}>
          YAPSTAGE
        </span>
      )}
    </span>
  );
}
