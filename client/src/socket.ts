import { io, type Socket } from 'socket.io-client';
import type { ClientToServer, ServerToClient } from '../../server/src/protocol';

// Deliberately in-memory (not sessionStorage): a page refresh gets a new
// sessionId, so a refreshed tab can never resume a LIVE debate — only
// transient socket reconnects (same page, same memory) can. One exception:
// once a debate has ENDED there is nothing dangerous about resuming, so the
// post-debate boot-resume path (App.tsx) may adopt the pre-refresh id to
// recover a verdict.
export const session: { id: string } = { id: crypto.randomUUID() };

// Same-origin: production is served by the same Fastify process; dev goes
// through the Vite proxy (ws) to :3000.
export const socket: Socket<ServerToClient, ClientToServer> = io();
