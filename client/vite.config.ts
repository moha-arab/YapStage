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
  build: {
    rollupOptions: {
      output: {
        // Split what rarely changes from what changes on every deploy. The app
        // ships several times a day; React, the socket client and the drawn
        // casts (generated files) do not, so a returning phone keeps those
        // cached and only fetches the app code that actually moved.
        manualChunks(id) {
          if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
          if (/node_modules[\\/](socket\.io-client|socket\.io-parser|engine\.io-client|engine\.io-parser|@socket\.io)[\\/]/.test(id)) {
            return 'socket';
          }
          if (/[\\/]src[\\/](cast|botcast)\.ts$/.test(id)) return 'cast';
          return undefined;
        },
      },
    },
  },
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
