// Keyboard controls for desktop testing.
import type { Dir } from '../core/types';

export interface KeyboardHandlers {
  onDir: (d: Dir) => void;
  onPause: () => void;
  onMute: () => void;
}

const DIR_KEYS: Record<string, Dir> = {
  ArrowUp: 0, KeyW: 0,
  ArrowRight: 1, KeyD: 1,
  ArrowDown: 2, KeyS: 2,
  ArrowLeft: 3, KeyA: 3,
};

export function bindKeyboard(h: KeyboardHandlers): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT')) return;
    const d = DIR_KEYS[e.code];
    if (d !== undefined) {
      e.preventDefault();
      h.onDir(d);
    } else if (e.code === 'Escape' || e.code === 'KeyP' || e.code === 'Space') {
      e.preventDefault();
      h.onPause();
    } else if (e.code === 'KeyM') {
      h.onMute();
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}
