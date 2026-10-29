// Placement of obstacles, portals and food, including the "never trap the
// snake" validation used for every obstacle layout.
import type { Rng } from './rng';
import { DIRS, type Dir, type Vec } from './types';

export interface BoardSpec {
  cols: number;
  rows: number;
  wrap: boolean;
}

/** Cell-occupancy grid helper. */
export class CellMask {
  readonly data: Uint8Array;

  constructor(readonly cols: number, readonly rows: number) {
    this.data = new Uint8Array(cols * rows);
  }

  inside(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
  }

  get(x: number, y: number): boolean {
    return this.inside(x, y) && this.data[y * this.cols + x] !== 0;
  }

  set(x: number, y: number, v = true): void {
    if (this.inside(x, y)) this.data[y * this.cols + x] = v ? 1 : 0;
  }

  clear(): void {
    this.data.fill(0);
  }
}

/** Rotates a shape by 0/90/180/270 degrees and normalizes it to start at 0,0. */
export function rotateShape(shape: Vec[], quarterTurns: number): Vec[] {
  let pts = shape.map((p) => ({ x: p.x, y: p.y }));
  for (let r = 0; r < quarterTurns % 4; r++) pts = pts.map((p) => ({ x: -p.y, y: p.x }));
  const minX = Math.min(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  return pts.map((p) => ({ x: p.x - minX, y: p.y - minY }));
}

/**
 * A layout is "safe" when every free cell is reachable from the head and no
 * free cell is a dead-end pocket (3+ blocked sides), so a snake can never be
 * forced into a spot with no way out by the static layout alone.
 */
export function isLayoutSafe(spec: BoardSpec, blocked: CellMask, start: Vec): boolean {
  const { cols, rows, wrap } = spec;
  if (blocked.get(start.x, start.y)) return false;
  let free = 0;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (blocked.get(x, y)) continue;
      free++;
      let walls = 0;
      for (const d of DIRS) {
        let nx = x + d.x;
        let ny = y + d.y;
        if (wrap) {
          nx = (nx + cols) % cols;
          ny = (ny + rows) % rows;
        }
        if (!blocked.inside(nx, ny) || blocked.get(nx, ny)) walls++;
      }
      if (walls >= 3) return false;
    }
  }
  // Flood fill from the head.
  const seen = new Uint8Array(cols * rows);
  const stack: number[] = [start.y * cols + start.x];
  seen[stack[0]] = 1;
  let reached = 0;
  while (stack.length) {
    const idx = stack.pop()!;
    reached++;
    const x = idx % cols;
    const y = (idx / cols) | 0;
    for (const d of DIRS) {
      let nx = x + d.x;
      let ny = y + d.y;
      if (wrap) {
        nx = (nx + cols) % cols;
        ny = (ny + rows) % rows;
      } else if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const n = ny * cols + nx;
      if (seen[n] || blocked.data[n]) continue;
      seen[n] = 1;
      stack.push(n);
    }
  }
  return reached === free;
}

export interface ObstacleRequest {
  spec: BoardSpec;
  pieces: number;
  shapes: Vec[][];
  snake: Vec[];
  dir: Dir;
  /** Extra cells to keep clear (portals, ...), with a 1-cell margin. */
  reserved: Vec[];
  rng: Rng;
}

/** Radius around the head (Chebyshev) where nothing hostile may spawn. */
export const HEAD_SAFE_RADIUS = 4;
/** Cells straight ahead of the head that are kept clear. */
export const HEAD_SAFE_AHEAD = 8;

/** Marks cells that must stay free of obstacles: snake (+1 margin), head zone, path ahead, reserved cells. */
export function buildForbiddenMask(spec: BoardSpec, snake: Vec[], dir: Dir, reserved: Vec[]): CellMask {
  const m = new CellMask(spec.cols, spec.rows);
  const mark = (x: number, y: number) => {
    if (spec.wrap) m.set((x + spec.cols) % spec.cols, (y + spec.rows) % spec.rows);
    else m.set(x, y);
  };
  const around = (p: Vec, r: number) => {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) mark(p.x + dx, p.y + dy);
  };
  for (const s of snake) around(s, 1);
  for (const r of reserved) around(r, 1);
  const head = snake[0];
  if (head) {
    around(head, HEAD_SAFE_RADIUS);
    const d = DIRS[dir];
    for (let k = 1; k <= HEAD_SAFE_AHEAD; k++) {
      const cx = head.x + d.x * k;
      const cy = head.y + d.y * k;
      mark(cx, cy);
      mark(cx + d.y, cy + d.x);
      mark(cx - d.y, cy - d.x);
    }
  }
  return m;
}

/** Places obstacle pieces one by one, keeping only placements that leave the layout safe. */
export function generateObstacles(req: ObstacleRequest): Vec[] {
  const { spec, pieces, shapes, snake, dir, reserved, rng } = req;
  const out: Vec[] = [];
  if (pieces <= 0 || shapes.length === 0 || snake.length === 0) return out;
  const forbidden = buildForbiddenMask(spec, snake, dir, reserved);
  const blocked = new CellMask(spec.cols, spec.rows);
  // Cells next to placed obstacles: keeps pieces apart so they never form walls.
  const spacing = new CellMask(spec.cols, spec.rows);

  for (let p = 0; p < pieces; p++) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const shape = rotateShape(rng.pick(shapes), rng.int(4));
      const ox = rng.int(spec.cols);
      const oy = rng.int(spec.rows);
      const cells = shape.map((s) => ({ x: ox + s.x, y: oy + s.y }));
      if (!cells.every((c) => blocked.inside(c.x, c.y) && !forbidden.get(c.x, c.y) && !spacing.get(c.x, c.y))) continue;
      for (const c of cells) blocked.set(c.x, c.y);
      if (!isLayoutSafe(spec, blocked, snake[0])) {
        for (const c of cells) blocked.set(c.x, c.y, false);
        continue;
      }
      for (const c of cells) {
        out.push(c);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) spacing.set(c.x + dx, c.y + dy);
      }
      break;
    }
  }
  return out;
}

/** Picks a random cell for which `ok` returns true (null when the board is full). */
export function randomFreeCell(spec: BoardSpec, rng: Rng, ok: (x: number, y: number) => boolean): Vec | null {
  for (let i = 0; i < 200; i++) {
    const x = rng.int(spec.cols);
    const y = rng.int(spec.rows);
    if (ok(x, y)) return { x, y };
  }
  // Fallback: scan from a random offset so crowded boards still find a cell.
  const total = spec.cols * spec.rows;
  const off = rng.int(total);
  for (let k = 0; k < total; k++) {
    const idx = (off + k) % total;
    const x = idx % spec.cols;
    const y = (idx / spec.cols) | 0;
    if (ok(x, y)) return { x, y };
  }
  return null;
}
