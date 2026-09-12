// The one account rule in the app: ranked needs an account, nothing else
// does (his call 2026-09-12: "you don't need an account for anything but
// ranked"). Both ranked doors, the queue and the placement match, ask this
// same question. It lives here with no imports so the smoke suite can check
// both answers without a Google client id in the room.

export type RankedRefusal = 'signed_out' | null;

/** Why a socket may not enter ranked, or null when it may. Keyed on Google
    being configured so a deployment (or the smoke suite) without sign-in
    still has a queue: where nobody can sign in, nobody is turned away. */
export function rankedRefusal(signedIn: boolean, googleOn: boolean): RankedRefusal {
  return googleOn && !signedIn ? 'signed_out' : null;
}
