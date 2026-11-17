// The one account rule in the app: ranked needs an account, nothing else
// does. Both ranked doors, the queue and the placement match, ask this same
// question. It lives here with no imports so the smoke suite can check both
// answers without a Google client id in the room.

export type RankedRefusal = 'signed_out' | null;

/** Why a socket may not enter ranked, or null when it may. Keyed on Google
    being configured so a deployment (or the smoke suite) without sign-in
    still has a queue: where nobody can sign in, nobody is turned away. */
export function rankedRefusal(signedIn: boolean, googleOn: boolean): RankedRefusal {
  return googleOn && !signedIn ? 'signed_out' : null;
}

// WATCHING LIVE MATCHES NEEDS FINISHED PLACEMENT. The crowd at a ranked
// match is players who have been through the same three games, not anyone
// passing. Server-enforced here and asked by every door
// into a ranked stream: spectate:join for a ranked room, /spectate/random and
// the next-match hop that rides it (index.ts).

export type WatchRefusal = 'watch_locked' | null;

export interface WatchAsk {
  /** Google sign-in is configured on this server. Off (local dev, the smoke
      suites) nobody can sign in, so nobody is locked out. */
  googleOn: boolean;
  signedIn: boolean;
  /** From the store: true placed, false still placing, null unknown (the
      store is down). Unknown is let through, the same way the ranked queue
      stays open with the store down: a dead database never locks the app. */
  placed: boolean | null;
  /** The room being joined is a friend room (or any non-ranked room) reached
      through its own code or invite link. */
  byCode: boolean;
}

/** Why a socket may not watch, or null when it may. */
export function watchRefusal(a: WatchAsk): WatchRefusal {
  // A friend room reached through its code stays open to anyone: the host
  // shared the code or the link and allowed spectators (pick:spectators),
  // so whoever holds it was invited. Placement has nothing to say about that.
  if (a.byCode) return null;
  if (!a.googleOn) return null;
  if (!a.signedIn) return 'watch_locked';
  return a.placed === false ? 'watch_locked' : null;
}
