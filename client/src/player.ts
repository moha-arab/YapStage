// The ladder's identity. Signed out it's a per-device id; signed in the server
// hands back the account's canonical id and we adopt it here, which is how a
// rating and a campaign follow you to a new device. Everything downstream is
// keyed on this one string, so account support cost the rest of the app nothing.

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

/** Send the browser to Google, carrying this device's id so a first sign-in
    adopts progress already earned here instead of starting from zero. */
export function signIn(): void {
  window.location.assign(`/auth/google?claim=${encodeURIComponent(playerId())}`);
}

export async function signOut(): Promise<void> {
  try {
    await fetch('/auth/logout', { method: 'POST' });
  } catch {
    // ignore
  }
  window.location.assign('/');
}
