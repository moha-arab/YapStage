// Side-effect module: load .env BEFORE any other module initializes. ES module
// imports evaluate in source order, depth-first, so importing this first in
// index.ts guarantees process.env is populated before modules that read env
// vars at load time (e.g. debate.ts's DEBATE_SPEED). Production sets real env
// vars via Railway, where this is a harmless no-op.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../.env') });

// Fast mode shortens every turn to seconds, lifts the room and join rate
// limits, logs transcripts and opens /judge-eval. It is for the smoke suite
// and evals only, and must never serve real players.
if (process.env.DEBATE_SPEED === 'fast' && process.env.NODE_ENV === 'production') {
  console.error('[server] refusing to start: DEBATE_SPEED=fast is test-only and NODE_ENV is production');
  process.exit(1);
}
