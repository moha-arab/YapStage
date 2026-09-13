// Google sign-in, hand-rolled on the authorization-code flow. No auth library:
// the whole thing is two redirects and one POST, and a dependency here would be
// a dependency in the path of every login.
//
// The identity we care about is Google's `sub` — stable forever, unlike email.
// We never see or store a password, and we ask for the two non-sensitive scopes
// (email, profile) precisely so the app never needs Google's verification review.
import crypto from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { event } from './stats.js';
import { AVATAR_IDS, foldName, nameProblem } from './protocol.js';
import {
  claimUsername,
  deleteAccountData,
  getLocker,
  linkAccount,
  renameUsername,
  setLocker,
  type AccountRow,
  type CarriedDrill,
} from './store.js';
import { today } from './drills.js';
import { allow } from './ratelimit.js';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const SESSION_COOKIE = 'yap_session';
const STATE_COOKIE = 'yap_oauth_state';
const SESSION_DAYS = 30;
/** A yap name can change once in this many days. Slow on purpose: the name is
    the identity on every scoreboard, so it should not become a disguise. */
const NAME_CHANGE_DAYS = 30;
const NAME_CHANGE_MS = NAME_CHANGE_DAYS * 24 * 60 * 60 * 1000;

/** When the name may next change (ISO), or null if it may change now. */
function nextNameChange(changedAt: Date | null | undefined): string | null {
  if (!changedAt) return null;
  const at = changedAt.getTime() + NAME_CHANGE_MS;
  return at > Date.now() ? new Date(at).toISOString() : null;
}

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** Key for signing session cookies. Prefers an explicit SESSION_SECRET; falls
    back to a value DERIVED from the Google secret so sign-in works without a
    third env var. Derivation is domain-separated, and the fallback is stable
    across deploys — a random per-boot key would log everyone out on every
    push. Set SESSION_SECRET when you want to rotate sessions independently. */
function sessionKey(): Buffer {
  const base = process.env.SESSION_SECRET || process.env.GOOGLE_CLIENT_SECRET || '';
  // v2 on 2026-08-22: bumping this string invalidates every cookie ever
  // issued — the "sign out everybody" for the pre-launch fresh start. The mac
  // simply stops verifying; nobody's cookie needs touching.
  return crypto.createHash('sha256').update(`yapstage-session-v2:${base}`).digest();
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64url');
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', sessionKey()).update(payload).digest('base64url');
}

export interface Session {
  sub: string; // Google's stable user id
  playerId: string; // the canonical player row this account owns
  name: string; // the claimed yap name (empty until claimed)
  exp: number; // epoch ms
}

function packSession(s: Session): string {
  const body = b64url(JSON.stringify(s));
  return `${body}.${sign(body)}`;
}

/** Verify and unpack. Any tampering, or an expired session, reads as signed out. */
export function readSession(req: FastifyRequest): Session | null {
  return readSessionCookie(req.headers.cookie);
}

/** Same check, from a raw Cookie header — this is what lets a SOCKET know who
    it belongs to, so a signed-in player cannot emit somebody else's name. */
export function readSessionCookie(header: string | undefined): Session | null {
  const raw = pickCookie(header, SESSION_COOKIE);
  if (!raw) return null;
  const dot = raw.lastIndexOf('.');
  if (dot < 1) return null;
  const body = raw.slice(0, dot);
  const mac = raw.slice(dot + 1);
  const expected = sign(body);
  // timingSafeEqual throws on length mismatch, which is itself a rejection.
  if (mac.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString()) as Session;
    if (!s?.sub || !s?.playerId || typeof s.exp !== 'number' || s.exp < Date.now()) return null;
    return s;
  } catch {
    return null;
  }
}

// Fastify doesn't parse cookies without a plugin, and one header split is
// cheaper than another dependency in the login path.
function readCookie(req: FastifyRequest, name: string): string | null {
  return pickCookie(req.headers.cookie, name);
}

function pickCookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

function setCookie(reply: FastifyReply, name: string, value: string, maxAgeSec: number): void {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly', // JS can never read the session, so XSS can't steal it
    'SameSite=Lax', // survives the Google redirect back; blocks cross-site POSTs
    `Max-Age=${maxAgeSec}`,
  ];
  if (process.env.NODE_ENV !== 'development') parts.push('Secure');
  const existing = reply.getHeader('set-cookie');
  const list = Array.isArray(existing) ? existing : existing ? [String(existing)] : [];
  reply.header('set-cookie', [...list, parts.join('; ')]);
}

function clearCookie(reply: FastifyReply, name: string): void {
  setCookie(reply, name, '', 0);
}

/** The guest's drill streak as the client sends it, `last|streak|best`
    (client/src/guest.ts). Anything malformed or outlandish reads as nothing
    carried. It is the one client-supplied number the server writes down
    unverified, accepted because a streak ranks nobody and is written once. */
function parseCarriedDrill(raw: string | undefined): CarriedDrill | null {
  const m = /^(\d{4}-\d{2}-\d{2})\|(\d{1,3})\|(\d{1,3})$/.exec(raw ?? '');
  if (!m) return null;
  const streak = Number(m[2]);
  const best = Number(m[3]);
  if (streak < 1 || streak > 400 || best > 100) return null;
  return { last: m[1], streak, best };
}

function redirectUri(req: FastifyRequest): string {
  // req.protocol honours x-forwarded-proto behind Railway's edge (trustProxy)
  // and stays http on localhost, which Google allows only for localhost.
  return `${req.protocol}://${req.headers.host}/auth/google/callback`;
}

export interface AuthHooks {
  /** An account was just deleted: close every socket it has open. Lives in
      index.ts, which owns the socket server. */
  onAccountDeleted?: (sub: string) => void;
}

export function registerAuth(app: FastifyInstance, hooks: AuthHooks = {}): void {
  // Start sign-in. `state` is a random value echoed back by Google and matched
  // against a cookie: without it, an attacker could complete a login FOR you.
  app.get('/auth/google', async (req, reply) => {
    if (!googleConfigured()) return reply.code(503).send({ error: 'google_not_configured' });
    const state = crypto.randomBytes(16).toString('base64url');
    // The device's current playerId rides along so a first sign-in can adopt
    // the progress already earned on this device, and so does the drill
    // streak the device kept for a guest. Both wait out the Google round trip
    // in the state cookie (neither can contain a colon).
    const q = req.query as { claim?: string; drill?: string };
    const claim = String(q?.claim ?? '').slice(0, 64);
    const drill = String(q?.drill ?? '').slice(0, 24);
    setCookie(reply, STATE_COOKIE, `${state}:${claim}:${drill}`, 600);
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      redirect_uri: redirectUri(req),
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
    });
    return reply.redirect(`${AUTH_URL}?${params.toString()}`);
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/auth/google/callback',
    async (req, reply) => {
      if (!googleConfigured()) return reply.code(503).send({ error: 'google_not_configured' });
      const cookie = readCookie(req, STATE_COOKIE) ?? '';
      const [wantState, claim, drill] = cookie.split(':');
      clearCookie(reply, STATE_COOKIE);
      if (req.query.error || !req.query.code) return reply.redirect('/?auth=cancelled');
      if (!wantState || req.query.state !== wantState) {
        event('auth_state_mismatch');
        return reply.redirect('/?auth=failed');
      }

      try {
        const res = await fetch(TOKEN_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code: req.query.code,
            client_id: process.env.GOOGLE_CLIENT_ID!,
            client_secret: process.env.GOOGLE_CLIENT_SECRET!,
            redirect_uri: redirectUri(req),
            grant_type: 'authorization_code',
          }),
        });
        if (!res.ok) throw new Error(`token exchange ${res.status}`);
        const tok = (await res.json()) as { id_token?: string };
        if (!tok.id_token) throw new Error('no id_token');

        // The ID token came straight from Google's token endpoint over TLS, so
        // per Google's own guidance the signature does not need re-verifying —
        // the channel is the proof. (A token received any OTHER way would.)
        const claims = JSON.parse(
          Buffer.from(tok.id_token.split('.')[1], 'base64url').toString(),
        ) as { sub?: string; email?: string; name?: string; picture?: string; aud?: string };
        if (!claims.sub) throw new Error('no sub');
        if (claims.aud !== process.env.GOOGLE_CLIENT_ID) throw new Error('aud mismatch');

        const account = await linkAccount({
          sub: claims.sub,
          email: claims.email ?? '',
          name: claims.name ?? '',
          picture: claims.picture ?? '',
          claimPlayerId: claim || null,
          day: today(),
          drill: parseCarriedDrill(drill),
        });
        if (!account) {
          // No database means no accounts. Say so rather than pretending.
          return reply.redirect('/?auth=nostore');
        }
        const session: Session = {
          sub: claims.sub,
          playerId: account.playerId,
          // Empty until they claim a yap name — that emptiness IS the gate.
          name: account.username ?? '',
          exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
        };
        setCookie(reply, SESSION_COOKIE, packSession(session), SESSION_DAYS * 24 * 60 * 60);
        event('auth_signed_in');
        return reply.redirect('/?auth=ok');
      } catch (err) {
        console.error('[auth] callback failed:', err);
        event('auth_failed', { err: String(err).slice(0, 120) });
        return reply.redirect('/?auth=failed');
      }
    },
  );

  /** Who am I? The client calls this on boot and adopts the returned playerId,
      which is how progress follows an account across devices. `needsName` is
      the one-time yap-name claim: a fresh account can't play until it lands. */
  app.get('/auth/me', async (req, reply) => {
    const s = readSession(req);
    if (!s) return { signedIn: false, google: googleConfigured() };
    const locker = await getLocker(s.sub);
    // The account was deleted (from another device, say): this cookie is a
    // leftover that still verifies. Clear it and answer as signed out.
    if (locker.missing) {
      clearCookie(reply, SESSION_COOKIE);
      return { signedIn: false, google: googleConfigured() };
    }
    // The cookie carries the name it was signed with, and a rename on another
    // device leaves it stale. The row is the truth: answer with it, and
    // re-sign this device's cookie so its next socket carries it too.
    let name = s.name;
    if (locker.username && locker.username !== s.name) {
      name = locker.username;
      setCookie(reply, SESSION_COOKIE, packSession({ ...s, name }), SESSION_DAYS * 24 * 60 * 60);
    }
    return {
      signedIn: true,
      google: true,
      playerId: s.playerId,
      name,
      needsName: !name,
      mask: locker.mask,
      maskDefault: locker.maskDefault,
      nextNameChange: nextNameChange(locker.nameChangedAt),
    };
  });

  /** Claim the yap name, once. Re-issues the session so every later socket
      connection carries the real name. */
  app.post<{ Body: { name?: string } }>('/auth/username', async (req, reply) => {
    const s = readSession(req);
    if (!s) return reply.code(401).send({ ok: false, error: 'signed_out' });
    if (s.name) return reply.code(409).send({ ok: false, error: 'already' });
    const name = String(req.body?.name ?? '').trim();
    const problem = nameProblem(name);
    if (problem) return reply.code(400).send({ ok: false, error: problem });
    const result = await claimUsername(s.sub, name);
    if (result === 'taken') return reply.code(409).send({ ok: false, error: 'taken' });
    if (result !== 'ok') return reply.code(409).send({ ok: false, error: 'already' });
    const session: Session = { ...s, name };
    setCookie(reply, SESSION_COOKIE, packSession(session), SESSION_DAYS * 24 * 60 * 60);
    return { ok: true, name };
  });

  /** Change the claimed yap name, once per NAME_CHANGE_DAYS. Same validator
      and the same unique index as the claim above; the claim stays one-shot
      and this is the only way to change a name after it. Re-issues the
      session so the next socket connection carries the new name (the client
      reconnects its socket on success, as it does after claiming). */
  app.post<{ Body: { name?: string } }>('/auth/rename', async (req, reply) => {
    const s = readSession(req);
    if (!s) return reply.code(401).send({ ok: false, error: 'signed_out' });
    if (!allow(`rename:${s.sub}`, 10, 10 * 60_000) || !allow(`rename-ip:${req.ip}`, 30, 10 * 60_000)) {
      return reply.code(429).send({ ok: false, error: 'rate_limited' });
    }
    // Saved in the form the validator checks: nameProblem() tests the NFKC
    // form, so an un-normalized full-width name would pass and be stored wide.
    const name = String(req.body?.name ?? '').normalize('NFKC').trim();
    const problem = nameProblem(name);
    if (problem) return reply.code(400).send({ ok: false, error: problem });
    const result = await renameUsername(s.sub, name, NAME_CHANGE_MS);
    switch (result.status) {
      case 'ok': {
        const session: Session = { ...s, name };
        setCookie(reply, SESSION_COOKIE, packSession(session), SESSION_DAYS * 24 * 60 * 60);
        return { ok: true, name, nextNameChange: nextNameChange(result.changedAt) };
      }
      case 'too_soon':
        return reply
          .code(409)
          .send({ ok: false, error: 'too_soon', nextNameChange: nextNameChange(result.changedAt) });
      case 'taken':
        return reply.code(409).send({ ok: false, error: 'taken' });
      case 'same':
        return reply.code(400).send({ ok: false, error: 'same' });
      case 'unclaimed':
        // No name yet: that is the claim's job (/auth/username), not this one.
        return reply.code(409).send({ ok: false, error: 'unclaimed' });
      default:
        return reply.code(503).send({ ok: false, error: 'down' });
    }
  });

  /** Delete the account, for good. The person types their username to
      confirm; it is checked here against the account's fold, so case does not
      matter. Everything the account owns goes in one transaction (store.ts
      deleteAccountData lists it), the session cookie is cleared, and every
      socket the account has open is closed. */
  app.post<{ Body: { confirm?: string } }>('/auth/delete', async (req, reply) => {
    const s = readSession(req);
    if (!s) return reply.code(401).send({ ok: false, error: 'signed_out' });
    if (!allow(`delete:${s.sub}`, 5, 10 * 60_000) || !allow(`delete-ip:${req.ip}`, 20, 10 * 60_000)) {
      return reply.code(429).send({ ok: false, error: 'rate_limited' });
    }
    const confirm = String(req.body?.confirm ?? '').normalize('NFKC').trim();
    if (!confirm || confirm.length > 32) return reply.code(400).send({ ok: false, error: 'mismatch' });
    const result = await deleteAccountData(s.sub, foldName(confirm));
    if (result.status === 'ok' || result.status === 'missing') {
      // Either way there is no account behind this cookie any more.
      clearCookie(reply, SESSION_COOKIE);
      hooks.onAccountDeleted?.(s.sub);
    }
    switch (result.status) {
      case 'ok':
        return { ok: true };
      case 'missing':
        return reply.code(404).send({ ok: false, error: 'missing' });
      case 'mismatch':
        return reply.code(400).send({ ok: false, error: 'mismatch' });
      case 'unclaimed':
        return reply.code(409).send({ ok: false, error: 'unclaimed' });
      default:
        return reply.code(503).send({ ok: false, error: 'down' });
    }
  });

  /** The locker: your mask, plus the older "mask by default" flag. The flag
      is still stored and accepted (the client still sends it) but no seat
      reads it since 2026-09-04: every room starts masked and the green room
      toggle is how a camera comes on. */
  app.post<{ Body: { mask?: string; maskDefault?: boolean } }>('/auth/locker', async (req, reply) => {
    const s = readSession(req);
    if (!s) return reply.code(401).send({ ok: false });
    const mask = String(req.body?.mask ?? '');
    if (!(AVATAR_IDS as readonly string[]).includes(mask)) {
      return reply.code(400).send({ ok: false, error: 'bad_mask' });
    }
    const ok = await setLocker(s.sub, mask, Boolean(req.body?.maskDefault));
    return { ok };
  });

  app.post('/auth/logout', async (_req, reply) => {
    clearCookie(reply, SESSION_COOKIE);
    return { ok: true };
  });
}

export type { AccountRow };
