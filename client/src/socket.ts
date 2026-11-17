import { io, type Socket } from 'socket.io-client';
import type { ClientToServer, ServerToClient } from '../../server/src/protocol';

// Deliberately in-memory (not sessionStorage): a page refresh gets a new
// sessionId, so a refreshed tab can never resume a LIVE debate by accident:
// only transient socket reconnects (same page, same memory) can. The exceptions
// adopt the pre-refresh id on purpose: the post-debate boot resume (App.tsx
// yap.resume), a reload mid-game (App.tsx yap.live), and the friend room
// still waiting for its guest (yap.room, below).
export const session: { id: string } = { id: crypto.randomUUID() };

// Same-origin: production is served by the same Fastify process; dev goes
// through the Vite proxy (ws) to :3000.
export const socket: Socket<ServerToClient, ClientToServer> = io();

/* ---- the friend room waiting for its guest (Home.tsx) ----
   The server keeps a waiting room through its host's drop for its waiting
   TTL (index.ts disconnect, lobby.ts WAITING_TTL_MS) and hands it back to
   the same session with lobby:resume. So the lobby remembers the room it
   opened and the session id it opened it under, and a reload takes the SAME
   code back instead of opening a new one each time. Without this, every
   reload made a new code, the one already sent led into a dead room, and
   each stale room counted against the address's cap.

   Like yap.live, the stored copy only counts once the page has really
   unloaded (pagehide stamps it): a duplicated tab copies sessionStorage but
   never unloaded, so it cannot take the room from the tab it came from. A
   lobby that comes back within the same page (after the drill or the record)
   uses the copy in memory. */
const ROOM_KEY = 'yap.room';
/** The server's waiting TTL: older than this, the room is gone. */
const ROOM_KEEP_MS = 10 * 60_000;

interface OwnedRoom {
  code: string;
  sid: string;
  /** When the page unloaded. */
  at?: number;
}

let owned: OwnedRoom | null = null;

/** The room just opened, under the session id it was opened with. */
export function rememberRoom(code: string): void {
  owned = { code, sid: session.id };
  try {
    sessionStorage.setItem(ROOM_KEY, JSON.stringify(owned));
  } catch {
    // storage blocked: a reload opens a new room, as it always did
  }
}

export function forgetRoom(): void {
  owned = null;
  try {
    sessionStorage.removeItem(ROOM_KEY);
  } catch {
    // ignore
  }
}

/** The waiting room this tab opened, if it may still be taken back. */
export function recallRoom(): { code: string; sid: string } | null {
  if (owned) return owned;
  try {
    const raw = sessionStorage.getItem(ROOM_KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw) as Partial<OwnedRoom> | null;
    if (
      !rec ||
      typeof rec.code !== 'string' ||
      typeof rec.sid !== 'string' ||
      typeof rec.at !== 'number' ||
      Date.now() - rec.at > ROOM_KEEP_MS
    ) {
      sessionStorage.removeItem(ROOM_KEY);
      return null;
    }
    // This page holds it now: unstamped again, so a copy of this tab made
    // from here on cannot take it.
    owned = { code: rec.code, sid: rec.sid };
    sessionStorage.setItem(ROOM_KEY, JSON.stringify(owned));
    return owned;
  } catch {
    return null;
  }
}

window.addEventListener('pagehide', () => {
  if (!owned) return;
  try {
    sessionStorage.setItem(ROOM_KEY, JSON.stringify({ ...owned, at: Date.now() }));
  } catch {
    // ignore
  }
});
