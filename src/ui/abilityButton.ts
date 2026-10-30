// Round "breathe" button in a bottom corner of the board: shows the dragon's
// ability icon and stored charges, and fires the ability when pressed.
import { MAX_CHARGES } from '../core/state';
import { h } from './dom';

export class AbilityButton {
  private readonly el: HTMLButtonElement;
  private readonly icon: HTMLElement;
  private readonly pips: HTMLElement[] = [];
  private last = '';

  constructor(root: HTMLElement, onFire: () => void) {
    this.icon = h('span', { class: 'ab-icon' });
    const pipsEl = h('span', { class: 'ab-pips' });
    for (let i = 0; i < MAX_CHARGES; i++) {
      const p = h('i');
      this.pips.push(p);
      pipsEl.append(p);
    }
    this.el = h('button', { class: 'ability-btn hidden', attrs: { 'aria-label': 'ability' } }, this.icon, pipsEl);
    // Fire on press (not click) so it reacts instantly; keep it away from the swipe handler.
    this.el.addEventListener(
      'pointerdown',
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        onFire();
      },
      { passive: false },
    );
    root.append(this.el);
  }

  /** Places the button in the bottom corner of the board, away from the D-pad side. */
  place(board: { x: number; y: number; w: number; h: number }, side: 'left' | 'right'): void {
    const size = Math.round(Math.min(84, Math.max(64, Math.min(board.w, board.h) * 0.18)));
    const m = 14;
    Object.assign(this.el.style, {
      width: `${size}px`,
      height: `${size}px`,
      top: `${board.y + board.h - size - m}px`,
      left: `${side === 'left' ? board.x + m : board.x + board.w - size - m}px`,
    });
  }

  show(visible: boolean): void {
    this.el.classList.toggle('hidden', !visible);
  }

  update(icon: string, color: string, charges: number, strong: boolean): void {
    const key = `${icon}|${charges}|${strong}|${color}`;
    if (key === this.last) return;
    this.el.style.background = `radial-gradient(circle at 35% 30%, rgba(255,255,255,0.55), ${color} 55%, rgba(0,0,0,0.55) 100%), ${color}`;
    const added = charges > Number(this.last.split('|')[1] ?? 0);
    this.last = key;
    this.icon.textContent = icon;
    this.pips.forEach((p, i) => p.classList.toggle('on', i < charges));
    this.el.classList.toggle('empty', charges === 0);
    this.el.classList.toggle('strong', strong && charges > 0);
    if (added) {
      // Little bounce when a charge is gained.
      this.el.classList.remove('charged');
      void this.el.offsetWidth;
      this.el.classList.add('charged');
    }
  }

  /** Shake when pressed with no charge left. */
  denied(): void {
    this.el.classList.remove('denied');
    void this.el.offsetWidth;
    this.el.classList.add('denied');
  }
}
