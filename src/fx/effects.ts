// Visual effect state driven by game events (independent from game logic):
// 3D particles, floating score popups, head pop, body bulges, camera shake,
// red flash and the slow-motion time scale used for the crash sequence.
// World units: 1 = one cell; a cell (x, y) sits at world (x, 0, y).
import { EFFECT_COLORS, FOODS } from '../config/food';
import type { SkinConfig } from '../config/skins';
import { ABILITIES, type AbilityId } from '../config/abilities';
import { TIMED_EFFECTS, type FoodItem, type Game } from '../core/state';
import { DIRS, type Dir, type Vec } from '../core/types';
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
  private sprintTimer = 0;
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

  /** A rival snake breaks apart; `points` > 0 when the player ate it. */
  onRivalKilled(cells: Vec[], colors: string[], points: number): void {
    const p = this.particles;
    cells.forEach((c, i) => {
      p.emit(c.x, 0.4, c.y, (Math.random() - 0.5) * 5, 3 + Math.random() * 4, (Math.random() - 0.5) * 5, 1000 + Math.random() * 500, i === 0 ? 0.7 : 0.5, colors[i], { gravity: 16, drag: 0.5, bounce: true });
    });
    if (points > 0 && cells.length) {
      const h = cells[0];
      p.burst(h.x, 0.6, h.y, '#ffd23f', 30, 6, 0.16, 700, { glow: true, drag: 0.1 });
      this.popup(h.x, 1.2, h.y, `+${points}`, '#7dff6b', 32);
      this.headPop = 1;
      this.addShake(0.3);
    }
  }

  /** Dragon breath: a burst of the ability's particles over the cells it hits. */
  onBreath(ability: AbilityId, from: Vec, dir: Dir, cells: Vec[], targets: Vec[], strong: boolean, real: boolean): void {
    const ab = ABILITIES[ability];
    const p = this.particles;
    const d = DIRS[dir];
    const mx = from.x + d.x * 0.55;
    const mz = from.y + d.y * 0.55;
    const col = (k: number) => ab.colors[k % ab.colors.length];
    // The after-meal show-off breath is lighter than a fired one.
    const scale = (strong ? 1.35 : 1) * (real ? 1 : 0.45);
    if (ab.shape === 'ring') {
      // Expanding shockwave from the dragon in every direction.
      const n = Math.round(70 * scale);
      const speed = ab.range * 2.6;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2;
        p.emit(mx, 0.35, mz, Math.cos(a) * speed, 0.4 + Math.random(), Math.sin(a) * speed, 650, 0.32, col(k), { drag: 0.6, glow: true });
        p.emit(mx, 0.6, mz, Math.cos(a) * speed * 0.6, 1.5 + Math.random() * 2, Math.sin(a) * speed * 0.6, 700, 0.22, col(k + 1), { drag: 0.4, glow: k % 2 === 0 });
      }
    } else if (ab.shape === 'chain') {
      // Bolts from the mouth to each rival, then between rivals.
      let fx = mx;
      let fz = mz;
      const ends = targets.length ? targets : cells.slice(-1);
      for (const t of ends) {
        const len = Math.hypot(t.x - fx, t.y - fz);
        const steps = Math.max(4, Math.round(len * 3));
        for (let k = 0; k <= steps; k++) {
          const u = k / steps;
          const j = k === 0 || k === steps ? 0 : (Math.random() - 0.5) * 0.7;
          p.emit(fx + (t.x - fx) * u + j, 0.5 + Math.random() * 0.3, fz + (t.y - fz) * u + j, 0, 0.3, 0, 380, 0.24, col(k), { glow: true });
        }
        p.burst(t.x, 0.5, t.y, col(0), 14, 4, 0.16, 450, { glow: true });
        fx = t.x;
        fz = t.y;
      }
    } else {
      // Jets: particles leave the mouth and travel through the breath cells.
      for (const c of cells) {
        const dx = c.x - mx;
        const dz = c.y - mz;
        const dist = Math.hypot(dx, dz) || 1;
        const n = Math.max(1, Math.round((ab.shape === 'point' ? 4 : 6) * scale));
        for (let k = 0; k < n; k++) {
          const u = Math.random();
          const life = 380 + Math.random() * 260;
          // Spread the particles along the way so the breath reads as a stream.
          const sx = mx + dx * u * 0.6;
          const sz = mz + dz * u * 0.6;
          const v = (dist * (1 - u * 0.6)) / (life / 1000);
          p.emit(sx, 0.45 + Math.random() * 0.25, sz, (dx / dist) * v * 0.9 + (Math.random() - 0.5), 0.5 + Math.random() * 1.2, (dz / dist) * v * 0.9 + (Math.random() - 0.5), life, 0.2 + Math.random() * 0.22, col(k), {
            drag: 0.9,
            glow: k % 3 !== 2,
          });
        }
      }
      if (ab.shape === 'point' && cells.length) {
        // Black hole: a swirling disc around the centre.
        const cx = from.x + d.x * ab.range;
        const cz = from.y + d.y * ab.range;
        for (let k = 0; k < 60; k++) {
          const a = (k / 60) * Math.PI * 2;
          const r = 2.2;
          p.emit(cx + Math.cos(a) * r, 0.4, cz + Math.sin(a) * r, -Math.cos(a) * 3 - Math.sin(a) * 4, 0.2, -Math.sin(a) * 3 + Math.cos(a) * 4, 700, 0.24, col(k), { glow: true, drag: 0.3 });
        }
      }
    }
    if (!real) return;
    this.headPop = 1;
    this.popup(from.x, 1.5, from.y, ab.icon, '#ffffff', strong ? 34 : 26);
    if (strong || ability === 'royal') this.addShake(0.35);
  }

  /** A rival loses segments to a breath. */
  onRivalHit(removed: Vec[], colors: string[], points: number): void {
    removed.forEach((c, i) => this.particles.burst(c.x, 0.4, c.y, colors[i % colors.length], 6, 3.5, 0.2, 600, { drag: 0.2, gravity: 10, bounce: true }));
    const c = removed[0];
    if (c) this.popup(c.x, 1.1, c.y, `+${points}`, '#7dff6b', 22);
  }

  /** Obstacles broken by a breath. */
  onSmash(cells: Vec[], color: string): void {
    for (const c of cells) {
      this.particles.burst(c.x, 0.5, c.y, color, 14, 5, 0.22, 800, { drag: 0.15, gravity: 14, bounce: true });
      this.particles.burst(c.x, 0.5, c.y, '#ffd23f', 6, 4, 0.12, 400, { glow: true });
    }
    this.addShake(0.2);
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

    // Sprint: speed streaks behind the head.
    if (game && head && game.status === 'playing' && game.sprintMs > 0) {
      const d = DIRS[game.dir];
      this.sprintTimer -= dtMs;
      while (this.sprintTimer <= 0) {
        this.sprintTimer += 25;
        const side = (Math.random() - 0.5) * 0.9;
        this.particles.emit(head.x - d.x * 0.6 + d.y * side, 0.3 + Math.random() * 0.4, head.z - d.y * 0.6 + d.x * side, -d.x * 4, 0, -d.y * 4, 260, 0.1, '#ffffff', { glow: true });
      }
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
