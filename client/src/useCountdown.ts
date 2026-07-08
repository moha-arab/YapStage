import { useEffect, useState } from 'react';

/**
 * Countdown driven by the SERVER clock. `serverNow` (captured when the server
 * sent the message) gives us the offset between our clock and the server's,
 * so client clock skew is purely cosmetic. Display only — nothing gameplay-
 * relevant may key off this reaching zero; the server drives all transitions.
 */
export function useCountdown(deadline: number | undefined, serverNow: number | undefined): number {
  const [msLeft, setMsLeft] = useState(0);

  useEffect(() => {
    if (deadline === undefined || serverNow === undefined) {
      setMsLeft(0);
      return;
    }
    const offset = serverNow - Date.now();
    const tick = () => setMsLeft(Math.max(0, deadline - (Date.now() + offset)));
    tick();
    const id = setInterval(tick, 100);
    return () => clearInterval(id);
  }, [deadline, serverNow]);

  return msLeft;
}

export function formatClock(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
