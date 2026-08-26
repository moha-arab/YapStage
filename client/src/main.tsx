import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { LangProvider } from './i18n';
import { installErrorBeacon } from './errbeacon';
import './styles.css';
// The lobby is its own sheet, loaded second so its lb- rules win any tie with
// the older stylesheet. Keeping it separate is also the only reason the home
// rebuild did not have to fight 3800 lines of existing cascade.
import './lobby.css';
import './landing-pre.css';

installErrorBeacon();

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LangProvider>
      <App />
    </LangProvider>
  </StrictMode>,
);
