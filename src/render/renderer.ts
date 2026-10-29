// Frame renderer. Draws in CSS pixels with a devicePixelRatio transform so
// everything stays crisp; static layers come from pre-rendered caches.
import { EFFECT_COLORS, FOODS } from '../config/food';
import type { SkinConfig } from '../config/skins';
import type { Rect } from '../core/grid';
import { TIMED_EFFECTS, type Game } from '../core/state';
import type { Vec } from '../core/types';
import type { Fx } from '../fx/effects';
import { boardRadius, renderBoardBackground } from './background';
import { drawSnake, snakePoint } from './snake';
import { obstacleVariant } from './shapes';
import { FOOD_SPRITE_SCALE, SpriteCache } from './sprites';

export interface BoardRect extends Rect {
  cell: number;
}

export interface RenderView {
  game: Game;
  /** Real (wall-clock) time, for animations that keep running in slow-mo/pause. */
  timeMs: number;
  skin: SkinConfig;
  fx: Fx;
}

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  dpr = 1;
  width = 0;
  height = 0;
  board: BoardRect = { x: 0, y: 0, w: 0, h: 0, cell: 1 };
  private readonly sprites = new SpriteCache();
  private readonly bgCache = new Map<string, HTMLCanvasElement>();

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
  }

  resize(width: number, height: number, dpr: number, board: BoardRect): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.board = board;
    const w = Math.round(width * dpr);
    const h = Math.round(height * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.sprites.setCellPx(board.cell * dpr);
    this.bgCache.clear();
  }

  private background(game: Game, zoneIndex: number): HTMLCanvasElement {
    const cellPx = Math.round(this.board.cell * this.dpr);
    const key = `${zoneIndex}:${game.cols}x${game.rows}:${cellPx}`;
    let bg = this.bgCache.get(key);
    if (!bg) {
      if (this.bgCache.size > 4) this.bgCache.clear();
      bg = renderBoardBackground(game.zones[zoneIndex], game.cols, game.rows, cellPx);
      this.bgCache.set(key, bg);
    }
    return bg;
  }

  draw(view: RenderView): void {
    const { ctx, board } = this;
    const { game } = view;
    const zone = game.zone;
    const alpha = game.alpha;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = zone.palette.backdrop;
    ctx.fillRect(0, 0, this.width, this.height);

    // Board frame + background.
    const r = boardRadius(board.cell);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.roundRect(board.x - 3, board.y + 2, board.w + 6, board.h + 6, r + 3);
    ctx.fill();
    ctx.strokeStyle = zone.palette.border;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(board.x - 2, board.y - 2, board.w + 4, board.h + 4, r + 2);
    ctx.stroke();
    ctx.drawImage(this.background(game, game.zoneIndex), board.x, board.y, board.w, board.h);

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(board.x, board.y, board.w, board.h, r);
    ctx.clip();

    this.drawPortals(game, view.timeMs);
    this.drawObstacles(game, game.obstacles, 1);
    this.drawMovers(game, alpha, view.timeMs);
    this.drawFoods(game, alpha, view.timeMs);

    if (game.status !== 'dying' && game.status !== 'over') {
      const glowEffect = TIMED_EFFECTS.find((e) => game.effects[e] > 0);
      drawSnake(ctx, game, {
        bx: board.x,
        by: board.y,
        cell: board.cell,
        alpha,
        timeMs: view.timeMs,
        skin: view.skin,
        headScale: view.fx.headScale,
        bulges: view.fx.bulges(game, alpha),
        ghost: game.effects.ghost > 0,
        glow: glowEffect ? EFFECT_COLORS[glowEffect] : null,
      });
      this.drawEffectRings(game);
    }
    ctx.restore();
  }

  cellCenter(p: Vec): { x: number; y: number } {
    const c = this.board.cell;
    return { x: this.board.x + (p.x + 0.5) * c, y: this.board.y + (p.y + 0.5) * c };
  }

  private drawObstacles(game: Game, cells: Vec[], alpha: number): void {
    if (cells.length === 0 || alpha <= 0) return;
    const { ctx, board } = this;
    const c = board.cell;
    ctx.globalAlpha = alpha;
    for (const o of cells) {
      ctx.drawImage(this.sprites.obstacle(game.zone, obstacleVariant(o.x, o.y)), board.x + o.x * c, board.y + o.y * c, c, c);
    }
    ctx.globalAlpha = 1;
  }

  private drawMovers(game: Game, alpha: number, timeMs: number): void {
    if (game.movers.length === 0) return;
    const { ctx, board } = this;
    const c = board.cell;
    const sprite = this.sprites.obstacle(game.zone, 0);
    const pulse = 0.5 + 0.5 * Math.sin(timeMs / 140);
    for (const m of game.movers) {
      const x = board.x + (m.prev.x + (m.pos.x - m.prev.x) * alpha) * c;
      const y = board.y + (m.prev.y + (m.pos.y - m.prev.y) * alpha) * c;
      ctx.strokeStyle = `rgba(255,60,80,${0.45 + 0.4 * pulse})`;
      ctx.lineWidth = Math.max(2, c * 0.1);
      ctx.beginPath();
      ctx.roundRect(x + 1, y + 1, c - 2, c - 2, c * 0.25);
      ctx.stroke();
      ctx.drawImage(sprite, x, y, c, c);
    }
  }

  private drawFoods(game: Game, alpha: number, timeMs: number): void {
    const { ctx, board } = this;
    const c = board.cell;
    for (const f of game.foods) {
      const fx = f.prev.x + (f.pos.x - f.prev.x) * alpha;
      const fy = f.prev.y + (f.pos.y - f.prev.y) * alpha;
      const cx = board.x + (fx + 0.5) * c;
      const cy = board.y + (fy + 0.5) * c;
      const age = game.timeMs - f.bornMs;
      const appear = age < 260 ? easeOutBack(age / 260) : 1;
      const bob = 1 + 0.07 * Math.sin(timeMs / 260 + f.id);
      let a = 1;
      if (Number.isFinite(f.expiresMs)) {
        const left = f.expiresMs - game.timeMs;
        const life = f.expiresMs - f.bornMs;
        if (left < 1500) a = Math.sin(timeMs / 55) > 0 ? 1 : 0.35;
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = Math.max(1.5, c * 0.07);
        ctx.beginPath();
        ctx.arc(cx, cy, c * 0.6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, left / life));
        ctx.stroke();
      }
      if (f.type === 'golden' || f.type === 'speed' || f.type === 'magnet' || f.type === 'ghost') {
        // Soft halo so specials pop off any background.
        ctx.fillStyle = FOODS[f.type].color;
        ctx.globalAlpha = 0.22 + 0.1 * Math.sin(timeMs / 180);
        ctx.beginPath();
        ctx.arc(cx, cy, c * 0.55, 0, Math.PI * 2);
        ctx.fill();
      }
      const size = c * FOOD_SPRITE_SCALE * 0.92 * appear * bob;
      ctx.globalAlpha = a;
      ctx.save();
      ctx.translate(cx, cy);
      if (f.type === 'golden') ctx.rotate(Math.sin(timeMs / 300) * 0.25);
      ctx.drawImage(this.sprites.food(f.type), -size / 2, -size / 2, size, size);
      ctx.restore();
      ctx.globalAlpha = 1;
    }
  }

  private drawPortals(game: Game, timeMs: number): void {
    if (game.portals.length === 0) return;
    const { ctx } = this;
    const c = this.board.cell;
    for (const p of game.portals) {
      for (const end of [p.a, p.b]) {
        const { x, y } = this.cellCenter(end);
        const g = ctx.createRadialGradient(x, y, 0, x, y, c * 0.62);
        g.addColorStop(0, '#05010f');
        g.addColorStop(0.6, p.color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, c * 0.62, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1.5, c * 0.07);
        const rot = timeMs / 300;
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          ctx.arc(x, y, c * 0.42, rot + (k * Math.PI * 2) / 3, rot + (k * Math.PI * 2) / 3 + 1.1);
          ctx.stroke();
        }
      }
    }
  }

  /** Countdown rings around the head for each active power-up. */
  private drawEffectRings(game: Game): void {
    const { ctx } = this;
    const c = this.board.cell;
    const h = snakePoint(0);
    let k = 0;
    for (const e of TIMED_EFFECTS) {
      const left = game.effects[e];
      if (left <= 0) continue;
      const frac = left / game.effectTotals[e];
      const rad = c * (0.82 + k * 0.17);
      ctx.lineWidth = Math.max(2, c * 0.09);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.arc(h.x, h.y, rad, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = EFFECT_COLORS[e];
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(h.x, h.y, rad, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
      ctx.stroke();
      k++;
    }
  }
}

export function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const u = Math.min(1, Math.max(0, t)) - 1;
  return 1 + c3 * u * u * u + c1 * u * u;
}
