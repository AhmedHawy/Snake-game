// Infinite world: obstacles live in 16x16 chunks generated around the snake
// and dropped when far away. Placement rules guarantee the snake can never be
// trapped: pieces are small, never touch each other (not even diagonally), and
// every placement is re-checked with a local pocket / dead-end test.
import type { Rng } from './rng';
import { DIRS, type Vec } from './types';

export const CHUNK = 16;

/** Numeric key for a cell (exact for |x|, |y| < 500000). */
export const cellKey = (x: number, y: number): number => x * 1_000_003 + y;
const chunkKey = (cx: number, cy: number): number => cx * 100_003 + cy;

/** Rotates a shape by 0/90/180/270 degrees and normalizes it to start at 0,0. */
export function rotateShape(shape: Vec[], quarterTurns: number): Vec[] {
  let pts = shape.map((p) => ({ x: p.x, y: p.y }));
  for (let r = 0; r < quarterTurns % 4; r++) pts = pts.map((p) => ({ x: -p.y, y: p.x }));
  const minX = Math.min(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  return pts.map((p) => ({ x: p.x - minX, y: p.y - minY }));
}

/**
 * Local safety check around a rectangle: inside the window no free cell may be
 * a dead end (3+ blocked sides) and every free cell must be able to reach the
 * window border (no enclosed pockets).
 */
export function isWindowSafe(blocked: (x: number, y: number) => boolean, x0: number, y0: number, x1: number, y1: number): boolean {
  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (blocked(x, y)) continue;
      let walls = 0;
      for (const d of DIRS) if (blocked(x + d.x, y + d.y)) walls++;
      if (walls >= 3) return false;
      if (x === x0 || x === x1 || y === y0 || y === y1) {
        const i = (y - y0) * w + (x - x0);
        seen[i] = 1;
        stack.push(i);
      }
    }
  }
  // Flood fill inward from the free border cells.
  while (stack.length) {
    const i = stack.pop()!;
    const x = x0 + (i % w);
    const y = y0 + ((i / w) | 0);
    for (const d of DIRS) {
      const nx = x + d.x;
      const ny = y + d.y;
      if (nx < x0 || ny < y0 || nx > x1 || ny > y1) continue;
      const n = (ny - y0) * w + (nx - x0);
      if (seen[n] || blocked(nx, ny)) continue;
      seen[n] = 1;
      stack.push(n);
    }
  }
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (!blocked(x, y) && !seen[(y - y0) * w + (x - x0)]) return false;
    }
  }
  return true;
}

export interface ObstacleCell extends Vec {
  /** Stable per-cell variation (model variant / rotation) for rendering. */
  seed: number;
}

/** Chunked, unbounded obstacle field. */
export class ObstacleWorld {
  private readonly blocked = new Set<number>();
  private readonly chunks = new Map<number, ObstacleCell[]>();
  private list: ObstacleCell[] = [];
  private dirty = true;
  /** Increments whenever the set of obstacles changes (renderer cache key). */
  version = 0;

  constructor(
    private readonly rng: Rng,
    private shapes: Vec[][],
    private readonly piecesPerChunk: number,
  ) {}

  has(x: number, y: number): boolean {
    return this.blocked.has(cellKey(x, y));
  }

  get chunkCount(): number {
    return this.chunks.size;
  }

  /** All obstacle cells currently loaded. */
  cells(): ObstacleCell[] {
    if (this.dirty) {
      this.list = [];
      for (const c of this.chunks.values()) for (const o of c) this.list.push(o);
      this.dirty = false;
    }
    return this.list;
  }

  setShapes(shapes: Vec[][]): void {
    this.shapes = shapes;
  }

  /** Generates missing chunks within `radius` chunks of the cell (x, y) and drops far ones. */
  update(x: number, y: number, radius: number, forbidden: (x: number, y: number) => boolean): void {
    const ccx = Math.floor(x / CHUNK);
    const ccy = Math.floor(y / CHUNK);
    for (let cy = ccy - radius; cy <= ccy + radius; cy++) {
      for (let cx = ccx - radius; cx <= ccx + radius; cx++) {
        const k = chunkKey(cx, cy);
        if (!this.chunks.has(k)) this.generateChunk(cx, cy, k, forbidden);
      }
    }
    const keep = radius + 1;
    for (const [k, cells] of this.chunks) {
      const cx = Math.round(k / 100_003);
      const cy = k - cx * 100_003;
      if (Math.abs(cx - ccx) > keep || Math.abs(cy - ccy) > keep) {
        for (const c of cells) this.blocked.delete(cellKey(c.x, c.y));
        this.chunks.delete(k);
        this.dirty = true;
        this.version++;
      }
    }
  }

  /** Drops everything (zone change); call update() afterwards to rebuild. */
  clear(): void {
    this.blocked.clear();
    this.chunks.clear();
    this.dirty = true;
    this.version++;
  }

  private generateChunk(cx: number, cy: number, key: number, forbidden: (x: number, y: number) => boolean): void {
    const cells: ObstacleCell[] = [];
    this.chunks.set(key, cells);
    this.dirty = true;
    this.version++;
    if (this.piecesPerChunk <= 0 || this.shapes.length === 0) return;
    const rng = this.rng;
    const base = Math.floor(this.piecesPerChunk);
    const pieces = base + (rng.chance(this.piecesPerChunk - base) ? 1 : 0);
    const x0 = cx * CHUNK;
    const y0 = cy * CHUNK;
    const isBlocked = (x: number, y: number) => this.blocked.has(cellKey(x, y));

    for (let p = 0; p < pieces; p++) {
      for (let attempt = 0; attempt < 25; attempt++) {
        const shape = rotateShape(rng.pick(this.shapes), rng.int(4));
        const ox = x0 + rng.int(CHUNK - 2);
        const oy = y0 + rng.int(CHUNK - 2);
        const piece = shape.map((s) => ({ x: ox + s.x, y: oy + s.y }));
        if (!piece.every((c) => c.x < x0 + CHUNK && c.y < y0 + CHUNK && !forbidden(c.x, c.y))) continue;
        // Pieces never touch other pieces, not even diagonally.
        let touches = false;
        for (const c of piece) {
          for (let dy = -1; dy <= 1 && !touches; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (isBlocked(c.x + dx, c.y + dy)) {
                touches = true;
                break;
              }
            }
          }
          if (touches) break;
        }
        if (touches) continue;
        for (const c of piece) this.blocked.add(cellKey(c.x, c.y));
        const xs = piece.map((c) => c.x);
        const ys = piece.map((c) => c.y);
        if (!isWindowSafe(isBlocked, Math.min(...xs) - 3, Math.min(...ys) - 3, Math.max(...xs) + 3, Math.max(...ys) + 3)) {
          for (const c of piece) this.blocked.delete(cellKey(c.x, c.y));
          continue;
        }
        for (const c of piece) cells.push({ x: c.x, y: c.y, seed: rng.int(1 << 30) });
        break;
      }
    }
  }
}

/**
 * Picks a random cell whose Chebyshev distance from `center` is within
 * [minD, maxD] and for which `ok` returns true (null when none is found).
 */
export function randomCellNear(center: Vec, minD: number, maxD: number, rng: Rng, ok: (x: number, y: number) => boolean): Vec | null {
  for (let i = 0; i < 300; i++) {
    const x = center.x + rng.int(maxD * 2 + 1) - maxD;
    const y = center.y + rng.int(maxD * 2 + 1) - maxD;
    if (Math.max(Math.abs(x - center.x), Math.abs(y - center.y)) < minD) continue;
    if (ok(x, y)) return { x, y };
  }
  return null;
}
