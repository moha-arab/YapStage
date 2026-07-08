import { io, type Socket } from 'socket.io-client';
import type { ClientToServer, ServerToClient } from '../../server/src/protocol';

// Deliberately in-memory (not sessionStorage): a page refresh gets a new
// sessionId, so a refreshed tab can never resume a live debate — only
// transient socket reconnects (same page, same memory) can.
export const sessionId: string = crypto.randomUUID();

// Same-origin: production is served by the same Fastify process; dev goes
// through the Vite proxy (ws) to :3000.
export const socket: Socket<ServerToClient, ClientToServer> = io();
