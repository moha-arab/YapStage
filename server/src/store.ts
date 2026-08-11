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
        rating     integer NOT NULL DEFAULT 1000,
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
    await pool.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS username text`);
    // Case-insensitive uniqueness: 'YapKing' and 'yapking' are the same person
    // to everyone reading a scoreboard, so they cannot both exist.
    await pool.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS accounts_username_key ON accounts (lower(username))`,
    );
    // Campaign progress rides the same identity as the ranked ladder.
    await pool.query(
      `ALTER TABLE players ADD COLUMN IF NOT EXISTS campaign integer NOT NULL DEFAULT 0`,
    );
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

/** Standard ELO, K=32. Returns both movements, or null if the store is down. */
export async function applyRankedResult(
  winnerId: string,
  loserId: string,
): Promise<{ winner: { before: number; after: number }; loser: { before: number; after: number } } | null> {
  if (!pool || !ready) return null;
  try {
    const res = await pool.query(`SELECT id, rating FROM players WHERE id = ANY($1)`, [
      [winnerId, loserId],
    ]);
    const ratings = new Map(res.rows.map((r: { id: string; rating: number }) => [r.id, r.rating]));
    const rw = ratings.get(winnerId) ?? 1000;
    const rl = ratings.get(loserId) ?? 1000;
    const expected = 1 / (1 + Math.pow(10, (rl - rw) / 400));
    const delta = Math.max(1, Math.round(32 * (1 - expected)));
    const after = { winner: rw + delta, loser: Math.max(0, rl - delta) };
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
      `UPDATE accounts SET username = $2 WHERE sub = $1 AND username IS NULL`,
      [sub, username],
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
