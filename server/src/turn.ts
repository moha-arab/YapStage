import type { IceServer } from './protocol.js';

// Cloudflare Realtime TURN: the server mints short-lived relay credentials
// from a long-term key (CF_TURN_KEY_ID + CF_TURN_API_TOKEN, server-side only).
// Docs: https://developers.cloudflare.com/realtime/turn/generate-credentials/
const CF_ENDPOINT = (keyId: string) =>
  `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`;

const TTL_SECONDS = 86_400; // 24h per mint (Cloudflare max is 48h)
export const REFRESH_MS = 6 * 60 * 60 * 1000; // re-mint every 6h — huge safety margin

function staticServers(): IceServer[] {
  const servers: IceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
  // Legacy static-credential TURN (e.g. metered.ca) still works if configured.
  const urls = (process.env.TURN_URLS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (urls.length > 0 && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    servers.push({
      urls,
      username: process.env.TURN_USERNAME,
      credential: process.env.TURN_CREDENTIAL,
    });
  }
  return servers;
}

let current: IceServer[] = staticServers();
let cloudflareLive = false;
let mintedAt = 0;

// Credentials are minted for 24h; past this age they're likely expired and
// serving them silently degrades relay to nothing. Better to degrade loudly.
const STALE_MS = 20 * 60 * 60 * 1000;

function mintedStale(): boolean {
  return cloudflareLive && Date.now() - mintedAt > STALE_MS;
}

export function getIceServers(): IceServer[] {
  if (mintedStale()) {
    cloudflareLive = false;
    current = staticServers();
    console.error('[turn] minted credentials went stale (refresh failing) — serving fallback');
  }
  return current;
}

export function turnMode(): 'cloudflare' | 'static' | 'stun-only' {
  if (mintedStale()) return current.length > 1 ? 'static' : 'stun-only';
  if (cloudflareLive) return 'cloudflare';
  return current.length > 1 ? 'static' : 'stun-only';
}

export function cloudflareConfigured(): boolean {
  return Boolean(process.env.CF_TURN_KEY_ID && process.env.CF_TURN_API_TOKEN);
}

export async function refreshIceServers(): Promise<void> {
  if (!cloudflareConfigured()) {
    current = staticServers();
    return;
  }
  try {
    const res = await fetch(CF_ENDPOINT(process.env.CF_TURN_KEY_ID!), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.CF_TURN_API_TOKEN!}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl: TTL_SECONDS }),
    });
    if (!res.ok) {
      throw new Error(`Cloudflare TURN API ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const data = (await res.json()) as { iceServers?: unknown };
    // Documented shape is an array of RTCIceServer-like entries (stun entries
    // have no username); tolerate a single object too.
    const raw = Array.isArray(data.iceServers) ? data.iceServers : data.iceServers ? [data.iceServers] : [];
    const minted: IceServer[] = raw
      .filter((s): s is { urls: string | string[]; username?: string; credential?: string } =>
        Boolean(s && typeof s === 'object' && 'urls' in s),
      )
      .map((s) => ({
        urls: s.urls,
        ...(s.username ? { username: s.username, credential: s.credential } : {}),
      }));
    if (minted.length === 0) throw new Error('Cloudflare returned no iceServers');
    current = [...staticServers(), ...minted];
    if (!cloudflareLive) console.log('[turn] Cloudflare TURN credentials active');
    cloudflareLive = true;
    mintedAt = Date.now();
  } catch (err) {
    // A failed refresh must never break lobbies: keep serving the previous
    // credentials (still valid for hours) or fall back to STUN-only. Retry on
    // a short fuse instead of waiting the full 6h interval.
    console.error('[turn] refresh failed:', err);
    if (!cloudflareLive) current = staticServers();
    setTimeout(() => void refreshIceServers(), 10 * 60 * 1000).unref();
  }
}
