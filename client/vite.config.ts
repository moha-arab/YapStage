import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

// Stamped into the bundle so a phone can tell us which build it is running.
// Once the app is installable, "did my fix reach you?" stops being answerable
// by /healthz, which only reports the SERVER commit.
function buildStamp(): string {
  // On Railway the build runs in a container with no git binary, so the SHA has
  // to arrive as an environment variable (see the ARG in the Dockerfile).
  const fromCi = process.env.RAILWAY_GIT_COMMIT_SHA;
  if (fromCi) return fromCi.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig({
  define: {
    __BUILD__: JSON.stringify(buildStamp()),
  },
  plugins: [react()],
  server: {
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
      },
      '/healthz': {
        target: 'http://localhost:3000',
      },
      '/bots': {
        target: 'http://localhost:3000',
      },
      // Watch mode polls these; without the proxy `vite dev` answers 404 and
      // the lobby quietly shows nothing live.
      '/live': {
        target: 'http://localhost:3000',
      },
      '/spectate': {
        target: 'http://localhost:3000',
      },
    },
  },
});
