/* Screenshot a running YapStage at an EXACT viewport, driving the page first
 * if you need a state that is three taps in.
 *
 *   node scripts/shot.mjs out=lobby w=1440 h=900
 *   node scripts/shot.mjs out=phone w=390 h=780 mobile=1
 *   node scripts/shot.mjs out=botpick w=1440 h=900 \
 *        step1=click=.lb-act:nth-child(3) \
 *        'step2=type=#yapname|pizzamaster' \
 *        step3=click=.lb-choice:nth-child(4)
 *
 * Why the DevTools protocol and not `chrome --headless --screenshot`: Chrome on
 * Windows refuses to make a window narrower than about 500px, so every "phone"
 * shot taken that way is really a 500px-wide desktop layout, either cropped or
 * scaled. Emulation.setDeviceMetricsOverride takes any size, which is the
 * difference between seeing the mobile bugs and not.
 *
 * Steps, applied in order with a beat between each:
 *   click=<css>            click it
 *   type=<css>|<text>      set a controlled React input (uses the native value
 *                          setter, so React's onChange actually fires)
 *   sleep=<ms>             just wait
 *
 * Other args: url= (default http://localhost:3012/), wait= (ms before the
 * shot), clickWait=, port= (debugger port, vary it to run several at once),
 * dir= (output directory, default the repo's .shots/), reduced=1 (the page
 * sees prefers-reduced-motion, for anything that animates).
 *
 * Environment: CHROME points at the Chrome/Chromium binary. Without it the
 * usual install paths for the current platform are probed, so set CHROME for
 * anything non-standard (a portable build, a CI image, a channel other than
 * stable).
 */
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const i = a.indexOf('=');
    return [a.slice(0, i), a.slice(i + 1)];
  }),
);

// Resolved from this file, so the shots land in the repo's .shots/ whatever
// the working directory is. fileURLToPath rather than URL.pathname: that
// pathname is a URL path, so it keeps a leading slash before the drive letter
// on Windows and percent-escapes any space in the checkout path.
const DIR = args.dir ?? path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.shots');
mkdirSync(DIR, { recursive: true });
const OUT = `${DIR}/${args.out ?? 'shot'}.png`;
const W = Number(args.w ?? 1440);
const H = Number(args.h ?? 900);
const URL_ = args.url ?? 'http://localhost:3012/';
const PORT = Number(args.port ?? 9333);
// A throwaway profile per debugger port, so parallel runs never share one and
// headless never waits on the singleton lock held by a desktop Chrome.
// os.tmpdir() reads TMPDIR/TEMP per platform instead of assuming either.
const PROFILE = path.join(tmpdir(), `ys-cdp-${PORT}`);

// CHROME wins; otherwise probe the standard install locations for this
// platform. An explicit list beats asking the shell: `which chrome` finds
// nothing on Windows, and the first hit on PATH inside WSL is the Linux
// stub rather than a browser that can open a window.
const chromeCandidates = () => {
  const { PROGRAMFILES, LOCALAPPDATA } = process.env;
  if (process.platform === 'win32') {
    return [
      PROGRAMFILES && `${PROGRAMFILES}/Google/Chrome/Application/chrome.exe`,
      'C:/Program Files/Google/Chrome/Application/chrome.exe',
      'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
      LOCALAPPDATA && `${LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
    ].filter(Boolean);
  }
  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
  }
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ];
};
const chromeBin =
  process.env.CHROME ||
  chromeCandidates().find((p) => existsSync(p)) ||
  (() => {
    throw new Error(
      'no Chrome binary found; set CHROME to the Chrome or Chromium executable',
    );
  })();

rmSync(PROFILE, { recursive: true, force: true });
const chrome = spawn(
  chromeBin,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    // A debate screen needs a camera. These hand it a synthetic one so no
    // permission prompt appears and the tiles have something to show.
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
    // Silent, always: a screenshot run loads screens that speak (the bots,
    // the judge reading a verdict), and a batch of shots otherwise replays
    // the same verdict out loud over and over.
    '--mute-audio',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
);

let id = 0;
const pending = new Map();
const send = (ws, method, params = {}) =>
  new Promise((res, rej) => {
    const m = ++id;
    pending.set(m, { res, rej });
    ws.send(JSON.stringify({ id: m, method, params }));
  });

try {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(300);
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      target = (await r.json()).find((t) => t.type === 'page');
    } catch {
      /* debugger not up yet */
    }
  }
  if (!target) throw new Error('chrome never opened a page target');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result);
    }
  };

  await send(ws, 'Page.enable');
  await send(ws, 'Runtime.enable');
  await send(ws, 'Emulation.setDeviceMetricsOverride', {
    width: W,
    height: H,
    deviceScaleFactor: 1,
    mobile: args.mobile === '1',
  });
  if (args.reduced === '1') {
    await send(ws, 'Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
  }
  await send(ws, 'Page.navigate', { url: URL_ });
  await sleep(Number(args.wait ?? 1500));

  // stepN in numeric order, as many as were given (a settings panel three
  // taps past a roster needs more than six).
  const stepKeys = Object.keys(args)
    .filter((k) => /^step\d+$/.test(k))
    .sort((x, y) => Number(x.slice(4)) - Number(y.slice(4)));
  for (const key of stepKeys) {
    const raw = args[key];
    if (!raw) continue;
    const eq = raw.indexOf('=');
    const [verb, rest] = eq > 0 ? [raw.slice(0, eq), raw.slice(eq + 1)] : ['click', raw];
    if (verb === 'sleep') {
      await sleep(Number(rest));
      continue;
    }
    let expr;
    if (verb === 'type') {
      const bar = rest.indexOf('|');
      const sel = rest.slice(0, bar);
      const text = rest.slice(bar + 1);
      expr = `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'MISS';
        const set=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
        set.call(e, ${JSON.stringify(text)});
        e.dispatchEvent(new Event('input',{bubbles:true}));return 'ok';})()`;
    } else {
      expr = `(()=>{const e=document.querySelector(${JSON.stringify(rest)});if(!e)return 'MISS';e.click();return 'ok';})()`;
    }
    const r = await send(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.result.value === 'MISS') console.error(`  ${key}: no element matched ${rest}`);
    await sleep(Number(args.clickWait ?? 700));
  }

  const shot = await send(ws, 'Page.captureScreenshot', { format: 'png' });
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'));

  // Anything wider than the viewport is a layout bug, so say so rather than
  // leaving it to be spotted in the image.
  const over = await send(ws, 'Runtime.evaluate', {
    expression: 'document.documentElement.scrollWidth',
    returnByValue: true,
  });
  const scrollW = over.result.value;
  console.log(
    `  ${OUT} ${W}x${H}${scrollW > W ? `  !! scrollWidth ${scrollW} (overflows by ${scrollW - W}px)` : ''}`,
  );
  ws.close();
} finally {
  chrome.kill();
}
