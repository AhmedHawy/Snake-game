// Visual effect state driven by game events (independent from game logic):
// particles, score popups, head pop, body bulges, screen shake, red flash
// and the slow-motion time scale used for the crash sequence.
import { EFFECT_COLORS, FOODS } from '../config/food';
import type { SkinConfig } from '../config/skins';
import { TIMED_EFFECTS, type FoodItem, type Game } from '../core/state';
import type { Vec } from '../core/types';
import { PShape, Particles } from './particles';

interface Popup {
  x: number;
  y: number;
  text: string;
  color: string;
  age: number;
  life: number;
  size: number;
}

export interface BoardGeom {
  x: number;
  y: number;
  cell: number;
}

const SLOWMO_MS = 900;

export class Fx {
  readonly particles = new Particles(3000);
  /** 1 right after eating, decays to 0. */
  headPop = 0;
  shakeX = 0;
  shakeY = 0;
  private trauma = 0;
  flash = 0;
  flashColor = '255,40,60';
  /** Game-time multiplier (slow motion on crash). */
  timeScale = 1;
  private slowmoLeft = 0;
  private trailTimer = 0;
  private readonly popups: Popup[] = [];
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

  private center(g: BoardGeom, p: Vec): { x: number; y: number } {
    return { x: g.x + (p.x + 0.5) * g.cell, y: g.y + (p.y + 0.5) * g.cell };
  }

  onEat(game: Game, food: FoodItem, points: number, multiplier: number, geom: BoardGeom): void {
    const cfg = FOODS[food.type];
    const { x, y } = this.center(geom, food.pos);
    const c = geom.cell;
    if (!cfg.harmful) {
      this.headPop = 1;
      this.bulgeSteps.push(game.stepCount);
    }
    const big = food.type === 'golden';
    this.particles.burst(x, y, cfg.color, big ? 40 : 18, c * (big ? 9 : 6), c * 0.18, big ? 800 : 550, { drag: 0.08, shape: PShape.Circle });
    this.particles.burst(x, y, '#ffffff', big ? 14 : 6, c * 5, c * 0.1, 400, { drag: 0.1, glow: true });
    if (big) this.particles.burst(x, y, cfg.accent, 16, c * 4, c * 0.22, 900, { drag: 0.2, gravity: c * 4, glow: true });
    const label = points >= 0 ? `+${points}` : `${points}`;
    this.popup(x, y - c * 0.4, multiplier > 1 && points > 0 ? `${label} ×${multiplier}` : label, cfg.harmful ? '#c77dff' : big ? '#ffd23f' : '#ffffff', c * (big ? 0.85 : 0.65));
    if (cfg.harmful) this.addShake(0.35);
  }

  onShrink(removed: Vec[], poison: boolean, geom: BoardGeom, skin: SkinConfig): void {
    removed.forEach((p, i) => {
      const { x, y } = this.center(geom, p);
      this.particles.burst(x, y, poison ? '#7b2cbf' : skin.body(i, removed.length, 0), 8, geom.cell * 4, geom.cell * 0.25, 600, { shape: PShape.Chunk, drag: 0.1 });
    });
  }

  onEffect(effect: keyof typeof EFFECT_COLORS, head: Vec, geom: BoardGeom): void {
    const { x, y } = this.center(geom, head);
    // Expanding ring of sparks.
    const n = 28;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const s = geom.cell * 7;
      this.particles.emit(x, y, Math.cos(a) * s, Math.sin(a) * s, 500, geom.cell * 0.16, EFFECT_COLORS[effect], { drag: 0.05, glow: true, shape: PShape.Circle });
    }
  }

  onPortal(from: Vec, to: Vec, color: string, geom: BoardGeom): void {
    for (const p of [from, to]) {
      const { x, y } = this.center(geom, p);
      this.particles.burst(x, y, color, 14, geom.cell * 4, geom.cell * 0.16, 450, { glow: true, shape: PShape.Circle });
    }
  }

  onExpire(food: FoodItem, geom: BoardGeom): void {
    const { x, y } = this.center(geom, food.pos);
    this.particles.burst(x, y, FOODS[food.type].color, 10, geom.cell * 2.5, geom.cell * 0.12, 450, { drag: 0.2, gravity: -geom.cell * 2 });
  }

  onCombo(multiplier: number, head: Vec, geom: BoardGeom): void {
    const { x, y } = this.center(geom, head);
    this.particles.burst(x, y, '#ffd23f', 10 + multiplier * 3, geom.cell * 5, geom.cell * 0.14, 500, { glow: true });
  }

  /** Crash: shake, red flash, slow motion, and the snake breaks into pieces. */
  onCrash(points: { x: number; y: number }[], colors: string[], at: Vec, geom: BoardGeom): void {
    this.addShake(1);
    this.flash = 0.55;
    this.flashColor = '255,40,60';
    this.timeScale = 0.25;
    this.slowmoLeft = SLOWMO_MS;
    const hit = this.center(geom, at);
    const c = geom.cell;
    points.forEach((p, i) => {
      const dx = p.x - hit.x;
      const dy = p.y - hit.y;
      const d = Math.hypot(dx, dy) || 1;
      const s = c * (3 + Math.random() * 5);
      this.particles.emit(
        p.x, p.y,
        (dx / d) * s + (Math.random() - 0.5) * c * 4,
        (dy / d) * s + (Math.random() - 0.5) * c * 4 - c * 3,
        1100 + Math.random() * 500,
        c * (i === 0 ? 0.9 : 0.62),
        colors[i],
        { shape: PShape.Chunk, gravity: c * 14, drag: 0.4 },
      );
      if (i % 2 === 0) this.particles.burst(p.x, p.y, colors[i], 3, c * 3, c * 0.14, 700, { drag: 0.2, gravity: c * 6 });
    });
    this.particles.burst(hit.x, hit.y, '#ffffff', 24, c * 10, c * 0.16, 500, { glow: true, drag: 0.05 });
  }

  addShake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  popup(x: number, y: number, text: string, color: string, size: number): void {
    this.popups.push({ x, y, text, color, age: 0, life: 900, size });
    if (this.popups.length > 12) this.popups.shift();
  }

  /** Real-time update (not affected by slow motion). */
  update(dtMs: number, game: Game | null, geom: BoardGeom, headPos: { x: number; y: number } | null): void {
    this.headPop = Math.max(0, this.headPop - dtMs / 220);
    this.flash = Math.max(0, this.flash - dtMs / 450);
    this.trauma = Math.max(0, this.trauma - dtMs / 600);
    const shake = this.trauma * this.trauma * geom.cell * 0.6;
    this.shakeX = (Math.random() * 2 - 1) * shake;
    this.shakeY = (Math.random() * 2 - 1) * shake;
    if (this.slowmoLeft > 0) {
      this.slowmoLeft -= dtMs;
      this.timeScale = this.slowmoLeft > 0 ? 0.25 + 0.75 * (1 - this.slowmoLeft / SLOWMO_MS) ** 2 : 1;
    }
    this.particles.update(dtMs * this.timeScale);
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.age += dtMs;
      p.y -= (dtMs / 1000) * geom.cell * 1.6;
      if (p.age >= p.life) this.popups.splice(i, 1);
    }

    // Power-up trail: sparkles from the head while an effect is active.
    if (game && headPos && game.status === 'playing') {
      const effect = TIMED_EFFECTS.find((e) => game.effects[e] > 0);
      if (effect) {
        this.trailTimer -= dtMs;
        while (this.trailTimer <= 0) {
          this.trailTimer += 45;
          const c = geom.cell;
          this.particles.emit(
            headPos.x + (Math.random() - 0.5) * c * 0.6,
            headPos.y + (Math.random() - 0.5) * c * 0.6,
            (Math.random() - 0.5) * c,
            (Math.random() - 0.5) * c,
            500,
            c * 0.14,
            EFFECT_COLORS[effect],
            { glow: true, shape: PShape.Circle },
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

  drawPopups(ctx: CanvasRenderingContext2D): void {
    if (this.popups.length === 0) return;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Numbers read left-to-right even when the page is RTL (Arabic).
    ctx.direction = 'ltr';
    ctx.lineJoin = 'round';
    for (const p of this.popups) {
      const t = p.age / p.life;
      const scale = t < 0.15 ? 0.6 + (t / 0.15) * 0.6 : t < 0.3 ? 1.2 - ((t - 0.15) / 0.15) * 0.2 : 1;
      ctx.globalAlpha = t > 0.7 ? (1 - t) / 0.3 : 1;
      ctx.font = `900 ${Math.round(p.size * scale)}px Cairo, system-ui, sans-serif`;
      ctx.lineWidth = Math.max(3, p.size * 0.18);
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }
}
