import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

// Stamped into the bundle so a phone can tell us which build it is running.
// Once the app is installable, "did my fix reach you?" stops being answerable
// by /healthz, which only reports the SERVER commit.
function buildStamp(): string {
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
    },
  },
});
