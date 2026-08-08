// The ranked ladder's identity: a persistent per-device id, same no-accounts
// promise as everything else. Your rating follows this id; if real accounts
// ever land, this is what migrates into one.

const KEY = 'yapstage.playerId';

export function playerId(): string {
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
