// Optional on-screen D-pad (thumb sized, placed in space reserved next to or
// under the board so it never covers the play area).
import type { Rect } from '../core/grid';
import type { Dir } from '../core/types';
import { ICONS, h } from '../ui/dom';

const HOLD_REPEAT_MS = 700;

export class DPad {
  constructor(private readonly root: HTMLElement, onDir: (d: Dir) => void) {
    const dirs: [Dir, string][] = [
      [0, 'up'],
      [3, 'left'],
      [1, 'right'],
      [2, 'down'],
    ];
    root.replaceChildren(
      ...dirs.map(([d, name]) => {
        let timer = 0;
        const b = h('button', { class: `dp dp-${name}`, html: ICONS.arrow, attrs: { 'aria-label': name } });
        b.addEventListener(
          'pointerdown',
          (e) => {
            e.preventDefault();
            e.stopPropagation();
            b.classList.add('down');
            onDir(d);
            // Holding a button keeps sprinting that way.
            clearInterval(timer);
            timer = window.setInterval(() => onDir(d), HOLD_REPEAT_MS);
          },
          { passive: false },
        );
        const up = () => {
          b.classList.remove('down');
          clearInterval(timer);
        };
        b.addEventListener('pointerup', up);
        b.addEventListener('pointercancel', up);
        b.addEventListener('pointerleave', up);
        return b;
      }),
      h('div', { class: 'dp-center' }),
    );
  }

  place(rect: Rect | null, visible: boolean): void {
    const show = visible && !!rect;
    this.root.classList.toggle('hidden', !show);
    if (!show || !rect) return;
    Object.assign(this.root.style, {
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.w}px`,
      height: `${rect.h}px`,
    });
  }
}
