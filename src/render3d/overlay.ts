// DOM overlay on top of the 3D canvas: floating "+points" popups (crisp text,
// correct Arabic shaping), the red crash flash and an edge arrow that points
// to the apple when it is off screen.
import type { Popup } from '../fx/effects';

export interface ScreenPoint {
  x: number;
  y: number;
  /** In front of the camera. */
  visible: boolean;
}

/** Length label above a rival's head. */
export interface RivalTag {
  at: ScreenPoint;
  text: string;
  /** prey = you can eat it, threat = it can eat you, calm = harmless (Zen), ally = your friend. */
  kind: 'prey' | 'threat' | 'calm' | 'ally';
}

export class Overlay {
  private readonly tagPool: HTMLElement[] = [];
  private readonly layer: HTMLElement;
  private readonly flash: HTMLElement;
  private readonly arrow: HTMLElement;
  private readonly pool: HTMLElement[] = [];

  constructor(root: HTMLElement) {
    this.layer = document.createElement('div');
    this.layer.className = 'popups';
    this.flash = document.createElement('div');
    this.flash.className = 'flash';
    this.arrow = document.createElement('div');
    this.arrow.className = 'food-arrow hidden';
    this.arrow.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l8 14H4z"/></svg><span>🍎</span>';
    root.append(this.layer, this.flash, this.arrow);
  }

  tags(list: RivalTag[]): void {
    while (this.tagPool.length < list.length) {
      const el = document.createElement('div');
      this.layer.append(el);
      this.tagPool.push(el);
    }
    this.tagPool.forEach((el, i) => {
      const tg = list[i];
      if (!tg || !tg.at.visible) {
        el.style.display = 'none';
        return;
      }
      el.style.display = 'block';
      const cls = `rival-tag ${tg.kind}`;
      if (el.className !== cls) el.className = cls;
      if (el.textContent !== tg.text) el.textContent = tg.text;
      el.style.transform = `translate(${tg.at.x}px, ${tg.at.y}px) translate(-50%, -100%)`;
    });
  }

  update(
    popups: Popup[],
    project: (x: number, y: number, z: number) => ScreenPoint,
    flash: number,
    apple: ScreenPoint | null,
    rect: { x: number; y: number; w: number; h: number },
    emoji: string,
  ): void {
    while (this.pool.length < popups.length) {
      const el = document.createElement('div');
      el.className = 'popup';
      this.layer.append(el);
      this.pool.push(el);
    }
    this.pool.forEach((el, i) => {
      const p = popups[i];
      if (!p) {
        el.style.display = 'none';
        return;
      }
      const s = project(p.x, p.y, p.z);
      const t = p.age / p.life;
      const scale = t < 0.15 ? 0.6 + (t / 0.15) * 0.6 : t < 0.3 ? 1.2 - ((t - 0.15) / 0.15) * 0.2 : 1;
      el.style.display = s.visible ? 'block' : 'none';
      if (el.textContent !== p.text) el.textContent = p.text;
      el.style.color = p.color;
      el.style.fontSize = `${p.size}px`;
      el.style.opacity = String(t > 0.7 ? (1 - t) / 0.3 : 1);
      el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%) scale(${scale})`;
    });

    this.flash.style.opacity = String(flash);
    this.flash.style.display = flash > 0.01 ? 'block' : 'none';

    // Apple indicator at the screen edge.
    const margin = 28;
    let show = false;
    if (apple) {
      const inside = apple.visible && apple.x > rect.x && apple.x < rect.x + rect.w && apple.y > rect.y && apple.y < rect.y + rect.h;
      if (!inside) {
        show = true;
        const cx = rect.x + rect.w / 2;
        const cy = rect.y + rect.h / 2;
        let dx = apple.x - cx;
        let dy = apple.y - cy;
        if (!apple.visible) {
          dx = -dx;
          dy = -dy;
        }
        const len = Math.hypot(dx, dy) || 1;
        dx /= len;
        dy /= len;
        const kx = (rect.w / 2 - margin) / Math.max(1e-6, Math.abs(dx));
        const ky = (rect.h / 2 - margin) / Math.max(1e-6, Math.abs(dy));
        const k = Math.min(kx, ky);
        const ax = cx + dx * k;
        const ay = cy + dy * k;
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 90;
        this.arrow.style.transform = `translate(${ax}px, ${ay}px) translate(-50%, -50%)`;
        (this.arrow.firstElementChild as HTMLElement).style.transform = `rotate(${angle}deg)`;
      }
    }
    const label = this.arrow.lastElementChild as HTMLElement;
    if (label.textContent !== emoji) label.textContent = emoji;
    this.arrow.classList.toggle('hidden', !show);
  }

  hideArrow(): void {
    this.arrow.classList.add('hidden');
  }
}
