// Smooth snake renderer: interpolated segment centers joined by thick
// round-capped strokes, gradient colors from the skin, a traveling bulge
// after eating, eyes looking where the snake goes and a tongue flick.
import type { SkinConfig } from '../config/skins';
import type { Game } from '../core/state';
import { DIRS } from '../core/types';

export interface SnakeDrawOptions {
  /** Board origin and cell size in CSS px. */
  bx: number;
  by: number;
  cell: number;
  alpha: number;
  timeMs: number;
  skin: SkinConfig;
  /** Head scale (pop when eating). */
  headScale: number;
  /** Bulge positions as fractional segment indices. */
  bulges: number[];
  /** Translucent body (ghost power-up). */
  ghost: boolean;
  /** Glow color around the body when a power-up is active. */
  glow: string | null;
}

let xs = new Float32Array(256);
let ys = new Float32Array(256);
let ws = new Float32Array(256);

function ensure(n: number): void {
  if (xs.length >= n) return;
  const size = Math.max(n, xs.length * 2);
  xs = new Float32Array(size);
  ys = new Float32Array(size);
  ws = new Float32Array(size);
}

/** Computes interpolated segment centers (CSS px) into xs/ys. Returns the count. */
export function computeSnakePoints(game: Game, bx: number, by: number, cell: number, alpha: number): number {
  const n = game.snake.length;
  ensure(n);
  const { cols, rows, wrap } = game;
  for (let i = 0; i < n; i++) {
    const cur = game.snake[i];
    const prev = game.prevSnake[i] ?? cur;
    let dx = cur.x - prev.x;
    let dy = cur.y - prev.y;
    if (wrap) {
      if (dx > 1) dx -= cols;
      else if (dx < -1) dx += cols;
      if (dy > 1) dy -= rows;
      else if (dy < -1) dy += rows;
    }
    if (Math.abs(dx) + Math.abs(dy) > 1) {
      dx = 0;
      dy = 0;
    }
    xs[i] = bx + (cur.x - dx * (1 - alpha) + 0.5) * cell;
    ys[i] = by + (cur.y - dy * (1 - alpha) + 0.5) * cell;
  }
  return n;
}

export function snakePoint(i: number): { x: number; y: number } {
  return { x: xs[i], y: ys[i] };
}

export function drawSnake(ctx: CanvasRenderingContext2D, game: Game, o: SnakeDrawOptions): void {
  const n = computeSnakePoints(game, o.bx, o.by, o.cell, o.alpha);
  if (n === 0) return;
  const c = o.cell;
  const breakDist = c * 1.6;

  // Widths: taper toward the tail, plus bulges.
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    let w = c * 0.86 * (1 - 0.38 * Math.pow(t, 1.4));
    for (const b of o.bulges) {
      const d = Math.abs(i - b);
      if (d < 1.4) w *= 1 + 0.42 * (1 - d / 1.4);
    }
    ws[i] = w;
  }

  ctx.save();
  if (o.ghost) ctx.globalAlpha = 0.45 + 0.15 * Math.sin(o.timeMs / 120);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Glow (power-up active or glowing skin): one wide translucent path.
  const glow = o.glow ?? o.skin.glow ?? null;
  if (glow) {
    ctx.strokeStyle = glow;
    ctx.lineWidth = c * (o.glow ? 1.35 + 0.12 * Math.sin(o.timeMs / 90) : 1.25);
    ctx.globalAlpha *= o.glow ? 0.45 : 1;
    pathAll(ctx, n, breakDist);
    ctx.stroke();
    ctx.globalAlpha = o.ghost ? 0.45 + 0.15 * Math.sin(o.timeMs / 120) : 1;
  }

  // Drop shadow.
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = c * 0.8;
  ctx.save();
  ctx.translate(0, c * 0.12);
  pathAll(ctx, n, breakDist);
  ctx.stroke();
  ctx.restore();

  // Outline pass then fill pass so joints never show seams.
  ctx.strokeStyle = o.skin.outline;
  strokeSegments(ctx, n, breakDist, c * 0.13, null);
  strokeSegments(ctx, n, breakDist, 0, (i) => o.skin.body(i, n, o.timeMs));

  // Highlight along the back.
  ctx.strokeStyle = 'rgba(255,255,255,0.28)';
  ctx.lineWidth = c * 0.16;
  ctx.save();
  ctx.translate(-c * 0.08, -c * 0.12);
  pathAll(ctx, n, breakDist, 1);
  ctx.stroke();
  ctx.restore();

  drawHead(ctx, game, o, n);
  ctx.restore();
}

function pathAll(ctx: CanvasRenderingContext2D, n: number, breakDist: number, from = 0): void {
  ctx.beginPath();
  ctx.moveTo(xs[n - 1], ys[n - 1]);
  for (let i = n - 2; i >= from; i--) {
    const far = Math.abs(xs[i] - xs[i + 1]) + Math.abs(ys[i] - ys[i + 1]) > breakDist;
    if (far) ctx.moveTo(xs[i], ys[i]);
    else ctx.lineTo(xs[i], ys[i]);
  }
  if (n === 1) ctx.lineTo(xs[0] + 0.01, ys[0]);
}

function strokeSegments(
  ctx: CanvasRenderingContext2D,
  n: number,
  breakDist: number,
  extra: number,
  color: ((i: number) => string) | null,
): void {
  for (let i = n - 1; i >= 1; i--) {
    const far = Math.abs(xs[i] - xs[i - 1]) + Math.abs(ys[i] - ys[i - 1]) > breakDist;
    ctx.beginPath();
    ctx.moveTo(xs[i], ys[i]);
    if (far) ctx.lineTo(xs[i] + 0.01, ys[i]);
    else ctx.lineTo(xs[i - 1], ys[i - 1]);
    ctx.lineWidth = (ws[i] + ws[i - 1]) / 2 + extra;
    if (color) ctx.strokeStyle = color(i);
    ctx.stroke();
  }
}

function drawHead(ctx: CanvasRenderingContext2D, game: Game, o: SnakeDrawOptions, n: number): void {
  const c = o.cell;
  const hx = xs[0];
  const hy = ys[0];
  // Facing: from the neck toward the head, so it rotates smoothly through turns.
  let fx = 0;
  let fy = 0;
  if (n > 1) {
    fx = hx - xs[1];
    fy = hy - ys[1];
  }
  const len = Math.hypot(fx, fy);
  if (len < c * 0.2 || len > c * 1.6) {
    const d = DIRS[game.dir];
    fx = d.x;
    fy = d.y;
  } else {
    fx /= len;
    fy /= len;
  }
  const px = -fy;
  const py = fx;
  const r = c * 0.55 * o.headScale;

  // Tongue flick.
  const phase = o.timeMs % 2200;
  if (phase < 280 && game.status !== 'dying') {
    const ext = Math.sin((phase / 280) * Math.PI);
    const tl = r * (0.5 + 0.7 * ext);
    const bx = hx + fx * r * 0.8;
    const by = hy + fy * r * 0.8;
    const tx = bx + fx * tl;
    const ty = by + fy * tl;
    ctx.strokeStyle = '#ff2d55';
    ctx.lineWidth = Math.max(1.5, c * 0.07);
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(tx, ty);
    ctx.lineTo(tx + (fx + px) * r * 0.25, ty + (fy + py) * r * 0.25);
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx + (fx - px) * r * 0.25, ty + (fy - py) * r * 0.25);
    ctx.stroke();
  }

  // Head disc.
  ctx.beginPath();
  ctx.arc(hx, hy, r + c * 0.065, 0, Math.PI * 2);
  ctx.fillStyle = o.skin.outline;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(hx, hy, r, 0, Math.PI * 2);
  ctx.fillStyle = o.skin.head;
  ctx.fill();

  // Cheeks.
  ctx.fillStyle = 'rgba(255,120,160,0.35)';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(hx + fx * r * 0.05 + px * s * r * 0.62, hy + fy * r * 0.05 + py * s * r * 0.62, r * 0.16, 0, Math.PI * 2);
    ctx.fill();
  }

  // Eyes looking in the movement direction, with an occasional blink.
  const blink = o.timeMs % 3700 < 120;
  for (const s of [-1, 1]) {
    const ex = hx + fx * r * 0.32 + px * s * r * 0.42;
    const ey = hy + fy * r * 0.32 + py * s * r * 0.42;
    const er = r * 0.3;
    if (blink) {
      ctx.strokeStyle = o.skin.pupil;
      ctx.lineWidth = Math.max(1.5, c * 0.06);
      ctx.beginPath();
      ctx.moveTo(ex - px * er, ey - py * er);
      ctx.lineTo(ex + px * er, ey + py * er);
      ctx.stroke();
      continue;
    }
    ctx.beginPath();
    ctx.arc(ex, ey, er, 0, Math.PI * 2);
    ctx.fillStyle = o.skin.eyeWhite;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + fx * er * 0.4, ey + fy * er * 0.4, er * 0.55, 0, Math.PI * 2);
    ctx.fillStyle = o.skin.pupil;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ex + fx * er * 0.2 - px * er * 0.2, ey + fy * er * 0.2 - py * er * 0.2, er * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }
}
