import '@fontsource/cairo/400.css';
import '@fontsource/cairo/700.css';
import '@fontsource/cairo/900.css';
import './styles.css';
import { Capacitor } from '@capacitor/core';
import { App } from './app';

const app = new App();
app.start();

// Expose the app for debugging/automated checks in dev builds only.
if (import.meta.env.DEV) (window as unknown as { __app: App }).__app = app;

// Offline support for the web/PWA build (the native app bundles its files).
if (!import.meta.env.DEV && !Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
}
