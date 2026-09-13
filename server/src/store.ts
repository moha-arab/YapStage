// Everything YapStage persists: accounts and ratings, match history (the
// verdict, the scores and the debate's transcript, kept for as long as the
// account is), shared verdict cards, friends, reports (with the reported
// debate's transcript, 90 days) and the anti-cheat file (180 days).
//
// Deliberately optional. Without DATABASE_URL the app still runs: debates,
// bots and the judge work, and everything that would be written is simply
// not. Every function here fails soft: a dead database costs you a rating
// update or a share link, never a debate.
import crypto from 'node:crypto';
import pg from 'pg';
import { sanitizeCard, type Card } from './share.js';
import { event } from './stats.js';
import { PACES, foldName, type Pace } from './protocol.js';
import { PLACEMENT_ANCHOR } from './bots.js';
import { stripControl } from './security.js';

let pool: pg.Pool | null = null;

/** Text for a text column: no control characters, no broken surrogate halves
    (security.ts stripControl), then capped. Postgres refuses a NUL outright,
    and one in a debater's words used to fail the whole INSERT. */
const dbText = (s: unknown, max: number): string => stripControl(s).slice(0, max).replace(/[\uD800-\uDBFF]$/, '');

/** JSON for a jsonb column, every string in it cleaned the same way. jsonb
    refuses the NUL escape and half a surrogate pair, and the transcript and
    verdict are words people (and a model quoting them) wrote. */
const dbJson = (v: unknown): string =>
  JSON.stringify(v, (_k, val: unknown) => (typeof val === 'string' ? stripControl(val) : val)) ?? 'null';
let ready = false;

/** Short, unambiguous ids: no I/O/0/1, same alphabet as lobby codes. */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const ID_LEN = 8;
export const ID_RE = new RegExp(`^[${ALPHABET}]{${ID_LEN}}$`);

// A card id is the only thing between a stranger and a card, so it comes
// from the CSPRNG.
function newId(): string {
  let out = '';
  for (let i = 0; i < ID_LEN; i++) {
    out += ALPHABET[crypto.randomInt(ALPHABET.length)];
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
    // A deleted account's flags stay as moderation records with no way back
    // to anyone: the name becomes 'deleted' and the player id NULL.
    await pool.query(`ALTER TABLE cheat_flags ALTER COLUMN player_id DROP NOT NULL`);
    // Every signed-out socket asks "does an account own this device id?"
    // (playerIdOwned) before it may play under it.
    await pool.query(`CREATE INDEX IF NOT EXISTS accounts_player_id ON accounts (player_id)`);
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
    // When the yap name last changed. Null means never: the first claim is a
    // pick, not a change. A name changes once per 30 days (auth.ts /auth/rename).
    await pool.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS username_changed_at timestamptz`);
    // The Google email, verified addresses only (auth.ts verifiedEmail),
    // refreshed on every sign-in. The first accounts table already had this
    // column (blanked 2026-09-12 to 09-13, when only `openid` was asked for),
    // so this is a no-op there and a real add on any table that lacks it.
    // Owner-only: /auth/me and /auth/export read it, nothing public does.
    await pool.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS email text NOT NULL DEFAULT ''`);
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
    // One ladder per pace was his call on 2026-09-04 ("like chess has
    // different elo for different modes") and was reversed on 2026-09-12:
    // ranked is standard only now, so one queue holds everyone. The blitz and
    // long trios stay in the table, untouched, so the decision is cheap to
    // undo; nothing writes to them any more. The original rating/wins/losses
    // trio IS the ladder.
    for (const pace of PACES) {
      if (pace === 'standard') continue;
      const c = paceCols(pace);
      await pool.query(
        `ALTER TABLE players ADD COLUMN IF NOT EXISTS ${c.rating} integer NOT NULL DEFAULT ${SEED_RATING}`,
      );
      await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS ${c.wins} integer NOT NULL DEFAULT 0`);
      await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS ${c.losses} integer NOT NULL DEFAULT 0`);
    }
    // Whether the placement match has set a starting rating. Before this a
    // player was "placed" after three rated games; the backfill below keeps
    // everyone who had got there from being sent to the placement bot.
    await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS placed boolean NOT NULL DEFAULT false`);
    // Match history: the account's own debates, so a verdict is re-openable
    // and the coach can talk about it days later. His call 2026-08-08 (save
    // by default). Since 2026-09-12 a guest's bot and friend games are filed
    // too, under the device id: that is what lets signing in later pick those
    // games up (linkAccount) instead of losing them. A row holds the result,
    // the scores, the judge's feedback, the player's OWN best line and the
    // whole transcript (judge.ts matchRowsFor), which is what coaching on a
    // past match reads. No retention prune: a row lives as long as the
    // account, and deleteAccountData removes the player's own rows. Rows
    // filed 2026-09-12 to 2026-09-13 have an empty transcript.
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
    // Which pace it was played at, which is also which ladder a rated one
    // moved. Everything filed before paces had ladders was standard.
    await pool.query(`ALTER TABLE matches ADD COLUMN IF NOT EXISTS pace text NOT NULL DEFAULT 'standard'`);
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
    await runOnce('placed_from_games', async () => {
      // 2026-09-12: placement became one match against a bot. Anyone who had
      // already finished the old three-match placement keeps their standing
      // instead of being handed a placement game they do not need.
      await pool!.query(`UPDATE players SET placed = true WHERE wins + losses >= 3`);
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
    await runOnce('mask_roster_basic', async () => {
      // The roster turned over again 2026-09-04: goggles, hoodie and wrap came in, the
      // oni and the calavera went to the vault for a later drop. Same rule as
      // last time for a saved locker: the nearest survivor, never a hole.
      await pool!.query(`
        UPDATE accounts SET mask = CASE mask
          WHEN 'calavera' THEN 'luchador'
          WHEN 'oni'      THEN 'ninja'
          ELSE mask END
        WHERE mask IN ('calavera','oni')`);
    });
    await runOnce('mask_roster_ninja', async () => {
      // And once more the same evening: the free set is the ninja plus three
      // drawn to its rule (goggles, hoodie, wrap). The luchador, hockey and
      // domino went to the vault. Every saved one of those becomes the ninja.
      await pool!.query(`
        UPDATE accounts SET mask = 'ninja'
        WHERE mask IN ('luchador','hockey','domino')`);
    });
    await runOnce('mask_roster_six', async () => {
      // 2026-09-09: the free set became six drawn as game skins — ninja, oni,
      // calavera, climber, gamer, huckster. goggles/hoodie/wrap went to the
      // vault; the climber IS the old goggles mask rebuilt, so those wearers
      // follow it. hoodie and wrap fall back to the ninja.
      await pool!.query(`UPDATE accounts SET mask = 'climber' WHERE mask = 'goggles'`);
      await pool!.query(`UPDATE accounts SET mask = 'ninja' WHERE mask IN ('hoodie','wrap')`);
    });
    await runOnce('mask_roster_cast', async () => {
      // 2026-09-12: the roster is the fourteen-character cast (busts, cast.ts).
      // Six of the old masks were redrawn as busts under new names, so their
      // wearers follow them, and the ninja and the climber became Fuma and
      // Crux, busts drawn the same night.
      await pool!.query(`
        UPDATE accounts SET mask = CASE mask
          WHEN 'oni'      THEN 'shuten'
          WHEN 'calavera' THEN 'marisol'
          WHEN 'gamer'    THEN 'quip'
          WHEN 'huckster' THEN 'bally'
          WHEN 'plague'   THEN 'corvin'
          WHEN 'alien'    THEN 'garn'
          WHEN 'ninja'    THEN 'fuma'
          WHEN 'climber'  THEN 'crux'
          ELSE mask END
        WHERE mask IN ('oni','calavera','gamer','huckster','plague','alien','ninja','climber')`);
    });
    // The pre-launch waitlist (2026-08-22 to 2026-09-04) is gone with the
    // page that fed it. It only ever held one test row.
    await runOnce('drop_waitlist', async () => {
      await pool!.query(`DROP TABLE IF EXISTS waitlist`);
    });
    // Reports keep the debate's words as evidence for the review team,
    // disclosed in the UI, for 90 days (pruneRetention).
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
        [id, dbJson(card)],
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

/** One ladder's worth of a player: where they stand and how many games it
    took to get there. */
export interface PaceRating {
  rating: number;
  wins: number;
  losses: number;
}

/** A player's standing on every ladder, plus whether the placement match has
    set their starting rating. Only the standard ladder moves now (ranked is
    standard only, 2026-09-12); the other two are read for older clients and
    stay at the seed. `placed` is one flag for the player, not per pace. */
export type PlayerRow = Record<Pace, PaceRating> & { placed: boolean };

/** The three columns that hold a pace's ladder. Standard is the original
    trio, so its names carry no suffix; the other paces are suffixed. EVERY
    piece of SQL that touches a rating names its columns through here, so no
    pace can be spelled two ways. Unknown input maps to standard: the names
    are interpolated into SQL and must never come from the wire. */
function paceCols(pace: Pace): { rating: string; wins: string; losses: string } {
  const sfx = (PACES as readonly string[]).includes(pace) && pace !== 'standard' ? `_${pace}` : '';
  return { rating: `rating${sfx}`, wins: `wins${sfx}`, losses: `losses${sfx}` };
}

/** Every ladder column plus the placed flag, for a SELECT or RETURNING that
    wants the whole player. */
const LADDER_COLS = `${PACES.map((p) => Object.values(paceCols(p)).join(', ')).join(', ')}, placed`;

/** A player's rating on the ladder a match row was played on (`m.pace`), for
    queries that join matches m against players p. */
const RATING_AT_MATCH_PACE = `CASE m.pace ${PACES.filter((p) => p !== 'standard')
  .map((p) => `WHEN '${p}' THEN p.${paceCols(p).rating}`)
  .join(' ')} ELSE p.${paceCols('standard').rating} END`;

/** Shape a raw players row into per-pace standings. A column that is somehow
    missing reads as a fresh ladder, never as a crash. */
function ladderOf(row: Record<string, unknown>): PlayerRow {
  const out = { placed: row.placed === true } as PlayerRow;
  for (const pace of PACES) {
    const c = paceCols(pace);
    out[pace] = {
      rating: Number(row[c.rating] ?? SEED_RATING),
      wins: Number(row[c.wins] ?? 0),
      losses: Number(row[c.losses] ?? 0),
    };
  }
  return out;
}

/** Fetch (creating if new) a player's ladder row, refreshing their name. */
export async function getPlayer(id: string, name: string): Promise<PlayerRow | null> {
  if (!pool || !ready) return null;
  try {
    const res = await pool.query(
      `INSERT INTO players (id, name) VALUES ($1, $2)
       ON CONFLICT (id) DO UPDATE SET name = $2, updated_at = now()
       RETURNING ${LADDER_COLS}`,
      [id.slice(0, 64), dbText(name, 24)],
    );
    return ladderOf(res.rows[0] as Record<string, unknown>);
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
    const res = await pool.query(`SELECT ${LADDER_COLS} FROM players WHERE id = $1`, [
      id.slice(0, 64),
    ]);
    return res.rowCount === 1 ? ladderOf(res.rows[0] as Record<string, unknown>) : null;
  } catch (err) {
    console.error('[store] getRating failed:', err);
    return null;
  }
}

/** Placement used to be three rated games against humans (chess.com hides
    the rating for 5; three because the pool was tiny). His call 2026-09-12:
    one game against the roster bot nearest 1400 sets the starting rating
    instead, and the rating then swings hard for the first human games. The
    bot game is the ONE exception to bot matches being unrated, and it is one
    shot: `placed` flips on the first verdict and never flips back, so the
    farming and no-witness arguments in CALIBRATION.md still hold. Below is
    how many HUMAN games after placement keep the fast K. */
export const FRESH_GAMES = 5;

/** The placement rating, from the judge's 100-point scorecard: 1400 moved
    by eight points per point of margin (human total minus bot total),
    clamped to [-400, +300]. A dead-even game lands at 1400; a loss by 50 at
    1000, which is Dodger's rung and a fair start for someone Clover beat
    comfortably; a win by 38 or more at 1700, the cap, which
    a bot game must not hand out above. Floored like everything else. */
export function placementRating(margin: number): number {
  const shift = Math.max(-400, Math.min(300, Math.round(margin * 8)));
  return Math.max(RATING_FLOOR, PLACEMENT_ANCHOR + shift);
}

/** Where a new player starts.
    700 was chosen from the bot ladder of the time, not from chess. At 700
    you were a 57% favourite over Pip (650) and a 30% underdog to Cappy (850)
    on the old six-rung ladder, so your first
    rated match is probably a win and not certainly one, which is the right
    prior for someone who has never debated.
    1000 was wrong for a specific reason: 1000 WAS Vivi, rank 3 of 6. Every new
    account was being handed the claim that it could already take half the
    ladder. Chess.com has the same shape as this: its bots start at 250 and a
    self-declared beginner starts at 400, so a newcomer has one rung below them
    and a long way up. */
export const SEED_RATING = 700;

/** A floor, not a kindness. Set against the old ladder, where 500 against
    Pip (650) meant the gentlest bot beat you 70% of the time. On the
    2026-09-12 ladder the floor sits between Nib (200) and Moss (600), so a
    floored player is still a clear favourite over Nib. Everything below it is
    dead space that exists only to humiliate someone. It also plugs the leak: points that fall
    out of the bottom of a pool never come back. */
export const RATING_FLOOR = 500;

/** K shrinks as the system learns you. A freshly placed player swings hard
    (96: one game against a bot is a rough fix, and his words were "the
    rating can fluctuate a lot once they play actual players"), then settles
    through 40 to 24, where a veteran barely moves and cannot be dragged
    around by newcomers. USCF does this with K = 800/(N+m); this is the same
    curve, clamped. `games` counts human games only: the placement match
    never touches wins or losses, so it does not eat one of the fast five. */
function kFor(games: number): number {
  if (games < FRESH_GAMES) return 96;
  if (games < 20) return 40;
  return 24;
}

/** Expected score for A against B, the only thing a rating gap ever means. */
const expected = (a: number, b: number): number => 1 / (1 + Math.pow(10, (b - a) / 400));

/** ELO for a ranked HUMAN match, the thing that moves a rating once a player
    is placed. Bot debates are deliberately unrated (the placement match is
    the one exception, placePlayer below): a bot is a fixed strategy you can
    learn to beat forever, and a bot match has no witness.

    The two players can move by DIFFERENT amounts, which is deliberate and is
    how a settled rating survives a rush of new accounts.

    `pace` is which ladder moves. Ranked is standard only now, so it is
    always 'standard'; the parameter stays because the columns do. */
export async function applyRankedResult(
  winnerId: string,
  loserId: string,
  pace: Pace = 'standard',
): Promise<{ winner: { before: number; after: number }; loser: { before: number; after: number } } | null> {
  if (!pool || !ready) return null;
  // Read-compute-write in ONE transaction with both rows locked. Two results
  // landing together for the same player (two matches finishing in the same
  // second, a forfeit racing a verdict) used to read the same starting
  // rating and write over each other, so one game's points simply vanished.
  // FOR UPDATE makes the second wait for the first to commit and then read
  // what it wrote. The rows are locked in id order, so two transactions
  // locking the same pair from opposite ends cannot deadlock.
  let client: pg.PoolClient | null = null;
  try {
    client = await pool.connect();
    const c = paceCols(pace);
    await client.query('BEGIN');
    const res = await client.query(
      `SELECT id, ${c.rating} AS rating, ${c.wins} AS wins, ${c.losses} AS losses
       FROM players WHERE id = ANY($1) ORDER BY id FOR UPDATE`,
      [[winnerId, loserId]],
    );
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
    // A rated human game places both players too. The queue refuses the
    // unplaced (index.ts queue:join), so this only matters for rows from
    // before the placement match existed, which would otherwise sit
    // unplaced forever, off the leaderboard, however many games they play.
    await client.query(
      `UPDATE players SET ${c.rating} = $2, ${c.wins} = ${c.wins} + 1, placed = true, updated_at = now() WHERE id = $1`,
      [winnerId, after.winner],
    );
    await client.query(
      `UPDATE players SET ${c.rating} = $2, ${c.losses} = ${c.losses} + 1, placed = true, updated_at = now() WHERE id = $1`,
      [loserId, after.loser],
    );
    await client.query('COMMIT');
    return {
      winner: { before: rw, after: after.winner },
      loser: { before: rl, after: after.loser },
    };
  } catch (err) {
    await client?.query('ROLLBACK').catch(() => {});
    console.error('[store] applyRankedResult failed:', err);
    return null;
  } finally {
    client?.release();
  }
}

/** The placement match landed: set the starting rating from the margin and
    mark the player placed. ONE SHOT, enforced in the statement itself: the
    write only happens WHERE placed = false, so two placement games racing
    (two tabs), a re-run verdict or a replayed socket cannot move a rating
    twice. Wins and losses are untouched: the K schedule counts human games
    and this was not one. Returns the rating set, or null when nothing was
    written (already placed, or the store is down). */
export async function placePlayer(id: string, name: string, margin: number): Promise<number | null> {
  if (!pool || !ready) return null;
  try {
    const rating = placementRating(margin);
    const res = await pool.query(
      `INSERT INTO players (id, name, rating, placed) VALUES ($1, $2, $3, true)
       ON CONFLICT (id) DO UPDATE SET rating = $3, placed = true, name = $2, updated_at = now()
       WHERE players.placed = false
       RETURNING rating`,
      [id.slice(0, 64), dbText(name, 24), rating],
    );
    return res.rowCount === 1 ? Number(res.rows[0].rating) : null;
  } catch (err) {
    console.error('[store] placePlayer failed:', err);
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

export interface Locker {
  mask: string | null;
  maskDefault: boolean;
  /** The current yap name, from the row. Absent when the store is down or the
      row is gone, so a caller can tell "unknown" from "no name yet". */
  username?: string | null;
  /** When the name last changed; null if it never has. */
  nameChangedAt?: Date | null;
  /** The store answered and there is no such account: it was deleted, and
      whatever cookie asked is a leftover. Never set when the store is down. */
  missing?: boolean;
  /** The verified Google email, or null. OWNER ONLY: /auth/me hands it to
      its own session for Settings. The socket bind in index.ts copies the
      mask fields by name and must never spread this object. */
  email?: string | null;
}

/** The locker: your chosen mask, and whether you want it INSTEAD of a camera
    by default. Ranked ignores the second flag (always masked). It reads back
    the current yap name too, in the same query: the session cookie only knows
    the name it was signed with, so after a rename on another device this row
    is the truth (auth.ts /auth/me, and the socket bind in index.ts). */
export async function getLocker(sub: string): Promise<Locker> {
  if (!pool || !ready) return { mask: null, maskDefault: false };
  try {
    const r = await pool.query(
      `SELECT mask, mask_default, username, username_changed_at, email FROM accounts WHERE sub = $1`,
      [sub],
    );
    if (r.rowCount !== 1) return { mask: null, maskDefault: false, missing: true };
    const row = r.rows[0];
    return {
      mask: (row.mask as string) || null,
      maskDefault: Boolean(row.mask_default),
      username: (row.username as string) || null,
      nameChangedAt: row.username_changed_at ? new Date(row.username_changed_at as string | Date) : null,
      email: (row.email as string) || null,
    };
  } catch {
    return { mask: null, maskDefault: false };
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

/** The drill streak a guest kept on the device (client/src/guest.ts), sent
    along with the claim at sign-in so the account picks it up where the
    device left off. Trusted once, capped by auth.ts, and only if it is still
    alive; nothing ranks on a streak, so a forged one cheats nobody but its
    owner. */
export interface CarriedDrill {
  last: string;
  streak: number;
  best: number;
}

/** The calendar day before `day` (UTC, the same clock the drill runs on). */
function dayBefore(day: string): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() - 86_400_000).toISOString().slice(0, 10);
}

/** A carried streak is worth keeping only if it has not already lapsed. */
function aliveDrill(d: CarriedDrill | null, day: string): CarriedDrill | null {
  if (!d || (d.last !== day && d.last !== dayBefore(day))) return null;
  return d;
}

/** Whether a claimed device id may be adopted at all. Two rules, both about
    the family laptop: an id another account already owns is refused (two
    accounts on one player row would share a rating, a campaign and a match
    history), and so is a canonical acct_ id, which is never a guest's. */
async function adoptable(claim: string | null): Promise<string | null> {
  if (!claim || claim.startsWith('acct_')) return null;
  const owned = await pool!.query(`SELECT 1 FROM accounts WHERE player_id = $1`, [claim]);
  return owned.rowCount ? null : claim;
}

/** Whether an account owns this player id, asked for every id a signed-out
    socket wants to play under (index.ts). false: nobody owns it (or there is
    no database, so nothing will be written under it anyway). true: an
    account does, and a guest must never play, file or rate under it. null:
    the question could not be answered, which the caller treats as owned. */
export async function playerIdOwned(id: string): Promise<boolean | null> {
  if (!pool || !ready) return false;
  try {
    const r = await pool.query(`SELECT 1 FROM accounts WHERE player_id = $1 LIMIT 1`, [id.slice(0, 64)]);
    return (r.rowCount ?? 0) > 0;
  } catch (err) {
    console.error('[store] playerIdOwned failed');
    return null;
  }
}

/** A returning account on a device that played as a guest first: move what
    the guest id earned onto the account's own row, in one transaction. Bot
    and friend matches are re-keyed, the campaign takes the higher level, and
    the carried streak fills an account that never had one. The rating is
    left alone on purpose: ranked is account-only wherever sign-in exists, so
    a guest id carrying one means a deployment without Google, and that is
    not a ladder this account stood on. The guest row itself stays; the
    device adopts the account id on the next /auth/me and never uses it again. */
async function mergeGuest(
  claim: string,
  mine: string,
  sub: string,
  drill: CarriedDrill | null,
): Promise<void> {
  const client = await pool!.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE matches SET player_id = $2 WHERE player_id = $1`, [claim, mine]);
    await client.query(
      `UPDATE players SET campaign = GREATEST(campaign, COALESCE((SELECT campaign FROM players WHERE id = $1), 0)),
              updated_at = now()
       WHERE id = $2`,
      [claim, mine],
    );
    if (drill) {
      await client.query(
        `UPDATE accounts SET drill_last = $2, drill_streak = $3, drill_best = $4
         WHERE sub = $1 AND drill_last IS NULL`,
        [sub, drill.last, drill.streak, drill.best],
      );
    }
    await client.query('COMMIT');
    event('guest_merged');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Sign-in. An account row keeps two things from Google: the `sub`, which
    IS the account, and the email, only when Google says it is verified
    (auth.ts verifiedEmail; '' otherwise). The email is rewritten on every
    sign-in, so a changed address follows and an unverified one never
    lingers. The Google name and picture are not requested (no `profile`
    scope since 2026-09-12), and whatever an older build stored in those
    columns is blanked here. */
export async function linkAccount(p: {
  sub: string;
  claimPlayerId: string | null;
  /** Today, for judging whether a carried streak is still alive. */
  day: string;
  drill: CarriedDrill | null;
  /** The verified email, or '' for none. */
  email: string;
}): Promise<AccountRow | null> {
  if (!pool || !ready) return null;
  const email = p.email.slice(0, 254);
  try {
    const claim = await adoptable(p.claimPlayerId);
    const drill = aliveDrill(p.drill, p.day);
    const existing = await pool.query(
      `SELECT player_id, name, username FROM accounts WHERE sub = $1`,
      [p.sub],
    );
    if (existing.rowCount === 1) {
      // Returning user: keep the canonical player row, refresh the email,
      // and blank any Google name or picture an older build stored.
      const mine = existing.rows[0].player_id as string;
      await pool.query(
        `UPDATE accounts SET email = $2, name = '', picture = '', seen_at = now() WHERE sub = $1`,
        [p.sub, email],
      );
      // Played here as a guest before signing in (a new laptop, a cleared
      // browser): that progress follows the account too, not only what was
      // earned on the very first device. A merge that fails costs the guest
      // games, never the sign-in.
      if (claim && claim !== mine) {
        await mergeGuest(claim, mine, p.sub, drill).catch((err) =>
          console.error('[store] guest merge failed:', err),
        );
      }
      return {
        sub: p.sub,
        playerId: mine,
        name: (existing.rows[0].username as string) || '',
        username: (existing.rows[0].username as string) || null,
      };
    }
    // First sign-in: adopt this device's progress rather than starting over.
    // The players row (campaign, and every match filed under it) is kept as
    // is; the streak the device kept becomes the account's. A brand new row
    // is called 'player' until the yap name is claimed.
    const playerId = claim || `acct_${p.sub}`;
    await pool.query(
      `INSERT INTO players (id, name) VALUES ($1, 'player') ON CONFLICT (id) DO NOTHING`,
      [playerId],
    );
    await pool.query(
      `INSERT INTO accounts (sub, player_id, email, drill_last, drill_streak, drill_best)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (sub) DO NOTHING`,
      [p.sub, playerId, email, drill?.last ?? null, drill?.streak ?? 0, drill?.best ?? 0],
    );
    event('account_created', { adopted: Boolean(claim), streak: drill?.streak ?? 0 });
    return { sub: p.sub, playerId, name: '', username: null };
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

export type RenameOutcome =
  | { status: 'ok'; changedAt: Date }
  | { status: 'too_soon'; changedAt: Date }
  | { status: 'taken' | 'same' | 'unclaimed' | 'down' };

/** Change a claimed yap name, at most once per `minGapMs`. Names used to be
    permanent (claimUsername above); they change now, but slowly, so a name is
    still an identity people can recognise. The same unique index referees
    as for a claim, so 'taken' is a normal answer. The ladder row follows the
    new name; past matches do not (each match row keeps its opponent's name
    as text), so receipts stay as they were played. The row is locked for the
    check-then-write, so two tabs renaming at once cannot both slip under the
    30-day rule. */
export async function renameUsername(
  sub: string,
  username: string,
  minGapMs: number,
): Promise<RenameOutcome> {
  if (!pool || !ready) return { status: 'down' };
  let client: pg.PoolClient;
  try {
    client = await pool.connect();
  } catch (err) {
    console.error('[store] renameUsername connect failed:', err);
    return { status: 'down' };
  }
  try {
    await client.query('BEGIN');
    const cur = await client.query(
      `SELECT username, username_changed_at, player_id FROM accounts WHERE sub = $1 FOR UPDATE`,
      [sub],
    );
    const row = cur.rows[0] as
      | { username: string | null; username_changed_at: Date | string | null; player_id: string }
      | undefined;
    if (!row || !row.username) {
      await client.query('ROLLBACK');
      return { status: 'unclaimed' };
    }
    const last = row.username_changed_at ? new Date(row.username_changed_at) : null;
    if (last && Date.now() - last.getTime() < minGapMs) {
      await client.query('ROLLBACK');
      return { status: 'too_soon', changedAt: last };
    }
    if (row.username === username) {
      await client.query('ROLLBACK');
      return { status: 'same' };
    }
    const upd = await client.query(
      `UPDATE accounts SET username = $2, username_fold = $3, username_changed_at = now()
       WHERE sub = $1 RETURNING username_changed_at`,
      [sub, username, foldName(username)],
    );
    // The ladder row shows this name too, so keep the two in step.
    await client.query(`UPDATE players SET name = $2 WHERE id = $1`, [row.player_id, username]);
    await client.query('COMMIT');
    event('username_changed');
    return { status: 'ok', changedAt: new Date(upd.rows[0].username_changed_at as string | Date) };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    // 23505 = unique violation: somebody already has that name (or its fold).
    if ((err as { code?: string })?.code === '23505') return { status: 'taken' };
    console.error('[store] renameUsername failed:', err);
    return { status: 'down' };
  } finally {
    client.release();
  }
}

export type DeleteOutcome =
  | { status: 'ok'; removed: Record<string, number> }
  | { status: 'missing' | 'unclaimed' | 'mismatch' | 'down' };

/** Delete an account and everything filed under it, in one transaction, after
    checking the typed confirmation against the name (by fold, so case and
    lookalike letters do not matter). What goes and what stays:
      accounts     the row (Google account id, verified email, yap name, drill
                   streak, locker)
      friends      every row with this sub on either side
      matches      this player's own copies, transcripts included; OTHER
                   players' copies of the same debates are theirs and stay,
                   with the transcript. In other players' ranked rows the
                   opponent name becomes 'deleted' (reserved, so nobody can
                   hold it). Ranked is account-only, so a ranked opponent name
                   is an account's; friend and bot rows are name-only text and
                   a guest may have typed the same name, so they are left.
      players      the canonical row (ratings, campaign, leaderboard entry)
      cheat_flags  kept as moderation records, name scrubbed to 'deleted' and
                   the player id set to NULL; what is left is a room code, a
                   score and speech-timing numbers
      cards        every share card that names this username: the name becomes
                   'deleted' and that side's quote (and settle-it account) goes
    `reports` hold names and the reported debate's transcript, never an id;
    they are kept for review and expire after 90 days (pruneRetention). */
export async function deleteAccountData(sub: string, confirmFold: string): Promise<DeleteOutcome> {
  if (!pool || !ready) return { status: 'down' };
  let client: pg.PoolClient;
  try {
    client = await pool.connect();
  } catch (err) {
    console.error('[store] deleteAccountData connect failed:', err);
    return { status: 'down' };
  }
  try {
    await client.query('BEGIN');
    const cur = await client.query(
      `SELECT player_id, username, username_fold FROM accounts WHERE sub = $1 FOR UPDATE`,
      [sub],
    );
    const row = cur.rows[0] as
      | { player_id: string; username: string | null; username_fold: string | null }
      | undefined;
    if (!row) {
      await client.query('ROLLBACK');
      return { status: 'missing' };
    }
    if (!row.username) {
      await client.query('ROLLBACK');
      return { status: 'unclaimed' };
    }
    if ((row.username_fold || foldName(row.username)) !== confirmFold) {
      await client.query('ROLLBACK');
      return { status: 'mismatch' };
    }
    const pid = row.player_id;
    // adoptable() stops two accounts sharing a player row, but never delete a
    // rating and a history that a second account still stands on.
    const shared = await client.query(
      `SELECT 1 FROM accounts WHERE player_id = $1 AND sub <> $2 LIMIT 1`,
      [pid, sub],
    );
    const ownsPlayer = shared.rowCount === 0;

    const removed: Record<string, number> = {};
    const run = async (label: string, sql: string, params: unknown[]) => {
      const r = await client.query(sql, params);
      removed[label] = r.rowCount ?? 0;
    };
    await run('friends', `DELETE FROM friends WHERE lo_sub = $1 OR hi_sub = $1`, [sub]);
    if (ownsPlayer) {
      await run('matches', `DELETE FROM matches WHERE player_id = $1`, [pid]);
      await run(
        'cheat_flags_scrubbed',
        `UPDATE cheat_flags SET name = 'deleted', player_id = NULL WHERE player_id = $1`,
        [pid],
      );
      await run('players', `DELETE FROM players WHERE id = $1`, [pid]);
    }
    // After this player's own rows are gone, so only other players' copies
    // match. The home page's recent-ranked feed shows this name as the loser.
    await run(
      'opponent_renamed',
      `UPDATE matches SET opponent = 'deleted' WHERE mode = 'ranked' AND opponent = $1`,
      [row.username],
    );
    // Share cards carry names, not ids. A card's FOR side is `a` (quote qa,
    // settle-it account rl.sa), its AGAINST side `b` (qb, rl.sb).
    await run(
      'cards_scrubbed_for',
      `UPDATE cards SET payload = jsonb_set((payload - 'qa') #- '{rl,sa}', '{a}', '"deleted"')
       WHERE payload->>'a' = $1`,
      [row.username],
    );
    await run(
      'cards_scrubbed_against',
      `UPDATE cards SET payload = jsonb_set((payload - 'qb') #- '{rl,sb}', '{b}', '"deleted"')
       WHERE payload->>'b' = $1`,
      [row.username],
    );
    await run('accounts', `DELETE FROM accounts WHERE sub = $1`, [sub]);
    await client.query('COMMIT');
    event('account_deleted', removed);
    return { status: 'ok', removed };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[store] deleteAccountData failed:', err);
    return { status: 'down' };
  } finally {
    client.release();
  }
}

/** One friend as the export shows them: their yap name and where the
    request stands. Never their sub or player id. */
export interface ExportFriend {
  username: string;
  status: 'friends' | 'request_sent' | 'request_received';
}

export interface AccountExport {
  exportedAt: string;
  about: string;
  account: {
    googleAccountId: string;
    playerId: string;
    username: string | null;
    usernameChangedAt: string | null;
    email: string | null;
    createdAt: string | null;
    lastSignInAt: string | null;
    mask: string | null;
    maskDefault: boolean;
    drill: { lastDay: string | null; streak: number; best: number };
  };
  ladder: {
    name: string;
    placed: boolean;
    botLadderLevel: number;
    ratings: Record<Pace, PaceRating>;
    updatedAt: string | null;
  } | null;
  matches: Record<string, unknown>[];
  friends: ExportFriend[];
}

/** A timestamp column as ISO, whatever shape pg handed back. */
function isoOf(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString();
  return typeof v === 'string' && v ? v : null;
}

/** A `date` column as YYYY-MM-DD. No type parser is set, so pg returns a
    Date at LOCAL midnight; reading it back in local parts gives the day
    that was stored. */
function dayOf(v: unknown): string | null {
  if (v instanceof Date) {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  return typeof v === 'string' && v ? v.slice(0, 10) : null;
}

/** Download my data (auth.ts /auth/export): everything filed under one
    account, read fresh. Keyed by the session's sub; the player id comes from
    the account row, never from the wire.
      IN   the account row (Google account id, player id, yap name and when
           it changed, the verified email, created and last sign-in times,
           mask, drill streak and best), the ladder row (every pace, the
           placement flag, the bot ladder level), every match copy that is
           theirs with its verdict and FULL transcript, and friends as the
           other person's yap name plus the state of the request.
      OUT  anyone else's sub or player id (friends are names; a match names
           its opponent as text), username_fold (a lookup key derived from
           the name), the name and picture columns (blank since 2026-09-12),
           reports and cheat flags (they are keyed by name, not account, and
           the privacy page says to email for them), and share cards (public
           pages, keyed by name).
    The opponent's best line is blanked in each verdict, as loadMatch does.
    'missing': the store answered and there is no such account. null: the
    store is down. */
export async function exportAccountData(sub: string): Promise<AccountExport | 'missing' | null> {
  if (!pool || !ready) return null;
  try {
    const a = await pool.query(
      `SELECT sub, player_id, email, username, username_changed_at, created_at, seen_at, mask, mask_default, drill_last, drill_streak, drill_best FROM accounts WHERE sub = $1`,
      [sub],
    );
    if (a.rowCount !== 1) return 'missing';
    const acct = a.rows[0] as Record<string, unknown>;
    const pid = String(acct.player_id);

    const p = await pool.query(`SELECT name, campaign, ${LADDER_COLS}, updated_at FROM players WHERE id = $1`, [pid]);
    const prow = p.rows[0] as Record<string, unknown> | undefined;
    let ladder: AccountExport['ladder'] = null;
    if (prow) {
      const { placed, ...ratings } = ladderOf(prow);
      ladder = {
        name: String(prow.name ?? ''),
        placed,
        botLadderLevel: Number(prow.campaign ?? 0),
        ratings: ratings as Record<Pace, PaceRating>,
        updatedAt: isoOf(prow.updated_at),
      };
    }

    const m = await pool.query(
      `SELECT id, mode, pace, topic, my_side, won, my_total, their_total, opponent, rated, verdict, transcript, at FROM matches WHERE player_id = $1 ORDER BY at ASC`,
      [pid],
    );
    const matches = (m.rows as Record<string, unknown>[]).map((r) => {
      const verdict = (r.verdict ?? {}) as { bestQuote?: Record<string, unknown> };
      const theirs = r.my_side === 'FOR' ? 'AGAINST' : 'FOR';
      if (verdict.bestQuote && typeof verdict.bestQuote === 'object') {
        verdict.bestQuote = { ...verdict.bestQuote, [theirs]: '' };
      }
      return {
        id: r.id,
        playedAt: isoOf(r.at),
        mode: r.mode,
        pace: r.pace,
        motion: r.topic,
        yourSide: r.my_side,
        won: r.won,
        yourScore: r.my_total,
        theirScore: r.their_total,
        opponent: r.opponent,
        rated: r.rated,
        verdict,
        transcript: Array.isArray(r.transcript) ? r.transcript : [],
      };
    });

    // asked_by is compared here and never leaves: it is somebody's sub.
    const f = await pool.query(
      `SELECT f.status, f.asked_by, a.username
       FROM friends f
       JOIN accounts a ON a.sub = CASE WHEN f.lo_sub = $1 THEN f.hi_sub ELSE f.lo_sub END
       WHERE (f.lo_sub = $1 OR f.hi_sub = $1) AND a.username IS NOT NULL
       ORDER BY a.username ASC`,
      [sub],
    );
    const friends: ExportFriend[] = (f.rows as { status: string; asked_by: string; username: string }[]).map((r) => ({
      username: r.username,
      status: r.status === 'accepted' ? 'friends' : r.asked_by === sub ? 'request_sent' : 'request_received',
    }));

    return {
      exportedAt: new Date().toISOString(),
      about:
        'Everything YapStage keeps under your account. Reports and fair-play records are not included; email the address on the privacy page for those.',
      account: {
        googleAccountId: String(acct.sub),
        playerId: pid,
        username: (acct.username as string) || null,
        usernameChangedAt: isoOf(acct.username_changed_at),
        email: (acct.email as string) || null,
        createdAt: isoOf(acct.created_at),
        lastSignInAt: isoOf(acct.seen_at),
        mask: (acct.mask as string) || null,
        maskDefault: Boolean(acct.mask_default),
        drill: {
          lastDay: dayOf(acct.drill_last),
          streak: Number(acct.drill_streak ?? 0),
          best: Number(acct.drill_best ?? 0),
        },
      },
      ladder,
      matches,
      friends,
    };
  } catch (err) {
    console.error('[store] exportAccountData failed:', err);
    return null;
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
    const streak = last === dayBefore(day) ? streakNow + 1 : 1;
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
    // A streak you have already broken should read as broken before you play,
    // not flip to 1 the moment you submit.
    const alive = last === day || last === dayBefore(day);
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
      [f.code.slice(0, 12), f.playerId.slice(0, 64), dbText(f.name, 24), f.score, dbJson(f.signals)],
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
    // One number per face: the standard ladder, the only one ranked plays on.
    const res = await pool.query(
      `SELECT f.status, f.asked_by, a.sub AS other, a.username, a.player_id, a.mask,
              p.rating, COALESCE(p.placed, false) AS placed
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
        placed: boolean | null;
      }) => ({
        sub: r.other,
        username: r.username,
        playerId: r.player_id,
        mask: r.mask || null,
        rating: r.rating ?? SEED_RATING,
        placed: r.placed === true,
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
// finishing the tutorial reaches 1 (Nib); beating rank r reaches r+1.
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
// A verdict you can re-open days later: the result, the scores, the judge's
// feedback, your own best line, and the transcript so the coach can read the
// actual debate rather than a summary of it (see matches above).

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
  /** The pace it was played at, which is also the ladder a rated one moved. */
  pace: Pace;
  verdict: unknown;
  /** The whole debate, both sides: { stepIndex, side, text }[]. */
  transcript: unknown;
}

export async function saveMatch(m: MatchRow): Promise<void> {
  if (!pool || !ready) return;
  try {
    await pool.query(
      `INSERT INTO matches
         (player_id, mode, topic, my_side, won, my_total, their_total, opponent, rated, pace, verdict, transcript)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        m.playerId.slice(0, 64),
        m.mode,
        // A settle-it motion is player-written (debate.ts startDispute).
        dbText(m.topic, 300),
        m.mySide,
        m.won,
        m.myTotal,
        m.theirTotal,
        dbText(m.opponent, 24),
        Boolean(m.rated),
        (PACES as readonly string[]).includes(m.pace) ? m.pace : 'standard',
        dbJson(m.verdict),
        dbJson(Array.isArray(m.transcript) ? m.transcript : []),
      ],
    );
  } catch (err) {
    console.error('[store] saveMatch failed:', err);
  }
}

/** The ladder, top N. Only players who have actually placed appear: a
    leaderboard full of 1-0 accounts is noise, and an empty one is worse than
    no leaderboard at all, which is why the bots sit on it too (client-side). */
export async function leaderboard(
  limit = 10,
  pace: Pace = 'standard',
): Promise<Record<string, unknown>[]> {
  if (!pool || !ready) return [];
  try {
    const c = paceCols(pace);
    const res = await pool.query(
      `SELECT name, ${c.rating} AS rating, ${c.wins} AS wins, ${c.losses} AS losses FROM players
       WHERE placed = true ORDER BY ${c.rating} DESC, ${c.wins} DESC LIMIT $1`,
      [Math.min(limit, 50)],
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
              m.opponent AS loser, p.name AS winner, m.pace,
              ${RATING_AT_MATCH_PACE} AS winner_rating, m.at
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
          `SELECT id, mode, pace, topic, my_side, won, my_total, their_total, opponent, at
           FROM matches WHERE player_id = $1 AND mode = $2 ORDER BY at DESC LIMIT 100`,
          [playerId.slice(0, 64), mode],
        )
      : await pool.query(
          `SELECT id, mode, pace, topic, my_side, won, my_total, their_total, opponent, at
           FROM matches WHERE player_id = $1 ORDER BY at DESC LIMIT 100`,
          [playerId.slice(0, 64)],
        );
    return res.rows as Record<string, unknown>[];
  } catch (err) {
    console.error('[store] listMatches failed:', err);
    return [];
  }
}

/** One match in full, transcript included. Scoped to the owner: you can only
    re-open your own. The opponent's best line is blanked even on a row filed
    before that rule. */
export async function loadMatch(
  playerId: string,
  id: number,
): Promise<Record<string, unknown> | null> {
  if (!pool || !ready) return null;
  try {
    const res = await pool.query(
      `SELECT id, mode, pace, topic, my_side, won, my_total, their_total, opponent, verdict, transcript, at
       FROM matches WHERE id = $1 AND player_id = $2`,
      [id, playerId.slice(0, 64)],
    );
    if (res.rowCount !== 1) return null;
    const row = res.rows[0] as Record<string, unknown>;
    const verdict = (row.verdict ?? {}) as { bestQuote?: Record<string, unknown> };
    const theirs = row.my_side === 'FOR' ? 'AGAINST' : 'FOR';
    if (verdict.bestQuote && typeof verdict.bestQuote === 'object') {
      verdict.bestQuote = { ...verdict.bestQuote, [theirs]: '' };
    }
    return { ...row, verdict, transcript: Array.isArray(row.transcript) ? row.transcript : [] };
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
      [
        r.code,
        r.mode,
        dbText(r.reporterName, 24),
        dbText(r.reportedName, 24),
        dbText(r.reason, 24),
        dbJson(r.transcript),
      ],
    );
    return true;
  } catch (err) {
    console.error('[store] saveReport failed:', err);
    return false;
  }
}

/** Retention, run at boot and daily (index.ts): a report (with the reported
    debate's transcript) lives 90 days, an anti-cheat flag 180. Match history
    is not pruned: it lives as long as the account (deleteAccountData).
    Returns what went, or null when the store is down. */
export async function pruneRetention(): Promise<{ reports: number; cheatFlags: number } | null> {
  if (!pool || !ready) return null;
  try {
    const r = await pool.query(`DELETE FROM reports WHERE at < now() - interval '90 days'`);
    const c = await pool.query(`DELETE FROM cheat_flags WHERE at < now() - interval '180 days'`);
    const out = { reports: r.rowCount ?? 0, cheatFlags: c.rowCount ?? 0 };
    event('retention_pruned', out);
    return out;
  } catch (err) {
    console.error('[store] pruneRetention failed');
    return null;
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
