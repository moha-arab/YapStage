import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// The match and verdict sheets stay in the entry stylesheet, in the cascade
// position they had before those screens became lazy chunks (App.tsx). Loaded
// with their chunks they would land AFTER styles.css and lobby.css and start
// winning ties they used to lose.
import './debate.css';
import './verdict.css';
import { LangProvider } from './i18n';
import { installErrorBeacon } from './errbeacon';
import './styles.css';
// The lobby is its own sheet, loaded second so its lb- rules win any tie with
// the older stylesheet. Keeping it separate is also the only reason the home
// rebuild did not have to fight 3800 lines of existing cascade.
import './lobby.css';

installErrorBeacon();

// The Privacy Policy and the Terms live at their own addresses (the server
// answers /privacy and /terms with this same index.html). They are a page to
// read, not the app: no lobby, no socket screens, no warm-up. Lazy, so the
// two long documents never weigh on the lobby's first load.
const Legal = lazy(() => import('./screens/Legal'));
const path = location.pathname.replace(/\/+$/, '');
const legal = path === '/privacy' ? 'privacy' : path === '/terms' ? 'terms' : null;

// Registering a worker is what makes the app installable to a home screen.
// Ours caches nothing on purpose (see public/sw.js) — this must never be the
// reason someone is running a stale build.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // No install prompt, everything else works. Not worth surfacing.
    });
  });
}

// Every screen but the lobby is a lazy chunk (App.tsx). Fetch them all once the
// page has loaded and gone quiet, so pressing go never waits on the network,
// and so a tab that stays open across a deploy already holds every screen
// before the old files are gone from the server. These are the same import()
// calls App makes, so each file is fetched once. A phone that asked to save
// data skips this; its screens load on the tap that needs them.
let warming = 0;
function warmScreens(): void {
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) return;
  const warm = () => {
    // BotSelect is not warmed: the lobby picks bots now, and nothing but a
    // dead branch in App still reaches that screen.
    const loads = [
      () => import('./screens/Debate'),
      () => import('./screens/Verdict'),
      () => import('./screens/GreenRoom'),
      () => import('./screens/Spectate'),
      () => import('./screens/Drill'),
      () => import('./screens/Matches'),
      () => import('./screens/TutorialIntro'),
      () => import('./screens/TutorialDone'),
      () => import('./screens/ClaimName'),
    ];
    warming = loads.length;
    for (const load of loads) {
      // A miss here is harmless: the screen loads again when it is needed.
      load()
        .catch(() => {})
        .finally(() => {
          warming -= 1;
        });
    }
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(warm, { timeout: 4000 });
  else setTimeout(warm, 1500);
}
if (!legal) window.addEventListener('load', warmScreens, { once: true });

// A lazy chunk that will not load almost always means a deploy replaced the
// files this page was built against. Reloading picks up the new build (and a
// finished debate comes back through App's resume). The timestamp stops a
// genuinely broken file from reloading in a loop. A miss during the warm-up
// above never reloads: nobody asked for that screen yet, and yanking the lobby
// out from under someone typing a code would be worse than a slow tap later.
window.addEventListener('vite:preloadError', (event) => {
  if (warming > 0) return;
  try {
    const last = Number(sessionStorage.getItem('yap.chunkReload') ?? 0);
    if (Date.now() - last < 30_000) return;
    sessionStorage.setItem('yap.chunkReload', String(Date.now()));
  } catch {
    // storage blocked: reload anyway, once is better than a blank screen
  }
  event.preventDefault();
  window.location.reload();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LangProvider>
      {legal ? (
        <Suspense fallback={null}>
          <Legal page={legal} />
        </Suspense>
      ) : (
        <App />
      )}
    </LangProvider>
  </StrictMode>,
);
