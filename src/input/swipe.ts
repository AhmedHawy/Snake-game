// Swipe input: a turn is emitted as soon as the finger travels past a small
// dead-zone, then the origin resets so one continuous gesture can chain
// several quick turns (e.g. right-then-down) without lifting the finger.
import type { Dir } from '../core/types';

export interface SwipeOptions {
  /** Dead-zone in CSS px (may depend on the current cell size). */
  deadZone: () => number;
  /** `dx`, `dy`: finger travel since the gesture started (picks the U-turn side). */
  onDir: (d: Dir, dx: number, dy: number) => void;
  onTap?: () => void;
}

const TAP_MAX_MS = 250;

export class SwipeInput {
  private id: number | null = null;
  private ox = 0;
  private oy = 0;
  private sx = 0;
  private sy = 0;
  private startMs = 0;
  private moved = false;
  private lastDir: Dir | null = null;

  constructor(private readonly el: HTMLElement, private readonly opts: SwipeOptions) {
    el.addEventListener('pointerdown', this.down, { passive: false });
    el.addEventListener('pointermove', this.move, { passive: false });
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.cancel);
  }

  destroy(): void {
    this.el.removeEventListener('pointerdown', this.down);
    this.el.removeEventListener('pointermove', this.move);
    this.el.removeEventListener('pointerup', this.up);
    this.el.removeEventListener('pointercancel', this.cancel);
  }

  private down = (e: PointerEvent): void => {
    if (this.id !== null) return;
    e.preventDefault();
    this.id = e.pointerId;
    this.ox = this.sx = e.clientX;
    this.oy = this.sy = e.clientY;
    this.startMs = performance.now();
    this.moved = false;
    this.lastDir = null;
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* capture is best-effort */
    }
  };

  private move = (e: PointerEvent): void => {
    if (e.pointerId !== this.id) return;
    e.preventDefault();
    // Coalesced events give the full finger path on fast swipes.
    const pts = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    if (pts.length === 0) this.consume(e.clientX, e.clientY);
    else for (const p of pts) this.consume(p.clientX, p.clientY);
  };

  private consume(x: number, y: number): void {
    const dx = x - this.ox;
    const dy = y - this.oy;
    const dz = this.opts.deadZone();
    if (Math.abs(dx) < dz && Math.abs(dy) < dz) return;
    const dir: Dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0;
    this.ox = x;
    this.oy = y;
    this.moved = true;
    if (dir === this.lastDir) return;
    this.lastDir = dir;
    this.opts.onDir(dir, x - this.sx, y - this.sy);
  }

  private up = (e: PointerEvent): void => {
    if (e.pointerId !== this.id) return;
    this.id = null;
    if (!this.moved && performance.now() - this.startMs < TAP_MAX_MS) this.opts.onTap?.();
  };

  private cancel = (e: PointerEvent): void => {
    if (e.pointerId === this.id) this.id = null;
  };
}
