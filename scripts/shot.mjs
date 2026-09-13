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
 */
import { spawn } from 'node:child_process';
import { writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const i = a.indexOf('=');
    return [a.slice(0, i), a.slice(i + 1)];
  }),
);

const DIR = args.dir ?? new URL('../.shots/', import.meta.url).pathname.replace(/^\//, '');
mkdirSync(DIR, { recursive: true });
const OUT = `${DIR}/${args.out ?? 'shot'}.png`;
const W = Number(args.w ?? 1440);
const H = Number(args.h ?? 900);
const URL_ = args.url ?? 'http://localhost:3012/';
const PORT = Number(args.port ?? 9333);
const PROFILE = `${process.env.TEMP ?? '/tmp'}/ys-cdp-${PORT}`;

rmSync(PROFILE, { recursive: true, force: true });
const chrome = spawn(
  process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
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
    // the judge reading a verdict) and it must never play through the
    // owner's speakers (2026-09-12, he heard a verdict read over and over).
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
