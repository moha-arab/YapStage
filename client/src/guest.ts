// What a guest keeps on this device. Nothing but ranked needs an account, so
// the name the device was given and the drill streak you are on live in
// localStorage until you sign in. There is no
// character to keep: a guest wears the grey silhouette, which the server
// puts on every signed-out seat (index.ts seatLookOf), and characters come
// with an account. At sign-in the streak rides the claim (player.ts signIn)
// into the account, and the rest stops mattering: an account has a yap name
// and a locker of its own. Signing out clears all of it along with the
// device id, so the next person on a shared laptop starts as the stranger
// they are.

import { GUEST_NAME_RE } from '../../server/src/protocol';

const NAME_KEY = 'yapstage.guestName';
const DRILL_KEY = 'yapstage.drill';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // storage blocked: it lasts the tab, which is enough to play
  }
}

/** What a guest is called. Guests do not pick a name: each device is given
    one, made once and kept, until they sign in and claim their own. The server
    refuses any other name from a signed-out socket (GUEST_NAME_RE), so a name
    typed into the old name box, or anything else that is not exactly
    GuestNNNN, is replaced here. */
export function guestName(): string {
  const saved = read(NAME_KEY);
  if (saved && GUEST_NAME_RE.test(saved)) return saved;
  const made = `Guest${Math.floor(1000 + Math.random() * 9000)}`;
  write(NAME_KEY, made);
  return made;
}

/* ---- the drill streak, mirrored from store.ts recordDrill / drillState ---- */

interface LocalDrill {
  last: string;
  streak: number;
  best: number;
}

function readDrill(): LocalDrill | null {
  const raw = read(DRILL_KEY);
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as Partial<LocalDrill>;
    if (typeof d.last !== 'string' || typeof d.streak !== 'number') return null;
    return { last: d.last, streak: d.streak, best: typeof d.best === 'number' ? d.best : 0 };
  } catch {
    return null;
  }
}

/** The calendar day before `day`, on the drill's own clock (UTC). */
function dayBefore(day: string): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
}

/** What the drill screen shows a guest on arrival. A streak already broken
    reads as broken before they play, the same as the server's. */
export function localDrillState(day: string): { streak: number; best: number; doneToday: boolean } {
  const d = readDrill();
  if (!d) return { streak: 0, best: 0, doneToday: false };
  const alive = d.last === day || d.last === dayBefore(day);
  return { streak: alive ? d.streak : 0, best: d.best, doneToday: d.last === day };
}

/** Record today's attempt at the day's own drill: today extends the streak,
    a missed day resets it, a second go today changes nothing but the best. */
export function recordLocalDrill(day: string, score: number): { streak: number; best: number; already: boolean } {
  const d = readDrill();
  const best = Math.max(d?.best ?? 0, score);
  if (d?.last === day) {
    write(DRILL_KEY, JSON.stringify({ ...d, best }));
    return { streak: d.streak, best, already: true };
  }
  const streak = d?.last === dayBefore(day) ? d.streak + 1 : 1;
  write(DRILL_KEY, JSON.stringify({ last: day, streak, best }));
  return { streak, best, already: false };
}

/** The streak as the sign-in claim carries it (player.ts signIn, then
    auth.ts /auth/claim and parseCarriedDrill): `last|streak|best`, or empty
    when there is nothing worth carrying. */
export function carriedDrill(): string {
  const d = readDrill();
  if (!d || d.streak < 1) return '';
  return `${d.last}|${d.streak}|${d.best}`;
}

/** Sign-out: leave the device as a stranger would find it. */
export function clearGuest(): void {
  write(NAME_KEY, null);
  write(DRILL_KEY, null);
}
