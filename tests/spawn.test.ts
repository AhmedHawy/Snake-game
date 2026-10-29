import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../src/config/difficulty';
import { MODES } from '../src/config/modes';
import { ZONES } from '../src/config/zones';
import { Rng } from '../src/core/rng';
import { CellMask, HEAD_SAFE_RADIUS, generateObstacles, isLayoutSafe, rotateShape } from '../src/core/spawn';
import { Game } from '../src/core/state';
import type { Vec } from '../src/core/types';

const spec = { cols: 17, rows: 30, wrap: false };
const snake: Vec[] = [
  { x: 8, y: 18 },
  { x: 8, y: 19 },
  { x: 8, y: 20 },
  { x: 8, y: 21 },
];

describe('layout safety', () => {
  it('detects unreachable regions', () => {
    const m = new CellMask(5, 5);
    for (let x = 0; x < 5; x++) m.set(x, 2); // full wall splits the board
    expect(isLayoutSafe({ cols: 5, rows: 5, wrap: false }, m, { x: 0, y: 0 })).toBe(false);
  });

  it('detects dead-end pockets', () => {
    const m = new CellMask(6, 6);
    m.set(1, 0); // corner cell (0,0) now has 3 blocked sides (2 walls + obstacle)
    expect(isLayoutSafe({ cols: 6, rows: 6, wrap: false }, m, { x: 3, y: 3 })).toBe(false);
  });

  it('accepts an open board', () => {
    const m = new CellMask(6, 6);
    m.set(3, 3);
    expect(isLayoutSafe({ cols: 6, rows: 6, wrap: false }, m, { x: 0, y: 3 })).toBe(true);
  });

  it('rotates shapes and normalizes them', () => {
    const r = rotateShape([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], 1);
    expect(r).toEqual([{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }]);
  });
});

describe('obstacle generation', () => {
  it('never traps the snake, never touches it, and keeps the head area clear (many seeds, all zones)', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const zone = ZONES[seed % ZONES.length];
      const cells = generateObstacles({
        spec, pieces: 10, shapes: zone.obstacleShapes, snake, dir: 0, reserved: [], rng: new Rng(seed),
      });
      const m = new CellMask(spec.cols, spec.rows);
      for (const c of cells) m.set(c.x, c.y);
      expect(isLayoutSafe(spec, m, snake[0])).toBe(true);
      for (const c of cells) {
        const head = snake[0];
        expect(Math.max(Math.abs(c.x - head.x), Math.abs(c.y - head.y))).toBeGreaterThan(HEAD_SAFE_RADIUS);
        for (const s of snake) expect(Math.max(Math.abs(c.x - s.x), Math.abs(c.y - s.y))).toBeGreaterThan(1);
        // Path straight ahead (up) stays clear.
        expect(c.x === head.x && c.y < head.y && c.y >= head.y - 8).toBe(false);
      }
    }
  });

  it('places obstacles on harder difficulties and none in zen / easy', () => {
    expect(new Game({ cols: 17, rows: 30, mode: MODES.classic, difficulty: DIFFICULTIES.hard, seed: 3 }).obstacles.length).toBeGreaterThan(0);
    expect(new Game({ cols: 17, rows: 30, mode: MODES.classic, difficulty: DIFFICULTIES.easy, seed: 3 }).obstacles.length).toBe(0);
    expect(new Game({ cols: 17, rows: 30, mode: MODES.zen, difficulty: DIFFICULTIES.hard, seed: 3 }).obstacles.length).toBe(0);
  });

  it('extreme has moving obstacles that never step next to the head', () => {
    const g = new Game({ cols: 17, rows: 30, mode: MODES.classic, difficulty: DIFFICULTIES.extreme, seed: 9 });
    expect(g.movers.length).toBeGreaterThan(0);
    g.effects.ghost = 1e9; // keep it alive while circling
    g.begin();
    for (let i = 0; i < 400 && g.status === 'playing'; i++) {
      if (i % 6 === 0) g.steer(((g.dir + 1) % 4) as 0 | 1 | 2 | 3);
      const before = g.stepCount;
      while (g.stepCount === before && g.status === 'playing') g.update(1);
      for (const m of g.movers) {
        const moved = m.pos.x !== m.prev.x || m.pos.y !== m.prev.y;
        if (moved) expect(Math.max(Math.abs(m.pos.x - g.head.x), Math.abs(m.pos.y - g.head.y))).toBeGreaterThan(1);
      }
    }
  });
});
