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
