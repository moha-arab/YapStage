# YapStage brand

## The mark

Two **quote marks facing each other**: the left one opens, the right one
answers. Amber on the left, turquoise on the right, rotationally symmetric.

Six directions were drawn and rendered at the sizes a mark actually gets used
at — 16px browser tab, 32px, 64px, 180px home screen. The gavel-microphone, the
clashing speech bubbles and the two-microphone Y all turned to mush at 16px. A
debate is two people quoting each other, and quote marks are the one piece of
punctuation everybody already reads as "somebody said this", so the idea
survives at any size without a single extra shape to lose.

It replaced a colour-split slab letter **Y** in August 2026.

## Colours

| token | hex | job |
| --- | --- | --- |
| house | `#16172B` | the dark. a blue-plum, never a warm black |
| house-2 | `#1D1E36` | panels |
| house-3 | `#262748` | hairlines, quiet fills |
| paper | `#EFE8D8` | type on dark, and the one warm panel per screen |
| ink | `#101018` | type on paper |
| amber | `#F0821E` | the FOR side, and the one loud control on a screen |
| turquoise | `#1FC2D4` | the AGAINST side, and selection |
| live | `#2FD37A` | a real-time status. online, on air, heard |
| gold | `#FFC72E` | **a win, a rank, a rank-up. nothing else.** |

Three things about this palette were decisions, not taste:

**Not red versus blue.** In an app about arguing, red versus blue reads
Republican versus Democrat before it reads two debaters, and it drags a
political frame onto a debate about whether pineapple belongs on pizza. Amber
and turquoise are theatre gels — bastard amber and turquoise are the two
cheapest lights in any real theatre — and neither one belongs to a team.

**Not warm black and gold.** That combination is the house style of every
sportsbook, every crypto landing page and roughly every AI-generated dark UI
there is. The dark is a blue-plum instead, and gold is rationed.

**Gold is a prize.** It was doing sixty-seven jobs in the stylesheet at once —
every primary button, every selected chip, the mic meter, the presence dot, a
bot's tagline. A colour that means "press this" and "you won" and "this is a
heading" means nothing. It now appears on a win, a rating and a rank-up.

## Type

| face | job |
| --- | --- |
| **Ultra** | display. the wordmark, names on the stage, the motion |
| **Libre Franklin** | everything you read |
| **DM Mono** | anything that counts: clocks, ratings, scores, room codes |

Numbers are mono and tabular on purpose: a rating ticking from 1099 to 1100
must not shove the label next to it sideways.

## Files

Everything is generated. Do not hand-edit the SVGs:

```bash
node brand/build.cjs          # every SVG, plus client/public/favicon + mask-icon
node brand/build.cjs --png    # the rasters, via headless Chrome over _render.html
```

| file | use |
| --- | --- |
| `logo-mark.svg` | the mark on its house tile. app icons, avatars, anywhere square |
| `logo-mark-plain.svg` | no tile, for laying over a ground you control |
| `logo-mark-light.svg` | for light backgrounds: paper tile, same two gels |
| `logo-mark-mono.svg` | one colour, transparent. **inline it** so `currentColor` works |
| `logo-mark-mono-paper.svg` | the same in paper, for when it must be an `<img>` |
| `logo-lockup.svg` | mark + wordmark on the house tile. headers, READMEs, slides |
| `logo-lockup-light.svg` | the same for light backgrounds |
| `logo-lockup-plain.svg` | no tile, for laying over artwork |
| `logo-wordmark-only.svg` | wordmark alone, when the mark is already on the page |
| `logo-lockup.png` | raster lockup, 1026px wide |
| `social/pfp-*.png` | profile pictures. the mark sits at 60% because every platform crops a pfp to a circle |
| `social/header-1500x500.png` | X / LinkedIn header |

Shipped assets live in `client/public/`: `favicon.svg` (a copy of the mark),
`apple-touch-icon.png` (180), `icon-512.png`, `icon-maskable.png` (512 with the
Android safe zone), `og.png` (1200x630 link preview), `mask-icon.svg` (the
Safari pinned-tab silhouette).

In the app the mark is drawn inline by `client/src/Brand.tsx` so it inherits
colour and costs no request.

## Type is converted to outlines

Every wordmark file has the Ultra letters as **paths, not `<text>`**, from
`_wordmark.json`. An SVG used the way a logo actually gets used — as `<img>`,
in an email, in somebody else's slide deck — cannot fetch a webfont, so a
`<text>` version silently falls back to Times and stops being the logo.
Verified: the `<text>` version rendered in a serif fallback the moment it was
loaded through `<img>`.

Two traps worth knowing if you ever regenerate the outlines with opentype.js:

- **Variable fonts emit literal `NaN` coordinates.** The browser then silently
  stops drawing partway through the path. Grep any generated path data for
  `NaN` before shipping it.
- **Headless Chrome will not make a window narrower than ~500px on Windows.**
  Ask for a 180px screenshot and you get a 180px crop of a 500px page. Render
  at an integer multiple and scale back with `--force-device-scale-factor`;
  `build.cjs` does this.

## Rules

- The mark keeps its dark tile in app icons. The tile is part of the mark, not
  a background it happens to be sitting on.
- Never recolour the two quotes. They are the idea.
- The mark stands about a fifth taller than the wordmark's cap height in the
  lockup. Matched heights make it look like a typo next to the word, because
  Ultra is a black slab and the quotes are open shapes.
- Gold is a prize. See above.
