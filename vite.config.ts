import { defineConfig } from 'vite';

// BASE_PATH is set by the GitHub Pages workflow (e.g. "/Snake-game/").
// Local dev and the Capacitor build use a relative base.
const base = process.env.BASE_PATH || './';

export default defineConfig({
  base,
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
  },
  server: { host: true },
});
