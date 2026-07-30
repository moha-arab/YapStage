// Ship uncaught client errors to the server so breakage on someone's phone
// shows up in the logs without them having to report it. Deduped and capped
// per session; never blocks or throws.
const seen = new Set<string>();
let sent = 0;

function ship(msg: string, stack?: string): void {
  const key = msg.slice(0, 120);
  if (sent >= 5 || seen.has(key)) return;
  seen.add(key);
  sent += 1;
  void fetch('/client-error', {
    method: 'POST',
    keepalive: true,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      msg: msg.slice(0, 500),
      stack: (stack ?? '').slice(0, 2000),
      url: window.location.pathname,
      ua: navigator.userAgent.slice(0, 200),
    }),
  }).catch(() => {});
}

export function installErrorBeacon(): void {
  window.addEventListener('error', (e) => {
    ship(String(e.message ?? 'error'), e.error instanceof Error ? e.error.stack : undefined);
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason: unknown = e.reason;
    ship(
      `unhandledrejection: ${String(reason).slice(0, 300)}`,
      reason instanceof Error ? reason.stack : undefined,
    );
  });
}
