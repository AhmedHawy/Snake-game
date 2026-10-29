import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

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
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null, // registered manually in main.ts (skipped inside the native app)
      includeAssets: ['favicon.png', 'icons/apple-touch-icon.png'],
      manifest: {
        id: 'com.ahmedhawy.snakerush',
        name: 'Snake Rush',
        short_name: 'Snake Rush',
        description: 'A colorful snake game with changing worlds, power-ups and combos.',
        lang: 'ar',
        dir: 'rtl',
        start_url: '.',
        scope: '.',
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'any',
        background_color: '#0f3d1e',
        theme_color: '#0f3d1e',
        categories: ['games', 'kids'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache everything the game needs so it runs fully offline.
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
