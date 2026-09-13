// Shareable verdict cards. The card is a row in the database and the link is an
// opaque id, which is how this normally works: nothing about the result is
// carried in, or recoverable from, the URL.
//
// An earlier version encoded the whole card into the link so it needed no
// database, and signed it so it could not be forged. Once real storage landed
// that became two code paths and a secret to manage, for a feature that a
// lookup does better. Ids are unguessable and only the server writes rows, so
// forgery is structurally impossible rather than cryptographically discouraged.
import type { Side, Verdict } from './protocol.js';

/** Compact on purpose: every character here lands in the URL. */
export interface Card {
  m: string; // motion
  a: string; // FOR name
  b: string; // AGAINST name
  s: number[]; // [FOR arg,evi,cla,del, AGAINST arg,evi,cla,del]
  w: 0 | 1; // winner: 0 = FOR, 1 = AGAINST
  r: string; // the one-line ruling
  qa?: string; // best quote, FOR
  qb?: string; // best quote, AGAINST
  /** Settle-it only: the split, the decree, the orders, and what each said. */
  rl?: { pf: number; pa: number; d: string; o: string[]; sa: string; sb: string };
}

const CAP = { m: 140, name: 24, r: 260, q: 180 };
const clip = (s: unknown, n: number) => String(s ?? '').slice(0, n);

/** The card one debater shares. `sharer` is their side: the card carries
    THEIR best line (and, in settle-it, their own account of the argument)
    and never the opponent's words. The opponent did not choose to publish
    anything, so their side of the card is the name and the numbers. */
export function cardFrom(
  motion: string,
  names: Record<Side, string>,
  verdict: Verdict,
  said: Record<Side, string> | undefined,
  sharer: Side,
): Card {
  const f = verdict.scores.FOR;
  const g = verdict.scores.AGAINST;
  const mine = (side: Side, text: string | undefined, n: number) =>
    side === sharer ? clip(text ?? '', n) || undefined : undefined;
  return {
    m: clip(motion, CAP.m),
    a: clip(names.FOR, CAP.name),
    b: clip(names.AGAINST, CAP.name),
    s: [f.argument, f.evidence, f.clash, f.delivery, g.argument, g.evidence, g.clash, g.delivery],
    w: verdict.winner === 'AGAINST' ? 1 : 0,
    r: clip(verdict.summary, CAP.r),
    qa: mine('FOR', verdict.bestQuote?.FOR, CAP.q),
    qb: mine('AGAINST', verdict.bestQuote?.AGAINST, CAP.q),
    rl: verdict.ruling
      ? {
          pf: verdict.ruling.split.FOR,
          pa: verdict.ruling.split.AGAINST,
          d: clip(verdict.ruling.decree, 260),
          o: verdict.ruling.orders.map((o) => clip(o, 160)).slice(0, 3),
          sa: mine('FOR', said?.FOR, 300) ?? '',
          sb: mine('AGAINST', said?.AGAINST, 300) ?? '',
        }
      : undefined,
  };
}

/** Rows are written by us, but they are still read back into HTML, so a stored
    card gets the same clamping a foreign one would. */
export function sanitizeCard(raw: unknown): Card | null {
  const c = raw as Card | null;
  if (!c || typeof c !== 'object') return null;
  if (!Array.isArray(c.s) || c.s.length !== 8) return null;
  const MAXES = [30, 20, 30, 20, 30, 20, 30, 20];
  return {
    m: clip(c.m, CAP.m),
    a: clip(c.a, CAP.name) || 'FOR',
    b: clip(c.b, CAP.name) || 'AGAINST',
    s: c.s.map((v, i) => Math.max(0, Math.min(MAXES[i], Math.round(Number(v) || 0)))),
    w: c.w === 1 ? 1 : 0,
    r: clip(c.r, CAP.r),
    qa: c.qa ? clip(c.qa, CAP.q) : undefined,
    qb: c.qb ? clip(c.qb, CAP.q) : undefined,
    rl: c.rl
      ? {
          pf: Math.max(0, Math.min(100, Math.round(Number(c.rl.pf) || 0))),
          pa: Math.max(0, Math.min(100, Math.round(Number(c.rl.pa) || 0))),
          d: clip(c.rl.d, 260),
          o: (Array.isArray(c.rl.o) ? c.rl.o : []).slice(0, 3).map((x) => clip(x, 160)),
          sa: clip(c.rl.sa, 300),
          sb: clip(c.rl.sb, 300),
        }
      : undefined,
  };
}

// Everything below is rendered into HTML from a URL a stranger controls, so
// every interpolation goes through this. No exceptions.
function esc(s: string): string {
  return s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const CATS = ['made your case', 'backed it up', 'fought back', 'used your time'];
const MAXES = [30, 20, 30, 20];

/** `origin` is the fixed public origin (security.ts SITE_ORIGIN), never the
    request's Host header; `id` is the card's own id, for og:url. */
export function renderCard(card: Card, origin: string, id = ''): string {
  const totalA = card.s.slice(0, 4).reduce((n, v) => n + v, 0);
  const totalB = card.s.slice(4).reduce((n, v) => n + v, 0);
  const winner = card.w === 1 ? card.b : card.a;
  const loser = card.w === 1 ? card.a : card.b;
  const wTotal = card.w === 1 ? totalB : totalA;
  const lTotal = card.w === 1 ? totalA : totalB;

  const rl = card.rl;
  const wPct = rl ? (card.w === 1 ? rl.pa : rl.pf) : 0;
  const lPct = rl ? (card.w === 1 ? rl.pf : rl.pa) : 0;
  // A settled argument unfurls as a ruling, not a scoreboard: the percentage
  // and the decree are the shareable part, not four category bars.
  const title = rl
    ? `${winner} was ${wPct}% right. settled on YapStage.`
    : `${winner} beat ${loser} ${wTotal}-${lTotal} on YapStage`;
  const desc = (rl ? rl.d : card.r) || `"${card.m}", settled on camera.`;

  const rows = CATS.map((label, i) => {
    const av = card.s[i];
    const bv = card.s[i + 4];
    const max = MAXES[i];
    return `<tr>
      <td class="n ${av >= bv ? 'lead' : ''}">${av}</td>
      <td class="bar"><span style="width:${(av / max) * 100}%" class="ba"></span></td>
      <td class="cat">${esc(label)}<em>/${max}</em></td>
      <td class="bar"><span style="width:${(bv / max) * 100}%" class="bb"></span></td>
      <td class="n ${bv >= av ? 'lead' : ''}">${bv}</td>
    </tr>`;
  }).join('');

  const quote = (who: string, q: string | undefined, side: 'f' | 'g') =>
    q ? `<blockquote class="${side}"><p>&ldquo;${esc(q)}&rdquo;</p><cite>${esc(who)}</cite></blockquote>` : '';
  const winName = `<span class="win">${esc(winner)}</span>`;
  const url = id ? `${origin}/v/${encodeURIComponent(id)}` : `${origin}/`;

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(title)}</title>
<meta name="robots" content="noindex"/>
<meta name="theme-color" content="#16172B"/>
<meta name="description" content="${esc(desc)}"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="YapStage"/>
<meta property="og:url" content="${esc(url)}"/>
<meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(desc)}"/>
<meta property="og:image" content="${esc(origin)}/og.png"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${esc(title)}"/>
<meta name="twitter:description" content="${esc(desc)}"/>
<meta name="twitter:image" content="${esc(origin)}/og.png"/>
<link rel="icon" href="/favicon.svg"/>
<style>
 /* The house palette: house #16172B, paper #EFE8D8, amber for FOR,
    turquoise for AGAINST, and gold for the winner and nothing else.
    --muted is 8:1 on the house colour, so the small print stays readable. */
 :root{--ink:#EFE8D8;--muted:#B7B0A0;--gold:#FFC72E;--for:#F0821E;--against:#1FC2D4;--bg:#16172B}
 *{box-sizing:border-box}
 body{margin:0;padding:28px 16px 48px;background:var(--bg);color:var(--ink);
      font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
 .wrap{max-width:640px;margin:0 auto}
 .kick{text-align:center;font-size:11px;letter-spacing:.22em;color:var(--muted)}
 h1{text-align:center;font-size:26px;line-height:1.25;margin:10px 0 4px}
 .win{color:var(--gold)}
 .motion{text-align:center;color:var(--muted);font-size:14px;margin:0 0 22px}
 .rule{text-align:center;font-size:16px;line-height:1.45;margin:0 0 24px}
 table{width:100%;border-collapse:collapse;margin:0 0 22px}
 td{padding:6px 4px;vertical-align:middle}
 .n{width:34px;text-align:center;font-variant-numeric:tabular-nums;color:var(--muted);font-size:14px}
 .n.lead{color:var(--ink);font-weight:600}
 .cat{width:132px;text-align:center;font-size:10.5px;letter-spacing:.1em;
      text-transform:uppercase;color:var(--muted);white-space:nowrap}
 .cat em{display:block;font-style:normal;color:var(--muted);font-size:9.5px}
 .bar{background:rgba(239,232,216,.09);height:9px;border-radius:5px;overflow:hidden;padding:0}
 .bar span{display:block;height:100%}
 .ba{background:var(--for);margin-left:auto}
 .bb{background:var(--against)}
 .names{display:flex;justify-content:space-between;font-size:15px;margin:0 0 10px}
 .names .f{color:var(--for)}.names .g{color:var(--against)}
 blockquote{margin:0 0 14px;padding:10px 14px;border-left:2px solid var(--muted);
            background:rgba(239,232,216,.05);border-radius:0 8px 8px 0}
 blockquote.f{border-left-color:var(--for)}
 blockquote.g{border-left-color:var(--against)}
 blockquote p{margin:0;font-size:14px;line-height:1.45}
 cite{display:block;margin-top:5px;font-style:normal;font-size:11px;color:var(--muted)}
 .cta{display:block;text-align:center;margin:28px auto 0;max-width:280px;padding:13px 18px;
      border:2px solid var(--ink);border-radius:10px;color:var(--ink);text-decoration:none;
      font-size:15px;letter-spacing:.04em}
 .foot{text-align:center;color:var(--muted);font-size:11px;margin-top:18px;line-height:1.6}
 .orders{margin:18px 0 0;padding:12px 16px;border:1px solid rgba(239,232,216,.3);
         border-radius:10px;background:rgba(239,232,216,.05)}
 .order{margin:4px 0 0;font-size:14px;line-height:1.45}
</style>
</head><body><div class="wrap">
 <p class="kick">THE YAPMASTER RULED</p>
 <h1>${rl ? `${winName} ${wPct}% &middot; ${lPct}% ${esc(loser)}` : `${winName} ${wTotal} &middot; ${lTotal} ${esc(loser)}`}</h1>
 <p class="motion">&ldquo;${esc(card.m)}&rdquo;</p>
 ${rl ? `<p class="rule">${esc(rl.d)}</p>` : card.r ? `<p class="rule">${esc(card.r)}</p>` : ''}
 ${
   rl
     ? // What each of them said the fight was about. The most human part of the
       // card, and the reason neither account gets erased by the merged version.
       `<p class="kick" style="margin:22px 0 8px">WHAT EACH OF THEM SAID IT WAS ABOUT</p>
        ${quote(card.a, rl.sa, 'f')}${quote(card.b, rl.sb, 'g')}
        ${rl.o.length ? `<div class="orders"><p class="kick" style="margin:0 0 6px">THE ORDERS</p>${rl.o.map((o) => `<p class="order">${esc(o)}</p>`).join('')}</div>` : ''}`
     : `<div class="names"><span class="f">${esc(card.a)} &middot; FOR</span><span class="g">AGAINST &middot; ${esc(card.b)}</span></div>
        <table>${rows}</table>
        ${quote(card.a, card.qa, 'f')}${quote(card.b, card.qb, 'g')}`
 }
 <a class="cta" href="${esc(origin)}/">think you'd do better?</a>
 <p class="foot">one of the debaters chose to share this. the video was never recorded.</p>
</div></body></html>`;
}
