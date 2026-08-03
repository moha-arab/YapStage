// Shareable verdict cards. The whole result is encoded INTO the link, so the
// server still stores nothing: no database, no eviction, no expiry, and the
// privacy promise ("transcripts die with the lobby") survives intact. The cost
// is a long URL, which nobody reads because it unfurls into a card.
//
// The payload is signed when SHARE_SECRET is set, so a link that renders on
// yapstage.com is one the judge actually produced. Without the secret the page
// still works, it just cannot tell a real verdict from a crafted one.
import { createHmac, timingSafeEqual } from 'node:crypto';
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
}

const CAP = { m: 140, name: 24, r: 260, q: 180 };
const clip = (s: unknown, n: number) => String(s ?? '').slice(0, n);

export function cardFrom(
  motion: string,
  names: Record<Side, string>,
  verdict: Verdict,
): Card {
  const f = verdict.scores.FOR;
  const g = verdict.scores.AGAINST;
  return {
    m: clip(motion, CAP.m),
    a: clip(names.FOR, CAP.name),
    b: clip(names.AGAINST, CAP.name),
    s: [f.argument, f.evidence, f.clash, f.delivery, g.argument, g.evidence, g.clash, g.delivery],
    w: verdict.winner === 'AGAINST' ? 1 : 0,
    r: clip(verdict.summary, CAP.r),
    qa: clip(verdict.bestQuote.FOR, CAP.q) || undefined,
    qb: clip(verdict.bestQuote.AGAINST, CAP.q) || undefined,
  };
}

function sign(body: string): string {
  const secret = process.env.SHARE_SECRET;
  if (!secret) return '';
  return createHmac('sha256', secret).update(body).digest('base64url').slice(0, 22);
}

/** `<base64url payload>.<sig>` — the sig half is absent when unsigned. */
export function encodeCard(card: Card): string {
  const body = Buffer.from(JSON.stringify(card), 'utf8').toString('base64url');
  const sig = sign(body);
  return sig ? `${body}.${sig}` : body;
}

export function decodeCard(token: string): Card | null {
  const [body, sig] = token.split('.');
  if (!body || body.length > 4000) return null;
  // Only enforce the signature when we have a secret AND the link carries one.
  // Unsigned links stay readable so turning the secret on later doesn't break
  // every link already sent.
  if (process.env.SHARE_SECRET && sig) {
    const want = Buffer.from(sign(body));
    const got = Buffer.from(sig);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  }
  try {
    const raw = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Card;
    if (!raw || typeof raw !== 'object') return null;
    if (!Array.isArray(raw.s) || raw.s.length !== 8) return null;
    const MAXES = [30, 20, 30, 20, 30, 20, 30, 20];
    const s = raw.s.map((v, i) => Math.max(0, Math.min(MAXES[i], Math.round(Number(v) || 0))));
    return {
      m: clip(raw.m, CAP.m),
      a: clip(raw.a, CAP.name) || 'FOR',
      b: clip(raw.b, CAP.name) || 'AGAINST',
      s,
      w: raw.w === 1 ? 1 : 0,
      r: clip(raw.r, CAP.r),
      qa: raw.qa ? clip(raw.qa, CAP.q) : undefined,
      qb: raw.qb ? clip(raw.qb, CAP.q) : undefined,
    };
  } catch {
    return null;
  }
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

export function renderCard(card: Card, origin: string, stored: boolean): string {
  const totalA = card.s.slice(0, 4).reduce((n, v) => n + v, 0);
  const totalB = card.s.slice(4).reduce((n, v) => n + v, 0);
  const winner = card.w === 1 ? card.b : card.a;
  const loser = card.w === 1 ? card.a : card.b;
  const wTotal = card.w === 1 ? totalB : totalA;
  const lTotal = card.w === 1 ? totalA : totalB;

  const title = `${winner} beat ${loser} ${wTotal}-${lTotal} on YapStage`;
  const desc = card.r || `"${card.m}" — settled on camera.`;

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

  const quote = (who: string, q?: string) =>
    q ? `<blockquote><p>&ldquo;${esc(q)}&rdquo;</p><cite>${esc(who)}</cite></blockquote>` : '';

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="YapStage"/>
<meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(desc)}"/>
<meta property="og:image" content="${esc(origin)}/og.png"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${esc(title)}"/>
<meta name="twitter:description" content="${esc(desc)}"/>
<meta name="twitter:image" content="${esc(origin)}/og.png"/>
<link rel="icon" href="/favicon.svg"/>
<style>
 :root{--ink:#f2e8d5;--muted:#9a8f7d;--gold:#d4af37;--for:#e2574c;--against:#3fa9f5;--bg:#151210}
 *{box-sizing:border-box}
 body{margin:0;padding:28px 16px 48px;background:var(--bg);color:var(--ink);
      font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
 .wrap{max-width:640px;margin:0 auto}
 .kick{text-align:center;font-size:11px;letter-spacing:.22em;color:var(--gold);opacity:.8}
 h1{text-align:center;font-size:26px;line-height:1.25;margin:10px 0 4px}
 .motion{text-align:center;color:var(--muted);font-size:14px;margin:0 0 22px}
 .rule{text-align:center;font-size:16px;line-height:1.45;margin:0 0 24px}
 table{width:100%;border-collapse:collapse;margin:0 0 22px}
 td{padding:6px 4px;vertical-align:middle}
 .n{width:34px;text-align:center;font-variant-numeric:tabular-nums;color:var(--muted);font-size:14px}
 .n.lead{color:var(--ink);font-weight:600}
 .cat{width:132px;text-align:center;font-size:10.5px;letter-spacing:.1em;
      text-transform:uppercase;color:var(--muted);white-space:nowrap}
 .cat em{display:block;font-style:normal;opacity:.6;font-size:9.5px}
 .bar{background:rgba(242,232,213,.09);height:9px;border-radius:5px;overflow:hidden;padding:0}
 .bar span{display:block;height:100%}
 .ba{background:var(--for);margin-left:auto}
 .bb{background:var(--against)}
 .names{display:flex;justify-content:space-between;font-size:15px;margin:0 0 10px}
 .names .f{color:var(--for)}.names .g{color:var(--against)}
 blockquote{margin:0 0 14px;padding:10px 14px;border-left:2px solid rgba(212,175,55,.5);
            background:rgba(212,175,55,.05);border-radius:0 8px 8px 0}
 blockquote p{margin:0;font-size:14px;line-height:1.45}
 cite{display:block;margin-top:5px;font-style:normal;font-size:11px;color:var(--muted)}
 .cta{display:block;text-align:center;margin:28px auto 0;max-width:280px;padding:13px 18px;
      border:2px solid var(--gold);border-radius:10px;color:var(--gold);text-decoration:none;
      font-size:15px;letter-spacing:.04em}
 .foot{text-align:center;color:var(--muted);font-size:11px;margin-top:18px;line-height:1.6}
</style>
</head><body><div class="wrap">
 <p class="kick">THE YAPMASTER RULED</p>
 <h1>${esc(winner)} ${wTotal} &middot; ${lTotal} ${esc(loser)}</h1>
 <p class="motion">&ldquo;${esc(card.m)}&rdquo;</p>
 ${card.r ? `<p class="rule">${esc(card.r)}</p>` : ''}
 <div class="names"><span class="f">${esc(card.a)} &middot; FOR</span><span class="g">AGAINST &middot; ${esc(card.b)}</span></div>
 <table>${rows}</table>
 ${quote(card.a, card.qa)}
 ${quote(card.b, card.qb)}
 <a class="cta" href="${esc(origin)}/">think you'd do better?</a>
 <p class="foot">${
   stored
     ? 'one of the debaters chose to share this. the video was never recorded.'
     : 'this whole result lives inside the link. we stored nothing.'
 }</p>
</div></body></html>`;
}
