/* Regenerates every brand SVG from one source of truth.
 *
 *   node brand/build.cjs          (from the repo root, or from brand/)
 *
 * Then the PNGs, which need a browser because they are rasterised artboards:
 *   node brand/build.cjs --png    (drives headless Chrome over _render.html)
 *
 * THE MARK is two quote marks facing each other: amber on the left, turquoise
 * on the right, rotationally symmetric. It was picked over five other
 * directions because it is the only one that still reads at 16px — a debate is
 * two people quoting each other, and quote marks are the one piece of
 * punctuation everyone already knows means "somebody said this".
 *
 * Red and blue were rejected on purpose: in an app about arguing, red versus
 * blue reads as Republican versus Democrat before it reads as two debaters.
 * These are theatre gels instead — bastard amber and turquoise, the two
 * cheapest lights in any real theatre.
 *
 * THE WORDMARK is Ultra, converted to outlines (_wordmark.json). An SVG used
 * the way a logo actually gets used — as <img>, in an email, in someone else's
 * slide deck — cannot fetch a webfont, so a <text> version silently falls back
 * to Times and stops being the logo.
 */
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const PUB = path.join(HERE, '..', 'client', 'public');
const w = JSON.parse(fs.readFileSync(path.join(HERE, '_wordmark.json'), 'utf8'));

const C = {
  house: '#16172B',
  paper: '#EFE8D8',
  ink: '#101018',
  amber: '#F0821E',
  turq: '#1FC2D4',
};

// The mark, in a 64 box. Ink bbox is x 8..56, y 14..50.
const AMBER_D = 'M8 14 h20 v20 q0 12 -14 16 v-8 q7 -3 7 -8 h-13 z';
const TURQ_D = 'M56 50 h-20 v-20 q0 -12 14 -16 v8 q-7 3 -7 8 h13 z';
const quotes = (a = C.amber, b = C.turq) =>
  `<path d="${AMBER_D}" fill="${a}"/><path d="${TURQ_D}" fill="${b}"/>`;

// Wordmark metrics, measured from the outlines rather than guessed.
const WM = { x1: 0.61, x2: 388.8, top: -45.8, bottom: 1.3 };
const WM_W = WM.x2 - WM.x1; // 388.19
const WM_H = WM.bottom - WM.top; // 47.10

const head = (vb, wpx, hpx, extra = '') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${wpx}" height="${hpx}" role="img" aria-label="YapStage"${extra}><title>YapStage</title>`;

const write = (file, body) => {
  fs.writeFileSync(file, body.trim() + '\n');
  console.log('  ' + path.relative(path.join(HERE, '..'), file).replace(/\\/g, '/'));
};

/* ---------------------------------------------------------------- the mark */

console.log('mark');
write(
  path.join(HERE, 'logo-mark.svg'),
  `${head('0 0 64 64', 64, 64)}
  <!-- THE MARK on its house tile. App icons, avatars, anywhere square.
       Two quote marks facing each other: the left one opens, the right one
       answers. The tile is part of the mark, not a background it happens to
       be sitting on. -->
  <rect width="64" height="64" fill="${C.house}"/>
  ${quotes()}
</svg>`,
);

write(
  path.join(HERE, 'logo-mark-plain.svg'),
  `${head('0 0 64 64', 64, 64)}
  <!-- No tile: for laying the mark over a ground you already control. -->
  ${quotes()}
</svg>`,
);

write(
  path.join(HERE, 'logo-mark-light.svg'),
  `${head('0 0 64 64', 64, 64)}
  <!-- Light backgrounds. Both gels hold on paper, so only the tile changes. -->
  <rect width="64" height="64" fill="${C.paper}"/>
  ${quotes()}
</svg>`,
);

write(
  path.join(HERE, 'logo-mark-mono.svg'),
  `${head('0 0 64 64', 64, 64)}
  <!-- One colour, transparent ground: a stamp, an embroidery file, a favicon
       mask. INLINE it for currentColor to work — an SVG loaded through <img>
       is isolated and renders black. -->
  <g fill="currentColor"><path d="${AMBER_D}"/><path d="${TURQ_D}"/></g>
</svg>`,
);

write(
  path.join(HERE, 'logo-mark-mono-paper.svg'),
  `${head('0 0 64 64', 64, 64)}
  <!-- The mono mark as a file you can <img>, for dark grounds. -->
  <g fill="${C.paper}"><path d="${AMBER_D}"/><path d="${TURQ_D}"/></g>
</svg>`,
);

/* ------------------------------------------------------------ the wordmark */

const wordmark = (fill) => {
  const pad = 6;
  const vw = WM_W + pad * 2;
  const vh = WM_H + pad * 2;
  return `${head(`0 0 ${vw.toFixed(2)} ${vh.toFixed(2)}`, Math.round(vw), Math.round(vh))}
  <!-- The wordmark alone, for when the mark is already on the page. Ultra,
       outlined. One colour: the old three-pass offset-print effect was the
       loudest thing on every screen it appeared on. -->
  <g transform="translate(${(pad - WM.x1).toFixed(2)} ${(pad - WM.top).toFixed(2)})" fill="${fill}">${w.yap}${w.stage}</g>
</svg>`;
};

console.log('wordmark');
write(path.join(HERE, 'logo-wordmark-only.svg'), wordmark(C.paper));
write(path.join(HERE, 'logo-wordmark-only-light.svg'), wordmark(C.ink));

/* -------------------------------------------------------------- the lockup */

const lockup = (wordFill, tile) => {
  const pad = 12;
  const capH = 44.59; // Ultra cap height in wordmark units
  const markInkH = capH * 1.22; // the quotes are far lighter than Ultra's
  const scale = markInkH / 36; // mark ink is y 14..50 in the 64 box
  const markW = 48 * scale;
  const gap = 30;
  const capTop = pad + (markInkH - capH) / 2;
  const baseline = capTop + capH;
  const wordX = pad + markW + gap - WM.x1;
  const vw = pad + markW + gap + WM_W + pad;
  const vh = pad + markInkH + pad;
  return `${head(`0 0 ${vw.toFixed(2)} ${vh.toFixed(2)}`, Math.round(vw), Math.round(vh))}
  <!-- THE LOCKUP: mark + wordmark, for a header, a README, a slide, a shirt.
       The mark stands a fifth taller than the cap height rather than matching
       it: Ultra is a black slab and the quotes are open shapes, so equal
       heights make the mark look like a typo next to the word. -->
  ${tile ? `<rect width="${vw.toFixed(2)}" height="${vh.toFixed(2)}" fill="${tile}"/>` : ''}
  <g transform="translate(${pad} ${pad}) scale(${scale.toFixed(5)}) translate(-8 -14)">${quotes()}</g>
  <g transform="translate(${wordX.toFixed(2)} ${baseline.toFixed(2)})" fill="${wordFill}">${w.yap}${w.stage}</g>
</svg>`;
};

console.log('lockup');
write(path.join(HERE, 'logo-lockup.svg'), lockup(C.paper, C.house));
write(path.join(HERE, 'logo-lockup-light.svg'), lockup(C.ink, C.paper));
write(path.join(HERE, 'logo-lockup-plain.svg'), lockup(C.paper, null));

/* ----------------------------------------------------------- what we ship */

console.log('shipped');
fs.copyFileSync(path.join(HERE, 'logo-mark.svg'), path.join(PUB, 'favicon.svg'));
console.log('  client/public/favicon.svg');

// Safari pinned tabs render a single-colour silhouette from this file.
write(
  path.join(PUB, 'mask-icon.svg'),
  `${head('0 0 64 64', 64, 64)}
  <!-- Safari pinned tab: one flat silhouette, Safari picks the colour. -->
  <g fill="#000"><path d="${AMBER_D}"/><path d="${TURQ_D}"/></g>
</svg>`,
);

if (process.argv.includes('--png')) {
  const { spawn } = require('child_process');
  const chrome =
    process.env.CHROME ||
    'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const http = require('http');
  const MIME = { '.html': 'text/html', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const server = http.createServer((req, res) => {
    // Query strings are how the artboard is chosen; strip before touching disk.
    const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || '_render.html';
    const file = path.join(HERE, rel);
    if (!file.startsWith(HERE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      return res.end('no');
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
  const PORT = 3037;
  server.listen(PORT, async () => {
    const social = path.join(HERE, 'social');
    if (!fs.existsSync(social)) fs.mkdirSync(social);
    // ASYNC on purpose. execFileSync blocks the event loop, which means the
    // http server two lines up can never answer the request Chrome is making,
    // so Chrome waits forever and the whole thing deadlocks. Cost a while to
    // find; do not "simplify" this back to a sync spawn.
    const shot = (art, w, h, out) =>
      new Promise((resolve, reject) => {
        // Chrome on Windows refuses to make a window narrower than ~500px: ask
        // for 180 and you get a 180px crop of a 500px page, which is how the
        // first apple-touch-icon came out as a white rectangle. So render big
        // and scale down — window * device-scale-factor is the output size,
        // and an integer k keeps that exact.
        const k = Math.max(1, Math.ceil(640 / w));
        const [ww, wh, dsf] = [w * k, h * k, 1 / k];
        const p = spawn(
          chrome,
          [
            '--headless',
            '--disable-gpu',
            '--no-first-run',
            '--no-default-browser-check',
            `--force-device-scale-factor=${dsf}`,
            // A dedicated profile dir: otherwise headless waits on the
            // singleton lock held by the desktop Chrome that is almost
            // certainly already open on this machine.
            `--user-data-dir=${path.join(require('os').tmpdir(), 'yapstage-shot')}`,
            '--hide-scrollbars',
            `--screenshot=${out}`,
            `--window-size=${ww},${wh}`,
            '--virtual-time-budget=4000',
            `http://127.0.0.1:${PORT}/_render.html?a=${art}`,
          ],
          { stdio: 'ignore' },
        );
        const kill = setTimeout(() => p.kill(), 60000);
        p.on('error', reject);
        p.on('exit', () => {
          clearTimeout(kill);
          console.log('  ' + path.relative(path.join(HERE, '..'), out).replace(/\\/g, '/'));
          resolve();
        });
      });
    console.log('png');
    await shot('icon', 180, 180, path.join(PUB, 'apple-touch-icon.png'));
    await shot('icon', 512, 512, path.join(PUB, 'icon-512.png'));
    await shot('maskable', 512, 512, path.join(PUB, 'icon-maskable.png'));
    await shot('og', 1200, 630, path.join(PUB, 'og.png'));
    await shot('lockup', 1026, 264, path.join(HERE, 'logo-lockup.png'));
    // For socials: the avatar every platform crops to a circle, and a header.
    await shot('pfp', 1024, 1024, path.join(social, 'pfp-1024.png'));
    await shot('pfp', 512, 512, path.join(social, 'pfp-512.png'));
    await shot('pfp', 400, 400, path.join(social, 'pfp-400.png'));
    await shot('pfp-light', 1024, 1024, path.join(social, 'pfp-light-1024.png'));
    await shot('banner', 1500, 500, path.join(social, 'header-1500x500.png'));
    server.close();
  });
}
