// Security hardening rules, kept as small pure functions so the smoke suite
// can check each one without a browser, a database or a signed-in cookie
// (scripts/security-unit.mjs).
import crypto from 'node:crypto';
import { allow, exhausted } from './ratelimit.js';
import type { SignalPayload } from './protocol.js';

/** The one public origin. Share cards and anything else that prints an
    absolute link use this, never the request's Host header. */
export const SITE_ORIGIN = 'https://www.yapstage.com';

/** Fastify's trustProxy: trust exactly the nearest proxy (Railway's edge),
    so req.ip is the address that edge saw and req.protocol its
    X-Forwarded-Proto. Anything further left in X-Forwarded-For was written
    by the client and is ignored. (fastify 5.12 rejects the number 1.) */
export const trustOneHop = (_address: string, hop: number): boolean => hop < 1;

/* ---------------------------------------------------------------- headers */

/** Built from what the client actually loads (client/index.html, the Vite
    build, sw.js):
    - scripts: only the bundle, same origin. No inline script anywhere.
    - styles: the bundle, Google Fonts' stylesheet, and inline style (the
      share card, the 404 page and a few React style attributes carry it).
    - fonts: Google's font files.
    - images and media: same origin plus data: and blob: (the silent unlock
      clip is a data: URI; spoken turns and verdicts play from blob: URLs).
    - connect: same origin, the socket's wss on the public hosts, and Google
      Fonts, because sw.js passes every fetch through and a worker's fetches
      are held to this policy too.
    WebRTC's ICE traffic is not governed by CSP. The Google sign-in is a top
    level navigation, which no directive here restricts. */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "connect-src 'self' wss://www.yapstage.com wss://yapstage.com https://fonts.googleapis.com https://fonts.gstatic.com",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': CSP,
  // No includeSubDomains: nothing here knows what else lives under the apex.
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=()',
};

/* -------------------------------------------------------------- stats key */

const STATS_KEY_TRIES = 10;
const STATS_KEY_WINDOW_MS = 15 * 60_000;

const digest = (s: string): Buffer => crypto.createHash('sha256').update(s).digest();

/** Whether a request may read a keyed route (/stats*, /admin/*). The key
    comes from the `x-stats-key` header only: a query string ends up in
    browser history, proxy logs and Referer headers. Compared as SHA-256
    digests with timingSafeEqual (equal lengths, constant time). Ten wrong
    guesses from one IP lock that IP out for fifteen minutes, right answers
    included. No STATS_KEY configured means no keyed route exists at all. */
export function statsKeyOk(header: unknown, ip: string): boolean {
  const want = process.env.STATS_KEY;
  if (!want) return false;
  const bucket = `statskey:${ip}`;
  if (exhausted(bucket, STATS_KEY_TRIES)) return false;
  const got = typeof header === 'string' ? header : Array.isArray(header) ? String(header[0] ?? '') : '';
  const ok = got.length > 0 && crypto.timingSafeEqual(digest(got), digest(want));
  if (!ok) allow(bucket, STATS_KEY_TRIES, STATS_KEY_WINDOW_MS);
  return ok;
}

/* --------------------------------------------------------- guest identity */

/** A device id a signed-out socket may play under: short, plain characters,
    and never the shape of an account's canonical id. Whether an account
    already OWNS the id is the store's question (store.ts playerIdOwned). */
export function guestIdShapeOk(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(id) && !/^acct_/i.test(id);
}

/* ------------------------------------------------------------ typed speech */

/** Whether typed speech chunks count in this lobby. Ranked is audio only
    wherever the server transcribes (it does in production): a text chunk
    there is somebody pasting an essay into the socket. Friend rooms and bot
    games keep the browser-recognition path they have always had. */
export function typedSpeechAllowed(ranked: boolean, sttOn: boolean): boolean {
  return !(ranked && sttOn);
}

/* ------------------------------------------------------------- user text */

// C0 controls except tab, LF and CR; DEL; the C1 block. U+0000 is the one
// that bites: Postgres refuses it in text and in jsonb, so a single NUL in a
// typed chunk used to lose the whole match row and any report on it.
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
// Half a surrogate pair. JSON.stringify writes it as a \uD8xx escape and
// jsonb refuses that too. A .slice() through an emoji is enough to make one.
const LONE_SURROGATE_RE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
// Line breaks and tabs, plus the bidi overrides and isolates that can make
// a line read backwards on somebody else's screen.
const LINE_BREAKS_RE = /[\t\n\r\u2028\u2029]+/g;
const BIDI_RE = /[\u202A-\u202E\u2066-\u2069]/g;

/** Text that is safe to store: control characters and broken surrogate
    halves removed, line breaks kept. Every write of user text or model text
    to the database goes through this (store.ts). */
export function stripControl(raw: unknown): string {
  return String(raw ?? '').replace(CONTROL_RE, '').replace(LONE_SURROGATE_RE, '');
}

/** One line of user text (a typed speech chunk, a coach question): stored
    safe, line breaks and bidi overrides folded to a space, trimmed, capped at
    `max`. The cap is applied before the surrogate pass, so a cut through an
    emoji never leaves half of it behind. */
export function cleanLine(raw: unknown, max: number): string {
  const s = String(raw ?? '')
    .replace(CONTROL_RE, '')
    .replace(LINE_BREAKS_RE, ' ')
    .replace(BIDI_RE, '')
    .trim()
    .slice(0, max);
  return s.replace(LONE_SURROGATE_RE, '').trim();
}

/** A paragraph of user text (a settle-it account): like cleanLine, but line
    breaks survive. */
export function cleanBlock(raw: unknown, max: number): string {
  const s = String(raw ?? '').replace(CONTROL_RE, '').replace(BIDI_RE, '').trim().slice(0, max);
  return s.replace(LONE_SURROGATE_RE, '').trim();
}

/* ------------------------------------------------------------- coach chat */

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export const COACH_HISTORY_MAX = 8;
const COACH_HISTORY_RAW_MAX = 16;
const COACH_CONTENT_MAX = 1200;

/** The re-opened match's coach history, checked. The client sends its whole
    log (question, answer, question, answer...); the model gets the last
    eight, which must start with the debater, alternate, and end on an answer
    (the new question is the next turn). Anything else is refused whole:
    a non-array, a wrong role, a non-string, an empty or over-long line, or a
    log longer than the per-match question cap could ever produce. */
export function coachHistory(raw: unknown): ChatTurn[] | null {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw) || raw.length > COACH_HISTORY_RAW_MAX) return null;
  const turns: ChatTurn[] = [];
  for (const m of raw) {
    if (!m || typeof m !== 'object') return null;
    const { role, content } = m as { role?: unknown; content?: unknown };
    if (role !== 'user' && role !== 'assistant') return null;
    if (typeof content !== 'string' || !content.trim() || content.length > COACH_CONTENT_MAX) return null;
    turns.push({ role, content });
  }
  const last = turns.slice(-COACH_HISTORY_MAX);
  if (last.length % 2 !== 0) return null;
  for (let i = 0; i < last.length; i++) {
    if (last[i].role !== (i % 2 === 0 ? 'user' : 'assistant')) return null;
  }
  return last;
}

/* -------------------------------------------------------------- ICE / SDP */

const isRelayLine = (line: string): boolean => /\styp\s+relay(\s|$)/.test(line);

/** A relay candidate still names the address it relays FOR in its
    `raddr <ip> rport <port>` pair: for a client not running relay-only
    that is its own public address (its srflx), which is the one thing
    relay-only exists to hide. Both are zeroed, the way browsers already
    write them for an obscured address; ICE never reads them. */
const hideRelated = (line: string): string =>
  line.replace(/(\s)raddr\s+\S+/i, '$1raddr 0.0.0.0').replace(/(\s)rport\s+\S+/i, '$1rport 0');

/** Ranked calls are relay only, so two strangers never learn each other's
    address. The client asks for relay candidates alone (webrtc.ts); this is
    the server's half, for a client that does not: host, srflx and prflx
    candidates are dropped, a relay candidate's related address is zeroed,
    and an SDP body loses its non-relay candidate lines, its relay lines'
    related addresses and the default address in its c= and a=rtcp lines. An
    empty candidate (end of candidates) passes. A trickled candidate is
    rebuilt from the four fields RTCIceCandidateInit has, so nothing else a
    client tacked on rides along. Returns null to drop the message. */
export function relayOnlySignal(payload: SignalPayload): SignalPayload | null {
  if ('candidate' in payload) {
    const c = payload.candidate;
    const line = typeof c?.candidate === 'string' ? c.candidate : '';
    if (line === '') return payload;
    if (!isRelayLine(line)) return null;
    return {
      candidate: {
        candidate: hideRelated(line),
        ...(c.sdpMid !== undefined ? { sdpMid: c.sdpMid } : {}),
        ...(c.sdpMLineIndex !== undefined ? { sdpMLineIndex: c.sdpMLineIndex } : {}),
        ...(c.usernameFragment !== undefined ? { usernameFragment: c.usernameFragment } : {}),
      },
    };
  }
  if ('description' in payload) {
    const d = payload.description;
    if (!d || typeof d.sdp !== 'string') return payload;
    const eol = d.sdp.includes('\r\n') ? '\r\n' : '\n';
    const sdp = d.sdp
      .split(/\r?\n/)
      .filter((l) => !l.startsWith('a=candidate:') || isRelayLine(l))
      .map((l) => {
        if (l.startsWith('a=candidate:')) return hideRelated(l);
        if (l.startsWith('c=IN IP4 ')) return 'c=IN IP4 0.0.0.0';
        if (l.startsWith('c=IN IP6 ')) return 'c=IN IP6 ::';
        if (l.startsWith('a=rtcp:')) return l.replace(/\sIN\s+IP4\s+\S+/, ' IN IP4 0.0.0.0').replace(/\sIN\s+IP6\s+\S+/, ' IN IP6 ::');
        return l;
      })
      .join(eol);
    return { description: { type: d.type, sdp } };
  }
  return null;
}

/* ------------------------------------------------------------------ 404s */

/** Whether a request nobody has a route for gets the HTML 404 page rather
    than the JSON one: a browser asking for a page. HEAD is answered like GET
    (same status and headers, no body), which is what link checkers and
    crawlers expect. */
export function wantsHtml404(method: string, accept: unknown): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false;
  return String(accept ?? '').includes('text/html');
}
