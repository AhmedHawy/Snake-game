// App lifecycle: auto-pause when hidden / screen off, and Android back
// button handling (native back button in the Capacitor app, a history guard
// in the browser/PWA so a back swipe doesn't leave the game by accident).
import { App as CapApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

export interface LifecycleHandlers {
  onHide: () => void;
  onShow: () => void;
  onBack: () => void;
}

let exiting = false;

export function bindLifecycle(h: LifecycleHandlers): void {
  const vis = () => (document.hidden ? h.onHide() : h.onShow());
  document.addEventListener('visibilitychange', vis);
  window.addEventListener('pagehide', h.onHide);
  window.addEventListener('blur', h.onHide);
  window.addEventListener('focus', h.onShow);

  if (Capacitor.isNativePlatform()) {
    void CapApp.addListener('backButton', () => h.onBack());
    void CapApp.addListener('appStateChange', ({ isActive }) => (isActive ? h.onShow() : h.onHide()));
  } else {
    history.pushState({ snakeGuard: true }, '');
    window.addEventListener('popstate', () => {
      if (exiting) return;
      history.pushState({ snakeGuard: true }, '');
      h.onBack();
    });
  }
}

/** Leaves the app (native) or steps back out of the page (browser/PWA). */
export function exitApp(): void {
  exiting = true;
  if (Capacitor.isNativePlatform()) void CapApp.exitApp();
  else history.go(-2);
}
