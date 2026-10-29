// Visual effect state driven by game events (independent from game logic):
// 3D particles, floating score popups, head pop, body bulges, camera shake,
// red flash and the slow-motion time scale used for the crash sequence.
// World units: 1 = one cell; a cell (x, y) sits at world (x, 0, y).
import { EFFECT_COLORS, FOODS } from '../config/food';
import type { SkinConfig } from '../config/skins';
import { TIMED_EFFECTS, type FoodItem, type Game } from '../core/state';
import type { Vec } from '../core/types';
import { Particles } from './particles';

export interface Popup {
  x: number;
  y: number;
  z: number;
  text: string;
  color: string;
  age: number;
  life: number;
  /** Font size in CSS px. */
  size: number;
}

const SLOWMO_MS = 900;

export class Fx {
  readonly particles = new Particles(3000);
  readonly popups: Popup[] = [];
  /** 1 right after eating, decays to 0. */
  headPop = 0;
  /** Camera shake offset in world units. */
  shakeX = 0;
  shakeY = 0;
  shakeZ = 0;
  private trauma = 0;
  flash = 0;
  /** Game-time multiplier (slow motion on crash). */
  timeScale = 1;
  private slowmoLeft = 0;
  private trailTimer = 0;
  private bulgeSteps: number[] = [];
  private bulgeOut: number[] = [];

  reset(): void {
    this.headPop = 0;
    this.bulgeSteps.length = 0;
    this.particles.clear();
    this.popups.length = 0;
    this.trauma = 0;
    this.flash = 0;
    this.timeScale = 1;
    this.slowmoLeft = 0;
  }

  onEat(game: Game, food: FoodItem, points: number, multiplier: number): void {
    const cfg = FOODS[food.type];
    const { x, y } = food.pos;
    if (!cfg.harmful) {
      this.headPop = 1;
      this.bulgeSteps.push(game.stepCount);
    }
    const big = food.type === 'golden';
    const p = this.particles;
    p.burst(x, 0.5, y, cfg.color, big ? 46 : 22, big ? 7 : 5, 0.16, big ? 900 : 650, { drag: 0.1, gravity: 9, bounce: true });
    p.burst(x, 0.5, y, '#ffffff', big ? 16 : 8, 4, 0.12, 450, { drag: 0.1, glow: true });
    if (big) p.burst(x, 0.6, y, cfg.accent, 20, 3.5, 0.22, 1000, { drag: 0.25, gravity: 3, glow: true });
    const label = points >= 0 ? `+${points}` : `${points}`;
    this.popup(x, 1.1, y, multiplier > 1 && points > 0 ? `${label} ×${multiplier}` : label, cfg.harmful ? '#c77dff' : big ? '#ffd23f' : '#ffffff', big ? 30 : 24);
    if (cfg.harmful) this.addShake(0.35);
  }

  onShrink(removed: Vec[], poison: boolean, skin: SkinConfig): void {
    removed.forEach((c, i) => {
      this.particles.burst(c.x, 0.4, c.y, poison ? '#7b2cbf' : skin.body(i, removed.length, 0), 8, 3.5, 0.22, 700, { drag: 0.2, gravity: 10, bounce: true });
    });
  }

  onEffect(effect: keyof typeof EFFECT_COLORS, head: { x: number; z: number }): void {
    // Expanding ring of sparks on the ground.
    const n = 32;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      this.particles.emit(head.x, 0.3, head.z, Math.cos(a) * 6, 0.6, Math.sin(a) * 6, 550, 0.16, EFFECT_COLORS[effect], { drag: 0.05, glow: true });
    }
  }

  onPortal(from: Vec, to: Vec, color: string): void {
    for (const c of [from, to]) this.particles.burst(c.x, 0.3, c.y, color, 18, 4, 0.15, 500, { glow: true, gravity: 2 });
  }

  onExpire(food: FoodItem): void {
    this.particles.burst(food.pos.x, 0.5, food.pos.y, FOODS[food.type].color, 12, 2.5, 0.12, 500, { drag: 0.2, gravity: -2 });
  }

  onCombo(multiplier: number, head: { x: number; z: number }): void {
    this.particles.burst(head.x, 0.8, head.z, '#ffd23f', 10 + multiplier * 3, 4.5, 0.13, 550, { glow: true });
  }

  /** Crash: shake, red flash, slow motion, and the snake breaks into pieces. */
  onCrash(points: { x: number; z: number }[], colors: string[], at: Vec): void {
    this.addShake(1);
    this.flash = 0.55;
    this.timeScale = 0.25;
    this.slowmoLeft = SLOWMO_MS;
    const p = this.particles;
    points.forEach((pt, i) => {
      const dx = pt.x - at.x;
      const dz = pt.z - at.y;
      const d = Math.hypot(dx, dz) || 1;
      const s = 2.5 + Math.random() * 4;
      p.emit(
        pt.x, 0.45, pt.z,
        (dx / d) * s + (Math.random() - 0.5) * 3, 4 + Math.random() * 5, (dz / d) * s + (Math.random() - 0.5) * 3,
        1300 + Math.random() * 600,
        i === 0 ? 0.85 : 0.6,
        colors[i],
        { gravity: 16, drag: 0.5, bounce: true },
      );
      if (i % 2 === 0) p.burst(pt.x, 0.4, pt.z, colors[i], 3, 3, 0.14, 700, { drag: 0.2, gravity: 8, bounce: true });
    });
    p.burst(at.x, 0.5, at.y, '#ffffff', 28, 8, 0.16, 500, { glow: true, drag: 0.05 });
  }

  addShake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  popup(x: number, y: number, z: number, text: string, color: string, size: number): void {
    this.popups.push({ x, y, z, text, color, age: 0, life: 950, size });
    if (this.popups.length > 12) this.popups.shift();
  }

  /** Real-time update (not affected by slow motion). `head` is the interpolated head position. */
  update(dtMs: number, game: Game | null, head: { x: number; z: number } | null): void {
    this.headPop = Math.max(0, this.headPop - dtMs / 220);
    this.flash = Math.max(0, this.flash - dtMs / 450);
    this.trauma = Math.max(0, this.trauma - dtMs / 600);
    const shake = this.trauma * this.trauma * 0.45;
    this.shakeX = (Math.random() * 2 - 1) * shake;
    this.shakeY = (Math.random() * 2 - 1) * shake;
    this.shakeZ = (Math.random() * 2 - 1) * shake;
    if (this.slowmoLeft > 0) {
      this.slowmoLeft -= dtMs;
      this.timeScale = this.slowmoLeft > 0 ? 0.25 + 0.75 * (1 - this.slowmoLeft / SLOWMO_MS) ** 2 : 1;
    }
    this.particles.update(dtMs * this.timeScale);
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.age += dtMs;
      p.y += (dtMs / 1000) * 1.4;
      if (p.age >= p.life) this.popups.splice(i, 1);
    }

    // Power-up trail: sparkles from the head while an effect is active.
    if (game && head && game.status === 'playing') {
      const effect = TIMED_EFFECTS.find((e) => game.effects[e] > 0);
      if (effect) {
        this.trailTimer -= dtMs;
        while (this.trailTimer <= 0) {
          this.trailTimer += 40;
          this.particles.emit(
            head.x + (Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 0.5, head.z + (Math.random() - 0.5) * 0.6,
            (Math.random() - 0.5) * 0.8, 0.8 + Math.random(), (Math.random() - 0.5) * 0.8,
            550, 0.14, EFFECT_COLORS[effect], { glow: true },
          );
        }
      }
    }
  }

  get headScale(): number {
    const p = this.headPop;
    return 1 + 0.32 * p * p;
  }

  /** Current bulge positions as fractional segment indices. */
  bulges(game: Game, alpha: number): number[] {
    const out = this.bulgeOut;
    out.length = 0;
    const len = game.snake.length;
    for (let i = this.bulgeSteps.length - 1; i >= 0; i--) {
      const pos = game.stepCount - this.bulgeSteps[i] + alpha - 1;
      if (pos > len + 1) this.bulgeSteps.splice(i, 1);
      else out.push(Math.max(0, pos));
    }
    return out;
  }
}
