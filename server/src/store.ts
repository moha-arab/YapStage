// The first thing YapStage ever persists: shared verdict cards.
//
// Deliberately optional. Without DATABASE_URL the app behaves exactly as it did
// before — share links still work, they just carry the whole card in the URL
// instead of an id. That means this can ship before the database exists, and
// adding the database later is a config change with no migration and no
// downtime. Every function here fails soft: a dead database costs you a short
// link, never a debate.
import pg from 'pg';
import type { Card } from './share.js';
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

export async function loadCard(id: string): Promise<Card | null> {
  if (!pool || !ready || !ID_RE.test(id)) return null;
  try {
    const res = await pool.query('SELECT payload FROM cards WHERE id = $1', [id]);
    if (res.rowCount !== 1) return null;
    return res.rows[0].payload as Card;
  } catch (err) {
    console.error('[store] loadCard failed:', err);
    event('store_read_failed');
    return null;
  }
}
