// The ladder's identity. Signed out it's a per-device id; signed in the server
// hands back the account's canonical id and we adopt it here, which is how a
// rating and a campaign follow you to a new device. Everything downstream is
// keyed on this one string, so account support cost the rest of the app nothing.

import { carriedDrill, clearGuest } from './guest';

const KEY = 'yapstage.playerId';

let override: string | null = null;

export function playerId(): string {
  if (override) return override;
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // Storage blocked: a per-session identity still lets you play ranked,
    // your rating just will not survive the tab.
    return crypto.randomUUID();
  }
}

/** Adopt the account's canonical player id (called once, from /auth/me). */
export function adoptPlayerId(id: string): void {
  if (!id) return;
  override = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // memory-only for this tab, which is enough
  }
}

export interface Account {
  signedIn: boolean;
  /** Whether sign-in is even available on this deployment. */
  google: boolean;
  name?: string;
  /** Signed in but hasn't claimed a yap name yet — the app blocks until they do. */
  needsName?: boolean;
  /** The locker: your saved mask, and whether you wear it instead of a camera. */
  mask?: string | null;
  maskDefault?: boolean;
  /** When the yap name may next change (ISO). Null or absent: it can change
      now. Names change once every 30 days (server auth.ts /auth/rename). */
  nextNameChange?: string | null;
}

export type RenameResult =
  | { ok: true; name: string; nextNameChange: string | null }
  | { ok: false; error: string; nextNameChange?: string | null };

/** Change the yap name. The server decides everything (taken, reserved, too
    soon); `error` is its code, or 'failed' when it could not be reached. The
    caller reconnects the socket on success, as ClaimName does. */
export async function renameAccount(name: string): Promise<RenameResult> {
  try {
    const res = await fetch('/auth/rename', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const d = (await res.json()) as { ok?: boolean; name?: string; error?: string; nextNameChange?: string | null };
    if (d.ok && d.name) return { ok: true, name: d.name, nextNameChange: d.nextNameChange ?? null };
    return { ok: false, error: d.error || 'failed', nextNameChange: d.nextNameChange ?? null };
  } catch {
    return { ok: false, error: 'failed' };
  }
}

/** Save your mask choice to the account, so it follows you into every mode. */
export async function saveLocker(mask: string, maskDefault: boolean): Promise<boolean> {
  try {
    const res = await fetch('/auth/locker', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mask, maskDefault }),
    });
    const d = (await res.json()) as { ok?: boolean };
    return Boolean(d.ok);
  } catch {
    return false;
  }
}

/** Ask the server who we are. Adopts the account's player id as a side effect
    so every later playerId() call is already the right one. */
export async function whoAmI(): Promise<Account> {
  try {
    const res = await fetch('/auth/me');
    const me = (await res.json()) as Account & { playerId?: string };
    if (me.signedIn && me.playerId) adoptPlayerId(me.playerId);
    return me;
  } catch {
    return { signedIn: false, google: false };
  }
}

/** Delete the account for good. `confirm` is the username as the person typed
    it; the server checks it against the account (by its fold, so case does
    not matter). On success the server has already cleared the session; the
    caller then runs signOut() to reset the device. */
export async function deleteAccount(confirm: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch('/auth/delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirm }),
    });
    const d = (await res.json()) as { ok?: boolean; error?: string };
    if (d.ok) return { ok: true };
    return { ok: false, error: d.error || 'failed' };
  } catch {
    return { ok: false, error: 'failed' };
  }
}

/** Send the browser to Google. This device's id goes along so a first
    sign-in adopts progress already earned here instead of starting from
    zero, and so does the drill streak a guest kept on the device (guest.ts).
    Neither rides on the URL (2026-09-12): they are posted to /auth/claim
    first, which hands them back as a short-lived, signed, HttpOnly cookie
    that only the sign-in callback reads. On the URL the id sat in browser
    history, server logs and every Referer, and any link could pick whose
    guest games an account adopted. If the post fails, sign-in still goes
    ahead; the guest games just stay on the device id.

    An invite code in the URL is stashed first: the OAuth round trip lands back
    on a bare `/?auth=ok`, and without this the person a friend called out
    signs in and finds themselves in an empty lobby instead of the room. */
export function signIn(): void {
  // An invite link's code has to survive the Google round trip, which strips
  // the URL. Stash it; the lobby reads it back once and clears it.
  try {
    const code = new URLSearchParams(window.location.search).get('code');
    if (code) sessionStorage.setItem('yapstage.pendingCode', code.toUpperCase());
  } catch {
    // storage blocked: they sign in and type the code by hand, which works
  }
  const drill = carriedDrill();
  void fetch('/auth/claim', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ claim: playerId(), ...(drill ? { drill } : {}) }),
  })
    .catch(() => undefined)
    .finally(() => window.location.assign('/auth/google'));
}

/** Sign out, and leave the device as a stranger would find it. The account's
    canonical id was adopted into localStorage at boot; left there, the next
    guest on this laptop would play under it, and their first sign-in would
    try to claim it (the server refuses, store.ts adoptable, but a fresh id
    here is the honest fix). The guest name, mask and streak go with it. */
export async function signOut(): Promise<void> {
  try {
    await fetch('/auth/logout', { method: 'POST' });
  } catch {
    // ignore
  }
  override = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // storage blocked: nothing was kept here anyway
  }
  clearGuest();
  window.location.assign('/');
}
