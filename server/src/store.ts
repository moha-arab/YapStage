// The first thing YapStage ever persists: shared verdict cards.
//
// Deliberately optional. Without DATABASE_URL the app behaves exactly as it did
// before — share links still work, they just carry the whole card in the URL
// instead of an id. That means this can ship before the database exists, and
// adding the database later is a config change with no migration and no
// downtime. Every function here fails soft: a dead database costs you a short
// link, never a debate.
import pg from 'pg';
import { sanitizeCard, type Card } from './share.js';
import { event } from './stats.js';
import { foldName } from './protocol.js';

let pool: pg.Pool | null = null;
let ready = false;

/** Short, unambiguous ids: no I/O/0/1, same alphabet as lobby codes. */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const ID_LEN = 8;
export const ID_RE = new RegExp(`^[${ALPHABET}]{${ID_LEN}}$`);

function newId(): string {
  let out = '';
  for (let i = 0; i < ID_LEN; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

export function storeConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function storeReady(): boolean {
  return ready;
}

/** Called once at boot. Never throws: if the database is unreachable we simply
    stay on long links rather than refusing to start. */
export async function initStore(): Promise<void> {
  if (!storeConfigured()) {
    console.log('[store] DATABASE_URL unset — share links stay self-contained');
    return;
  }
  try {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      // Railway's managed Postgres terminates TLS with its own chain.
      ssl: process.env.DATABASE_URL?.includes('localhost') ? undefined : { rejectUnauthorized: false },
      max: 4,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000,
    });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cards (
        id         text PRIMARY KEY,
        payload    jsonb NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS players (
        id         text PRIMARY KEY,
        name       text NOT NULL,
        rating     integer NOT NULL DEFAULT 700,
        wins       integer NOT NULL DEFAULT 0,
        losses     integer NOT NULL DEFAULT 0,
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS shutdowns (
        id           bigserial PRIMARY KEY,
        signal       text NOT NULL,
        live_lobbies integer NOT NULL DEFAULT 0,
        at           timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        sub        text PRIMARY KEY,
        player_id  text NOT NULL,
        email      text NOT NULL DEFAULT '',
        name       text NOT NULL DEFAULT '',
        picture    text NOT NULL DEFAULT '',
        username   text,
        created_at timestamptz NOT NULL DEFAULT now(),
        seen_at    timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cheat_flags (
        id        bigserial PRIMARY KEY,
        code      text NOT NULL,
        player_id text NOT NULL,
        name      text NOT NULL,
        score     integer NOT NULL,
        signals   jsonb NOT NULL,
        at        timestamptz NOT NULL DEFAULT now()
      )
    `);
    // One row per friendship, subs sorted so (a,b) and (b,a) cannot both exist.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS friends (
        lo_sub   text NOT NULL,
        hi_sub   text NOT NULL,
        status   text NOT NULL,
        asked_by text NOT NULL,
        at       timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (lo_sub, hi_sub)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS friends_hi ON friends (hi_sub)`);
    await pool.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS username text`);
    await pool.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS username_fold text`);
    await pool.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS drill_last date`);
    await pool.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS drill_streak integer NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS drill_best integer NOT NULL DEFAULT 0`);
    await pool.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS mask text`);
    await pool.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS mask_default boolean NOT NULL DEFAULT false`);
    // BACKFILL, and the reason this exists is worth keeping.
    // `username_fold` arrived in a later deploy than `username`, so every
    // account that claimed a name in between has username set and fold NULL.
    // Every friend lookup keys on the fold, so those accounts are invisible:
    // typing their exact name returns "no yapper by that name". Confirmed on
    // production 2026-08-12 — the founder's own account could not be found by
    // its own name, which is precisely the "friend adding doesn't work" bug.
    // Postgres treats NULLs as distinct in a unique index, so nothing ever
    // complained. Folding is JS, so the backfill has to round-trip through it.
    try {
      const stale = await pool.query(
        `SELECT sub, username FROM accounts WHERE username IS NOT NULL AND username_fold IS NULL`,
      );
      for (const row of stale.rows as { sub: string; username: string }[]) {
        await pool.query(`UPDATE accounts SET username_fold = $2 WHERE sub = $1`, [
          row.sub,
          foldName(row.username),
        ]);
      }
      if (stale.rowCount) console.log(`[store] backfilled ${stale.rowCount} username folds`);
    } catch (err) {
      console.error('[store] username_fold backfill failed:', err);
    }
    // Case-insensitive uniqueness: 'YapKing' and 'yapking' are the same person
    // to everyone reading a scoreboard, so they cannot both exist.
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS accounts_username_key ON accounts (lower(username))`,
    );
    // The real referee: folding collapses case AND lookalike letters, so a
    // Cyrillic twin of a taken name loses the race instead of impersonating.
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS accounts_username_fold_key ON accounts (username_fold)`,
    );
    // Campaign progress rides the same identity as the ranked ladder.
    await pool.query(
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS campaign integer NOT NULL DEFAULT 0`,
    );
    // Match history: the account's own debates, so a verdict is re-openable
    // and the coach can still read the transcript days later. Disclosed at
    // sign-up; his call 2026-08-08 (save by default).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS matches (
        id         bigserial PRIMARY KEY,
        player_id  text NOT NULL,
        mode       text NOT NULL,
        topic      text NOT NULL,
        my_side    text NOT NULL,
        won        boolean NOT NULL,
        my_total   integer NOT NULL,
        their_total integer NOT NULL,
        opponent   text NOT NULL,
        verdict    jsonb NOT NULL,
        transcript jsonb NOT NULL,
        at         timestamptz NOT NULL DEFAULT now()
      )
    `);
    await pool.query(
      `CREATE INDEX IF NOT EXISTS matches_player_at ON matches (player_id, at DESC)`,
    );
    // Whether the match moved a rating. Only ranked human matches do.
    await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS rated boolean NOT NULL DEFAULT false`);
    // One-time data changes that cannot be expressed as CREATE IF NOT EXISTS.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        key text PRIMARY KEY,
        at  timestamptz NOT NULL DEFAULT now()
      )
    `);
    await runOnce('rating_seed_700', async () => {
      // The scale moved down 300 points when the seed went from 1000 to 700.
      // Shift every existing player by the same amount so relative order and
      // games played survive; anyone below the new floor is pulled up to it.
      await pool!.query(`ALTER TABLE players ALTER COLUMN rating SET DEFAULT ${SEED_RATING}`);
      await pool!.query(`UPDATE players SET rating = GREATEST(${RATING_FLOOR}, rating - 300)`);
    });
    await runOnce('mask_roster_4', async () => {
      // The mask set went from eight to four (his picks). Anyone who saved a
      // removed mask gets the nearest survivor rather than a broken locker:
      // whites to the new white, the armored to the ninja, the rest home.
      await pool!.query(`
        UPDATE accounts SET mask = CASE mask
          WHEN 'kitsune' THEN 'calavera'
          WHEN 'goalie'  THEN 'calavera'
          WHEN 'masque'  THEN 'oni'
          WHEN 'knight'  THEN 'ninja'
          WHEN 'astro'   THEN 'ninja'
          WHEN 'boxer'   THEN 'luchador'
          ELSE mask END
        WHERE mask IN ('kitsune','goalie','masque','knight','astro','boxer')`);
    });
    // The pre-launch waitlist (2026-08-22 to 2026-09-04) is gone with the
    // page that fed it. It only ever held one test row.
    await runOnce('drop_waitlist', async () => {
      await pool!.query(`DROP TABLE IF EXISTS waitlist`);
    });
    // Reports keep the debate's words as evidence — the one deliberate
    // exception to "transcripts die with the lobby", disclosed in the UI.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reports (
        id            bigserial PRIMARY KEY,
        code          text NOT NULL,
        mode          text NOT NULL,
        reporter_name text NOT NULL,
        reported_name text NOT NULL,
        reason        text NOT NULL,
        transcript    jsonb NOT NULL,
        at            timestamptz NOT NULL DEFAULT now()
      )
    `);
    ready = true;
    console.log('[store] postgres ready — share links are short');
  } catch (err) {
    console.error('[store] init failed, falling back to self-contained links:', err);
    pool = null;
    ready = false;
  }
}

/** Run a one-time migration exactly once, ever, across every deploy and every
    replica. Fails soft like everything else here: a migration that throws
    leaves its key unwritten and gets retried next boot rather than taking the
    server down. */
async function runOnce(key: string, fn: () => Promise<void>): Promise<void> {
  if (!pool) return;
  try {
    const seen = await pool.query(`SELECT 1 FROM migrations WHERE key = $1`, [key]);
    if (seen.rowCount === 1) return;
    await fn();
    await pool.query(`INSERT INTO migrations (key) VALUES ($1) ON CONFLICT DO NOTHING`, [key]);
    console.log(`[store] migration ${key} applied`);
  } catch (err) {
    console.error(`[store] migration ${key} failed, will retry next boot:`, err);
  }
}

/** Save a card, returning its short id. null means "use a long link instead". */
export async function saveCard(card: Card): Promise<string | null> {
  if (!pool || !ready) return null;
  // Three shots at an unused id. At 31^8 (~850 billion) a collision is already
  // a lottery win; this is just so a collision can never surface as an error.
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = newId();
    try {
      const res = await pool.query(
        'INSERT INTO cards (id, payload) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING RETURNING id',
        [id, JSON.stringify(card)],
      );
      if (res.rowCount === 1) return id;
    } catch (err) {
      console.error('[store] saveCard failed:', err);
      event('store_write_failed');
      return null;
    }
  }
  return null;
}

// Whether the shutdown handler ran at all is otherwise unknowable: the event
// ring dies with the process, and Railway's log stream isn't readable from
// here. A row survives the restart, so the next boot can report it.
export async function recordShutdown(signal: string, liveLobbies: number): Promise<void> {
  if (!pool || !ready) return;
  try {
    await pool.query(
      `INSERT INTO shutdowns (signal, live_lobbies) VALUES ($1, $2)`,
      [signal.slice(0, 20), liveLobbies],
    );
  } catch (err) {
    console.error('[store] recordShutdown failed:', err);
  }
}

export async function lastShutdown(): Promise<Record<string, unknown> | null> {
  if (!pool || !ready) return null;
  try {
    const res = await pool.query(
      `SELECT signal, live_lobbies, at FROM shutdowns ORDER BY at DESC LIMIT 1`,
    );
    return res.rowCount === 1 ? (res.rows[0] as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// ---- ranked ladder ----
// Identity is a persistent per-device id (localStorage), not an account: the
// same no-login promise as everything else, and it migrates cleanly if real
// accounts ever land. All calls fail soft — a dead database costs a rating
// update, never a debate.

export interface PlayerRow {
  rating: number;
  wins: number;
  losses: number;
}

/** Fetch (creating if new) a player's ladder row, refreshing their name. */
export async function getPlayer(id: string, name: string): Promise<PlayerRow | null> {
  if (!pool || !ready) return null;
  try {
    const res = await pool.query(
      `INSERT INTO players (id, name) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET name = $2, updated_at = now()
       RETURNING rating, wins, losses`,
      [id.slice(0, 64), name.slice(0, 24)],
    );
    return res.rows[0] as PlayerRow;
  } catch (err) {
    console.error('[store] getPlayer failed:', err);
    return null;
  }
}

/** Read-only rating lookup. Deliberately NOT getPlayer: that one upserts and
    rewrites the stored name, so calling it from a page load would create a row
    for every visitor and rename real players to whatever the caller passed. A
    display never writes. */
export async function getRating(id: string): Promise<PlayerRow | null> {
  if (!pool || !ready) return null;
  try {
    const res = await pool.query(`SELECT rating, wins, losses FROM players WHERE id = $1`, [
      id.slice(0, 64),
    ]);
    return res.rowCount === 1 ? (res.rows[0] as PlayerRow) : null;
  } catch (err) {
    console.error('[store] getRating failed:', err);
    return null;
  }
}

/** Matches you must finish before your rating is a number and not a guess.
    Chess.com hides the rating for 5 games; Lichess shows "?" until its
    deviation settles. Same idea: do not show a number you do not believe yet.
    THREE, not five, because only ranked matches against humans count and this
    pool is tiny: a threshold nobody can reach hides the rating forever, which
    is worse than showing one that is still moving. */
export const PLACEMENT_MATCHES = 3;

/** Where a new player starts.
    700 was chosen from the bot ladder, not from chess. At 700 you are a 57%
    favourite over Pip (650) and a 30% underdog to Cappy (850), so your first
    rated match is probably a win and not certainly one, which is the right
    prior for someone who has never debated.
    1000 was wrong for a specific reason: 1000 IS Vivi, rank 3 of 6. Every new
    account was being handed the claim that it could already take half the
    ladder. Chess.com has the same shape as this: its bots start at 250 and a
    self-declared beginner starts at 400, so a newcomer has one rung below them
    and a long way up. */
export const SEED_RATING = 700;

/** A floor, not a kindness. 500 against Pip means the gentlest bot on the
    ladder beats you 70% of the time; everything below that is dead space that
    exists only to humiliate someone. It also plugs the leak: points that fall
    out of the bottom of a pool never come back. */
export const RATING_FLOOR = 500;

/** K shrinks as the system learns you. A brand-new player swings fast so they
    reach their real level in a few nights; an established one barely moves,
    which is also what stops a veteran from being dragged around by newcomers.
    USCF does this with K = 800/(N+m); this is the same curve, clamped. */
function kFor(games: number): number {
  if (games < PLACEMENT_MATCHES) return 64;
  if (games < 20) return 40;
  return 24;
}

/** Expected score for A against B, the only thing a rating gap ever means. */
const expected = (a: number, b: number): number => 1 / (1 + Math.pow(10, (b - a) / 400));

/** ELO for a ranked HUMAN match, the only thing in the app that moves a rating.
    Bot debates are deliberately unrated: a bot is a fixed strategy you can
    learn to beat forever, and a bot match has no witness.

    The two players can move by DIFFERENT amounts, which is deliberate and is
    how a settled rating survives a rush of new accounts. */
export async function applyRankedResult(
  winnerId: string,
  loserId: string,
): Promise<{ winner: { before: number; after: number }; loser: { before: number; after: number } } | null> {
  if (!pool || !ready) return null;
  try {
    const res = await pool.query(`SELECT id, rating, wins, losses FROM players WHERE id = ANY($1)`, [
      [winnerId, loserId],
    ]);
    type R = { id: string; rating: number; wins: number; losses: number };
    const rows = new Map(res.rows.map((r: R) => [r.id, r]));
    const rw = rows.get(winnerId)?.rating ?? SEED_RATING;
    const rl = rows.get(loserId)?.rating ?? SEED_RATING;
    const gw = (rows.get(winnerId)?.wins ?? 0) + (rows.get(winnerId)?.losses ?? 0);
    const gl = (rows.get(loserId)?.wins ?? 0) + (rows.get(loserId)?.losses ?? 0);
    const e = expected(rw, rl);
    const gain = Math.max(1, Math.round(kFor(gw) * (1 - e)));
    const drop = Math.max(1, Math.round(kFor(gl) * (1 - e)));
    // A floor, not a kindness: it stops the pool leaking points out the bottom
    // when someone tilts through ten losses and never comes back.
    const after = { winner: rw + gain, loser: Math.max(RATING_FLOOR, rl - drop) };
    await pool.query(
      `UPDATE players SET rating = $2, wins = wins + 1, updated_at = now() WHERE id = $1`,
      [winnerId, after.winner],
    );
    await pool.query(
      `UPDATE players SET rating = $2, losses = losses + 1, updated_at = now() WHERE id = $1`,
      [loserId, after.loser],
    );
    return {
      winner: { before: rw, after: after.winner },
      loser: { before: rl, after: after.loser },
    };
  } catch (err) {
    console.error('[store] applyRankedResult failed:', err);
    return null;
  }
}

// ---- accounts ----
// Identity is Google's `sub`. The account OWNS one canonical player row, which
// is how a rating and a campaign follow you across devices: signing in on a new
// device hands back the account's playerId and the client adopts it, so every
// player-keyed feature keeps working untouched. First sign-in ADOPTS whatever
// the device already earned, so nothing is lost by making an account late.

export interface AccountRow {
  sub: string;
  playerId: string;
  name: string;
  /** Null until they claim one. The app blocks play until they do. */
  username: string | null;
}

/** The locker: your chosen mask, and whether you want it INSTEAD of a camera
    by default. Ranked ignores the second flag (always masked). */
export async function getLocker(sub: string): Promise<{ mask: string | null; maskDefault: boolean }> {
  if (!pool || !ready) return { mask: null, maskDefault: false };
  try {
    const r = await pool.query(`SELECT mask, mask_default FROM accounts WHERE sub = $1`, [sub]);
    if (r.rowCount !== 1) return { mask: null, maskDefault: false };
    return { mask: (r.rows[0].mask as string) || null, maskDefault: Boolean(r.rows[0].mask_default) };
  } catch {
    return { mask: null, maskDefault: false };
  }
}

/** The fresh start (2026-08-22, his explicit instruction): delete every
    account except his two, and everything those deleted accounts owned —
    players, ratings, friendships, match history. REFUSES to run unless BOTH
    keep-names are found, so a misremembered username deletes nothing. Behind
    the STATS_KEY admin route, never automatic. */
export async function prelaunchPrune(
  keep: string[],
): Promise<
  | { ok: true; kept: string[]; deleted: Record<string, number> }
  | { ok: false; error: string; found: string[] }
> {
  if (!pool || !ready) return { ok: false, error: 'store_down', found: [] };
  try {
    const folds = keep.map((k) => k.toLowerCase());
    const found = await pool.query(
      `SELECT username, sub, player_id FROM accounts WHERE username_fold = ANY($1)`,
      [folds],
    );
    if (found.rowCount !== keep.length) {
      return {
        ok: false,
        error: `expected ${keep.length} keep-accounts, found ${found.rowCount}`,
        found: found.rows.map((r: { username: string }) => r.username),
      };
    }
    const keepSubs = found.rows.map((r: { sub: string }) => r.sub);
    const keepPlayers = found.rows.map((r: { player_id: string }) => r.player_id);

    const deleted: Record<string, number> = {};
    const run = async (label: string, sql: string, params: unknown[]) => {
      const r = await pool!.query(sql, params);
      deleted[label] = r.rowCount ?? 0;
    };
    await run('friends', `DELETE FROM friends WHERE NOT (lo_sub = ANY($1) AND hi_sub = ANY($1))`, [keepSubs]);
    await run('matches', `DELETE FROM matches WHERE NOT (player_id = ANY($1))`, [keepPlayers]);
    await run('players', `DELETE FROM players WHERE NOT (id = ANY($1))`, [keepPlayers]);
    await run('accounts', `DELETE FROM accounts WHERE NOT (sub = ANY($1))`, [keepSubs]);
    await run('cheat_flags', `DELETE FROM cheat_flags WHERE NOT (player_id = ANY($1))`, [keepPlayers]);
    return { ok: true, kept: found.rows.map((r: { username: string }) => r.username), deleted };
  } catch (err) {
    console.error('[store] prelaunchPrune failed:', err);
    return { ok: false, error: String(err).slice(0, 200), found: [] };
  }
}

export async function setLocker(sub: string, mask: string, maskDefault: boolean): Promise<boolean> {
  if (!pool || !ready) return false;
  try {
    await pool.query(`UPDATE accounts SET mask = $2, mask_default = $3 WHERE sub = $1`, [sub, mask, maskDefault]);
    return true;
  } catch (err) {
    console.error('[store] setLocker failed:', err);
    return false;
  }
}

export async function linkAccount(p: {
  sub: string;
  email: string;
  name: string;
  picture: string;
  claimPlayerId: string | null;
}): Promise<AccountRow | null> {
  if (!pool || !ready) return null;
  try {
    const existing = await pool.query(
      `SELECT player_id, name, username FROM accounts WHERE sub = $1`,
      [p.sub],
    );
    if (existing.rowCount === 1) {
      // Returning user: refresh the profile, keep the canonical player row.
      await pool.query(
        `UPDATE accounts SET email = $2, name = $3, picture = $4, seen_at = now() WHERE sub = $1`,
        [p.sub, p.email.slice(0, 200), p.name.slice(0, 64), p.picture.slice(0, 500)],
      );
      return {
        sub: p.sub,
        playerId: existing.rows[0].player_id as string,
        name: (existing.rows[0].username as string) || (existing.rows[0].name as string) || p.name,
        username: (existing.rows[0].username as string) || null,
      };
    }
    // First sign-in: adopt this device's progress rather than starting over.
    const playerId = p.claimPlayerId || `acct_${p.sub}`;
    await pool.query(
      `INSERT INTO players (id, name) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`,
      [playerId, p.name.slice(0, 24) || 'player'],
    );
    await pool.query(
      `INSERT INTO accounts (sub, player_id, email, name, picture)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (sub) DO NOTHING`,
      [p.sub, playerId, p.email.slice(0, 200), p.name.slice(0, 64), p.picture.slice(0, 500)],
    );
    event('account_created');
    return { sub: p.sub, playerId, name: p.name, username: null };
  } catch (err) {
    console.error('[store] linkAccount failed:', err);
    return null;
  }
}

/** Claim a yap name for this account. One shot: the name IS the identity on a
    scoreboard, so it can't be swapped out from under an opponent's receipts.
    'taken' is a normal answer, not an error — the unique index is the referee. */
export async function claimUsername(
  sub: string,
  username: string,
): Promise<'ok' | 'taken' | 'already' | 'down'> {
  if (!pool || !ready) return 'down';
  try {
    const cur = await pool.query(`SELECT username FROM accounts WHERE sub = $1`, [sub]);
    if (cur.rowCount === 1 && cur.rows[0].username) return 'already';
    const res = await pool.query(
      `UPDATE accounts SET username = $2, username_fold = $3 WHERE sub = $1 AND username IS NULL`,
      [sub, username, foldName(username)],
    );
    if (res.rowCount !== 1) return 'already';
    // The ladder row shows this name too, so keep the two in step.
    await pool.query(
      `UPDATE players SET name = $2 WHERE id = (SELECT player_id FROM accounts WHERE sub = $1)`,
      [sub, username],
    );
    event('username_claimed');
    return 'ok';
  } catch (err) {
    // 23505 = unique violation: somebody got there first.
    if ((err as { code?: string })?.code === '23505') return 'taken';
    console.error('[store] claimUsername failed:', err);
    return 'down';
  }
}

/** Daily drill streak. A streak only survives if you show up the next day,
    which is the entire mechanic: today extends it, a missed day resets it.
    Returns the state AFTER recording today's attempt, or null if the store is
    down (the drill still scores, you just get no streak). */
export async function recordDrill(
  sub: string,
  day: string,
  score: number,
): Promise<{ streak: number; best: number; already: boolean } | null> {
  if (!pool || !ready) return null;
  try {
    const cur = await pool.query(
      `SELECT drill_last, drill_streak, drill_best FROM accounts WHERE sub = $1`,
      [sub],
    );
    if (cur.rowCount !== 1) return null;
    const row = cur.rows[0] as {
      drill_last: string | null;
      drill_streak: number | null;
      drill_best: number | null;
    };
    const last = row.drill_last ? String(row.drill_last).slice(0, 10) : null;
    const streakNow = row.drill_streak ?? 0;
    const best = Math.max(row.drill_best ?? 0, score);
    if (last === day) return { streak: streakNow, best, already: true };
    const yesterday = new Date(new Date(`${day}T00:00:00Z`).getTime() - 86_400_000)
      .toISOString()
      .slice(0, 10);
    const streak = last === yesterday ? streakNow + 1 : 1;
    await pool.query(
      `UPDATE accounts SET drill_last = $2, drill_streak = $3, drill_best = $4 WHERE sub = $1`,
      [sub, day, streak, best],
    );
    return { streak, best, already: false };
  } catch (err) {
    console.error('[store] recordDrill failed:', err);
    return null;
  }
}

/** Streak state without playing: what the drill screen shows on arrival. */
export async function drillState(
  sub: string,
  day: string,
): Promise<{ streak: number; best: number; doneToday: boolean }> {
  if (!pool || !ready) return { streak: 0, best: 0, doneToday: false };
  try {
    const res = await pool.query(
      `SELECT drill_last, drill_streak, drill_best FROM accounts WHERE sub = $1`,
      [sub],
    );
    if (res.rowCount !== 1) return { streak: 0, best: 0, doneToday: false };
    const r = res.rows[0] as {
      drill_last: string | null;
      drill_streak: number | null;
      drill_best: number | null;
    };
    const last = r.drill_last ? String(r.drill_last).slice(0, 10) : null;
    const yesterday = new Date(new Date(`${day}T00:00:00Z`).getTime() - 86_400_000)
      .toISOString()
      .slice(0, 10);
    // A streak you have already broken should read as broken before you play,
    // not flip to 1 the moment you submit.
    const alive = last === day || last === yesterday;
    return {
      streak: alive ? (r.drill_streak ?? 0) : 0,
      best: r.drill_best ?? 0,
      doneToday: last === day,
    };
  } catch {
    return { streak: 0, best: 0, doneToday: false };
  }
}

/** Anti-cheat evidence. Deliberately small and deliberately private: it holds
    numbers about HOW someone spoke, never what they said. */
export async function saveCheatFlag(f: {
  code: string;
  playerId: string;
  name: string;
  score: number;
  signals: unknown;
}): Promise<void> {
  if (!pool || !ready) return;
  try {
    await pool.query(
      `INSERT INTO cheat_flags (code, player_id, name, score, signals) VALUES ($1,$2,$3,$4,$5)`,
      [f.code.slice(0, 12), f.playerId.slice(0, 64), f.name.slice(0, 24), f.score, JSON.stringify(f.signals)],
    );
  } catch (err) {
    console.error('[store] saveCheatFlag failed:', err);
  }
}

export async function loadCheatFlags(limit = 50): Promise<Record<string, unknown>[]> {
  if (!pool || !ready) return [];
  try {
    const res = await pool.query(
      `SELECT id, code, name, score, signals, at FROM cheat_flags ORDER BY at DESC LIMIT $1`,
      [Math.min(limit, 200)],
    );
    return res.rows;
  } catch (err) {
    console.error('[store] loadCheatFlags failed:', err);
    return [];
  }
}

// ---- friends ----
// A friendship is ONE row, always stored with the two subs in sorted order, so
// "are we friends" is a single primary-key lookup instead of an OR over two
// columns. `asked_by` remembers who sent it, which is the only thing that
// makes a pending row directional.

export interface FriendRow {
  /** Their account id. Server-side only: never goes out over HTTP. */
  sub: string;
  username: string;
  playerId: string;
  rating: number;
  /** Finished placements. A seed rating shown as fact next to someone who has
      never played is a number the app is inventing about them. */
  placed: boolean;
  pending: boolean;
  /** True when THEY asked YOU: your side of a pending row has a button. */
  incoming: boolean;
  /** The mask from their locker, so the lobby can show your friends' real
      faces instead of a row of identical placeholders. Null until they pick
      one. Public by nature: it is what they wear on camera in front of
      spectators. */
  mask: string | null;
}

const pairOf = (a: string, b: string): [string, string] => (a < b ? [a, b] : [b, a]);

/** Account id for a yap name, folded so case and homoglyphs cannot miss.
    The second clause is belt and braces for any row whose fold never got
    written: a friend you cannot find is the worst failure this feature has. */
export async function subForUsername(username: string): Promise<string | null> {
  if (!pool || !ready) return null;
  try {
    const res = await pool.query(
      `SELECT sub FROM accounts
       WHERE username_fold = $1 OR (username_fold IS NULL AND lower(username) = lower($2))
       LIMIT 1`,
      [foldName(username), username],
    );
    return res.rowCount === 1 ? (res.rows[0].sub as string) : null;
  } catch (err) {
    console.error('[store] subForUsername failed:', err);
    return null;
  }
}

/** Send (or auto-accept) a friend request by username. Asking someone who
    already asked you just makes you friends: a request you both sent is a
    friendship, and making the second person wait for a button would be silly. */
export async function requestFriend(
  sub: string,
  username: string,
): Promise<'ok' | 'accepted' | 'self' | 'no_user' | 'already' | 'down'> {
  if (!pool || !ready) return 'down';
  try {
    const other = await subForUsername(username);
    if (!other) return 'no_user';
    if (other === sub) return 'self';
    const [lo, hi] = pairOf(sub, other);
    const cur = await pool.query(
      `SELECT status, asked_by FROM friends WHERE lo_sub = $1 AND hi_sub = $2`,
      [lo, hi],
    );
    if (cur.rowCount === 1) {
      const row = cur.rows[0] as { status: string; asked_by: string };
      if (row.status === 'accepted') return 'already';
      if (row.asked_by === sub) return 'already';
      // Only accept a row that is still pending and still theirs to accept:
      // between the read and the write they may have cancelled it.
      const upd = await pool.query(
        `UPDATE friends SET status = 'accepted'
         WHERE lo_sub = $1 AND hi_sub = $2 AND status = 'pending' AND asked_by <> $3`,
        [lo, hi, sub],
      );
      if (upd.rowCount !== 1) return 'already';
      event('friend_accepted');
      return 'accepted';
    }
    // Two people can press add on each other in the same second. Without this
    // the loser of that race hits the primary key and gets told the store is
    // down, which is both wrong and unfixable by retrying.
    const ins = await pool.query(
      `INSERT INTO friends (lo_sub, hi_sub, status, asked_by) VALUES ($1,$2,'pending',$3)
       ON CONFLICT (lo_sub, hi_sub) DO NOTHING`,
      [lo, hi, sub],
    );
    if (ins.rowCount === 0) {
      // They got there first, so their pending row exists: accept it instead.
      const upd = await pool.query(
        `UPDATE friends SET status = 'accepted'
         WHERE lo_sub = $1 AND hi_sub = $2 AND status = 'pending' AND asked_by <> $3`,
        [lo, hi, sub],
      );
      return upd.rowCount === 1 ? 'accepted' : 'already';
    }
    event('friend_requested');
    return 'ok';
  } catch (err) {
    console.error('[store] requestFriend failed:', err);
    return 'down';
  }
}

/** What a write to the friends table did. 'down' has to be distinguishable
    from 'no_user': telling someone their friend does not exist because our
    database blinked is a lie the user cannot debug. */
export type FriendWrite = 'ok' | 'no_user' | 'nothing' | 'down';

/** Accept a pending request. Only the person who did NOT ask can accept. */
export async function acceptFriend(sub: string, username: string): Promise<FriendWrite> {
  if (!pool || !ready) return 'down';
  try {
    const other = await subForUsername(username);
    if (!other) return 'no_user';
    const [lo, hi] = pairOf(sub, other);
    const res = await pool.query(
      `UPDATE friends SET status = 'accepted'
       WHERE lo_sub = $1 AND hi_sub = $2 AND status = 'pending' AND asked_by <> $3`,
      [lo, hi, sub],
    );
    if (res.rowCount === 1) event('friend_accepted');
    return res.rowCount === 1 ? 'ok' : 'nothing';
  } catch (err) {
    console.error('[store] acceptFriend failed:', err);
    return 'down';
  }
}

/** Remove a friend, decline a request, or cancel one you sent: all one row. */
export async function removeFriend(sub: string, username: string): Promise<FriendWrite> {
  if (!pool || !ready) return 'down';
  try {
    const other = await subForUsername(username);
    if (!other) return 'no_user';
    const [lo, hi] = pairOf(sub, other);
    const res = await pool.query(`DELETE FROM friends WHERE lo_sub = $1 AND hi_sub = $2`, [lo, hi]);
    return (res.rowCount ?? 0) > 0 ? 'ok' : 'nothing';
  } catch (err) {
    console.error('[store] removeFriend failed:', err);
    return 'down';
  }
}

/** Everyone attached to you: accepted friends and both directions of pending.
    Returns null when the store is unreachable, because an empty array renders
    as the cheerful "nobody here yet" empty state and makes a database blip
    look like you have no friends. */
export async function listFriends(sub: string): Promise<FriendRow[] | null> {
  if (!pool || !ready) return null;
  try {
    const res = await pool.query(
      `SELECT f.status, f.asked_by, a.sub AS other, a.username, a.player_id, a.mask,
              p.rating, COALESCE(p.wins, 0) + COALESCE(p.losses, 0) AS games
       FROM friends f
       JOIN accounts a ON a.sub = CASE WHEN f.lo_sub = $1 THEN f.hi_sub ELSE f.lo_sub END
       LEFT JOIN players p ON p.id = a.player_id
       WHERE (f.lo_sub = $1 OR f.hi_sub = $1) AND a.username IS NOT NULL
       ORDER BY a.username ASC
       LIMIT 200`,
      [sub],
    );
    return res.rows.map(
      (r: {
        status: string;
        asked_by: string;
        other: string;
        username: string;
        player_id: string;
        mask: string | null;
        rating: number | null;
        games: string | number | null;
      }) => ({
        sub: r.other,
        username: r.username,
        playerId: r.player_id,
        mask: r.mask || null,
        rating: r.rating ?? SEED_RATING,
        placed: Number(r.games ?? 0) >= PLACEMENT_MATCHES,
        pending: r.status === 'pending',
        incoming: r.status === 'pending' && r.asked_by !== sub,
      }),
    );
  } catch (err) {
    console.error('[store] listFriends failed:', err);
    return null;
  }
}

// ---- campaign (the bot ladder as levels) ----
// level = the highest bot rank this player may face. 0 = only the tutorial;
// finishing the tutorial reaches 1 (Pip); beating rank r reaches r+1.
// null everywhere means "store down": callers FAIL OPEN — a dead database
// unlocks the ladder rather than bricking training mode.

/** Campaign locks are DORMANT unless CAMPAIGN_LOCKS=on — the same parking
    pattern as DISPUTE_MODE. Progress records either way, so wins earned
    while the ladder is open still count when the locks come back. Read per
    call so tests can flip it without a restart. */
export function campaignLocksOn(): boolean {
  return process.env.CAMPAIGN_LOCKS === 'on';
}

/** Where this player's campaign stands. 0 for a player we've never seen. */
export async function getCampaign(id: string): Promise<number | null> {
  if (!pool || !ready) return null;
  try {
    const res = await pool.query(`SELECT campaign FROM players WHERE id = $1`, [id.slice(0, 64)]);
    return res.rowCount === 1 ? (res.rows[0].campaign as number) : 0;
  } catch (err) {
    console.error('[store] getCampaign failed:', err);
    return null;
  }
}

/** Raise the frontier to `level` (monotonic — replaying old levels never
    lowers it). Returns the resulting level, or null when the store is down. */
export async function advanceCampaign(
  id: string,
  name: string,
  level: number,
): Promise<number | null> {
  if (!pool || !ready) return null;
  try {
    const res = await pool.query(
      `INSERT INTO players (id, name, campaign) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET campaign = GREATEST(players.campaign, $3), updated_at = now()
       RETURNING campaign`,
      [id.slice(0, 64), name.slice(0, 24), level],
    );
    return res.rows[0].campaign as number;
  } catch (err) {
    console.error('[store] advanceCampaign failed:', err);
    return null;
  }
}

// ---- match history ----
// A verdict you can re-open days later, with the transcript still attached so
// the coach can read the actual debate rather than a summary of it.

export interface MatchRow {
  playerId: string;
  mode: 'ranked' | 'custom' | 'bots';
  topic: string;
  mySide: string;
  won: boolean;
  myTotal: number;
  theirTotal: number;
  opponent: string;
  /** Did this move a rating? The bot daily cap reads this back. */
  rated?: boolean;
  verdict: unknown;
  transcript: unknown;
}

export async function saveMatch(m: MatchRow): Promise<void> {
  if (!pool || !ready) return;
  try {
    await pool.query(
      `INSERT INTO matches
         (player_id, mode, topic, my_side, won, my_total, their_total, opponent, rated, verdict, transcript)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        m.playerId.slice(0, 64),
        m.mode,
        m.topic.slice(0, 300),
        m.mySide,
        m.won,
        m.myTotal,
        m.theirTotal,
        m.opponent.slice(0, 24),
        Boolean(m.rated),
        JSON.stringify(m.verdict),
        JSON.stringify(m.transcript),
      ],
    );
  } catch (err) {
    console.error('[store] saveMatch failed:', err);
  }
}

/** The ladder, top N. Only players who have actually placed appear: a
    leaderboard full of 1-0 accounts is noise, and an empty one is worse than
    no leaderboard at all, which is why the bots sit on it too (client-side). */
export async function leaderboard(limit = 10): Promise<Record<string, unknown>[]> {
  if (!pool || !ready) return [];
  try {
    const res = await pool.query(
      `SELECT name, rating, wins, losses FROM players
       WHERE wins + losses >= $2 ORDER BY rating DESC, wins DESC LIMIT $1`,
      [Math.min(limit, 50), PLACEMENT_MATCHES],
    );
    return res.rows;
  } catch (err) {
    console.error('[store] leaderboard failed:', err);
    return [];
  }
}

/** Finished ranked debates, newest first: the home page's proof of life. Only
    the result and the motion — never the transcript, which is not public. */
export async function recentRanked(limit = 6): Promise<Record<string, unknown>[]> {
  if (!pool || !ready) return [];
  try {
    const res = await pool.query(
      `SELECT m.topic, m.my_total AS won_total, m.their_total AS lost_total,
              m.opponent AS loser, p.name AS winner, p.rating AS winner_rating, m.at
       FROM matches m JOIN players p ON p.id = m.player_id
       WHERE m.mode = 'ranked' AND m.won = true
       ORDER BY m.at DESC LIMIT $1`,
      [Math.min(limit, 20)],
    );
    return res.rows;
  } catch (err) {
    console.error('[store] recentRanked failed:', err);
    return [];
  }
}

/** The history list: enough to render rows, without shipping every transcript. */
export async function listMatches(
  playerId: string,
  mode?: string,
): Promise<Record<string, unknown>[]> {
  if (!pool || !ready) return [];
  try {
    const res = mode
      ? await pool.query(
          `SELECT id, mode, topic, my_side, won, my_total, their_total, opponent, at
           FROM matches WHERE player_id = $1 AND mode = $2 ORDER BY at DESC LIMIT 100`,
          [playerId.slice(0, 64), mode],
        )
      : await pool.query(
          `SELECT id, mode, topic, my_side, won, my_total, their_total, opponent, at
           FROM matches WHERE player_id = $1 ORDER BY at DESC LIMIT 100`,
          [playerId.slice(0, 64)],
        );
    return res.rows as Record<string, unknown>[];
  } catch (err) {
    console.error('[store] listMatches failed:', err);
    return [];
  }
}

/** One match in full. Scoped to the owner: you can only re-open your own. */
export async function loadMatch(
  playerId: string,
  id: number,
): Promise<Record<string, unknown> | null> {
  if (!pool || !ready) return null;
  try {
    const res = await pool.query(
      `SELECT id, mode, topic, my_side, won, my_total, their_total, opponent, verdict, transcript, at
       FROM matches WHERE id = $1 AND player_id = $2`,
      [id, playerId.slice(0, 64)],
    );
    return res.rowCount === 1 ? (res.rows[0] as Record<string, unknown>) : null;
  } catch (err) {
    console.error('[store] loadMatch failed:', err);
    return null;
  }
}

// ---- reports ----

export interface ReportRow {
  code: string;
  mode: string;
  reporterName: string;
  reportedName: string;
  reason: string;
  transcript: unknown;
}

/** File a report. false = not recorded (store down) — callers must say so
    rather than pretend it went through. */
export async function saveReport(r: ReportRow): Promise<boolean> {
  if (!pool || !ready) return false;
  try {
    await pool.query(
      `INSERT INTO reports (code, mode, reporter_name, reported_name, reason, transcript)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [r.code, r.mode, r.reporterName.slice(0, 24), r.reportedName.slice(0, 24), r.reason.slice(0, 24), JSON.stringify(r.transcript)],
    );
    return true;
  } catch (err) {
    console.error('[store] saveReport failed:', err);
    return false;
  }
}

/** The review queue, newest first. */
export async function loadReports(limit = 50): Promise<Record<string, unknown>[]> {
  if (!pool || !ready) return [];
  try {
    const res = await pool.query(
      `SELECT id, code, mode, reporter_name, reported_name, reason, transcript, at
       FROM reports ORDER BY at DESC LIMIT $1`,
      [Math.min(200, Math.max(1, limit))],
    );
    return res.rows as Record<string, unknown>[];
  } catch (err) {
    console.error('[store] loadReports failed:', err);
    return [];
  }
}

export async function loadCard(id: string): Promise<Card | null> {
  if (!pool || !ready || !ID_RE.test(id)) return null;
  try {
    const res = await pool.query('SELECT payload FROM cards WHERE id = $1', [id]);
    if (res.rowCount !== 1) return null;
    return sanitizeCard(res.rows[0].payload);
  } catch (err) {
    console.error('[store] loadCard failed:', err);
    event('store_read_failed');
    return null;
  }
}
