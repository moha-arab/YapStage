# YapStage brand

## The mark

A **Y**, drawn as a slab serif, with the idea carried entirely in colour: the
left arm is FOR, the right arm is AGAINST, and the gold stem they share is the
stage. Two debaters, one stage, one letter.

It is coloured rather than built out of extra shapes for a reason that was
tested rather than assumed. Six concepts were drawn and rendered at the sizes
they actually get used — 16px browser tab, 32px, 64px, 180px home screen. The
gavel-microphone, the clashing speech bubbles and the two-microphone Y all
turned to mush at 16px. A letter was the only thing that survived, and colour
costs nothing at 16px because it adds no shapes to lose.

**The mark is not set in Ultra.** Ultra is the wordmark face and its Y is wide,
stubby and shallow-forked: at 150px it reads as a goblet and at 16px it is a
smear. A monogram has to survive alone, so it is drawn in the same slab-serif
family instead. The wordmark keeps real Ultra, where the letter has neighbours.

## Files

| file | use |
| --- | --- |
| `logo-mark.svg` | the mark on its dark tile. app icons, avatars, anywhere square |
| `logo-mark-light.svg` | for light backgrounds: stem goes ink, arms keep their sides |
| `logo-mark-mono.svg` | one colour, transparent. **inline it** so `currentColor` works |
| `logo-mark-mono-gold.svg` | the same, gold, for when it must be an `<img>` |
| `logo-lockup.svg` | mark + wordmark, dark backgrounds. headers, READMEs, slides |
| `logo-lockup-light.svg` | the same for light backgrounds |
| `logo-lockup.png` | raster lockup, 1026px wide, for anywhere SVG is awkward |
| `logo-wordmark-only.svg` | wordmark alone, when the mark is already on the page |
| `logo-wordmark-only-light.svg` | the same for light backgrounds |

Shipped assets live in `client/public/`: `favicon.svg` (a copy of the mark),
`apple-touch-icon.png` (180), `icon-512.png`, `icon-maskable.png` (512 with the
Android safe zone), `og.png` (1200x630 link preview).

## Type is converted to outlines

Every wordmark file has the Ultra letters as **paths, not `<text>`**. An SVG
used the way a logo actually gets used — as `<img>`, in an email, in somebody
else's slide deck — cannot fetch a webfont, so a `<text>` version silently
falls back to Times and stops being the logo. Verified: the `<text>` version
rendered in a serif fallback the moment it was loaded through `<img>`.

## Colours

| token | hex | job |
| --- | --- | --- |
| ink | `#f2e8d5` | type on dark |
| bg | `#141210` | the tile, the app |
| for | `#ff4d2e` | the FOR side |
| against | `#33b6ff` | the AGAINST side |
| gold | `#ffc72e` | the stage, the winner, the accent |

## Rules

- The mark keeps its dark tile. It is part of the mark, not a background it
  happens to be sitting on.
- Never re-colour the arms. Red and blue are the two sides of a debate
  everywhere else in the product; changing them here breaks that.
- Never add a gradient, a bevel or a shadow to the letter. The flat poster
  style **is** the identity, which is the same rule the bot avatars follow.
- Leave clear space of at least one stem width around the lockup.

## Regenerating the PNGs

`_render.html` holds one exact-size artboard per asset. Serve this folder and
screenshot each artboard headlessly:

```bash
chrome --headless --disable-gpu --hide-scrollbars \
  --screenshot=out.png --window-size=1200,630 \
  "http://localhost:3021/_render.html?a=og"
```

Artboards: `icon180`, `icon512`, `maskable`, `lockup`, `og`.
