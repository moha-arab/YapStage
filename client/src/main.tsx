import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { LangProvider } from './i18n';
import { installErrorBeacon } from './errbeacon';
import './styles.css';

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
