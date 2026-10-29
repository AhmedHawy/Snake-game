// Vibration feedback. Uses navigator.vibrate on the web; inside the Capacitor
// app it goes through the Haptics plugin (Android WebView may ignore
// navigator.vibrate).
import { Capacitor } from '@capacitor/core';
import { Haptics } from '@capacitor/haptics';

let enabled = true;

export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

function vibrate(ms: number, pattern?: number[]): void {
  if (!enabled) return;
  try {
    if (Capacitor.isNativePlatform()) void Haptics.vibrate({ duration: ms });
    else navigator.vibrate?.(pattern ?? ms);
  } catch {
    /* unsupported */
  }
}

export const haptics = {
  eat: () => vibrate(18),
  powerUp: () => vibrate(35),
  bad: () => vibrate(60),
  crash: () => vibrate(220, [90, 40, 160]),
  tap: () => vibrate(8),
};
