import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../src/config/difficulty';
import { MODES } from '../src/config/modes';
import { ZONES } from '../src/config/zones';
import { Rng } from '../src/core/rng';
import { CHUNK, ObstacleWorld, cellKey, isWindowSafe, rotateShape } from '../src/core/spawn';
import { Game, HEAD_SAFE_RADIUS } from '../src/core/state';

describe('window safety', () => {
  const fromSet = (cells: [number, number][]) => {
    const s = new Set(cells.map(([x, y]) => cellKey(x, y)));
    return (x: number, y: number) => s.has(cellKey(x, y));
  };

  it('detects enclosed pockets', () => {
    // Ring around (0,0).
    const ring = fromSet([[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]);
    expect(isWindowSafe(ring, -4, -4, 4, 4)).toBe(false);
  });

  it('detects dead-ends', () => {
    const u = fromSet([[-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1]]);
    expect(isWindowSafe(u, -4, -4, 4, 4)).toBe(false);
  });

  it('accepts open layouts', () => {
    expect(isWindowSafe(fromSet([[0, 0], [1, 0]]), -4, -4, 4, 4)).toBe(true);
  });

  it('rotates shapes and normalizes them', () => {
    const r = rotateShape([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }], 1);
    expect(r).toEqual([{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 0, y: 2 }]);
  });
});

describe('obstacle world', () => {
  it('generates chunks around a point, keeps pieces apart and every area safe (all zones)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const zone = ZONES[seed % ZONES.length];
      const w = new ObstacleWorld(new Rng(seed), zone.obstacleShapes, 4);
      w.update(0, 0, 2, () => false);
      expect(w.chunkCount).toBe(25);
      const cells = w.cells();
      expect(cells.length).toBeGreaterThan(0);
      const has = (x: number, y: number) => w.has(x, y);
      expect(isWindowSafe(has, -2 * CHUNK, -2 * CHUNK, 3 * CHUNK - 1, 3 * CHUNK - 1)).toBe(true);
    }
  });

  it('respects the forbidden area and drops far chunks', () => {
    const w = new ObstacleWorld(new Rng(3), ZONES[0].obstacleShapes, 6);
    w.update(0, 0, 2, (x, y) => Math.abs(x) < 10 && Math.abs(y) < 10);
    for (const c of w.cells()) expect(Math.abs(c.x) < 10 && Math.abs(c.y) < 10).toBe(false);
    w.update(400, 0, 2, () => false);
    for (const c of w.cells()) expect(c.x).toBeGreaterThan(200);
  });
});

describe('game obstacles', () => {
  it('never places obstacles on or near the snake or its head (many seeds)', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const g = new Game({ mode: MODES.portal, difficulty: DIFFICULTIES.hard, seed });
      const head = g.head;
      for (const c of g.world.cells()) {
        expect(Math.max(Math.abs(c.x - head.x), Math.abs(c.y - head.y))).toBeGreaterThan(HEAD_SAFE_RADIUS);
        for (const s of g.snake) expect(Math.max(Math.abs(c.x - s.x), Math.abs(c.y - s.y))).toBeGreaterThan(1);
        expect(c.x === head.x && c.y < head.y && c.y >= head.y - 8).toBe(false);
        for (const p of g.portals) {
          expect(Math.max(Math.abs(c.x - p.a.x), Math.abs(c.y - p.a.y))).toBeGreaterThan(1);
          expect(Math.max(Math.abs(c.x - p.b.x), Math.abs(c.y - p.b.y))).toBeGreaterThan(1);
        }
      }
    }
  });

  it('places obstacles on harder difficulties and none in zen / easy', () => {
    expect(new Game({ mode: MODES.classic, difficulty: DIFFICULTIES.hard, seed: 3 }).world.cells().length).toBeGreaterThan(0);
    expect(new Game({ mode: MODES.classic, difficulty: DIFFICULTIES.easy, seed: 3 }).world.cells().length).toBe(0);
    expect(new Game({ mode: MODES.zen, difficulty: DIFFICULTIES.hard, seed: 3 }).world.cells().length).toBe(0);
  });

  it('keeps generating the world as the snake travels', () => {
    const g = new Game({ mode: MODES.classic, difficulty: DIFFICULTIES.normal, seed: 4 });
    g.effects.ghost = 1e12;
    g.begin();
    // Ghost does not protect from obstacles, so steer around them.
    for (let i = 0; i < 600 && g.status === 'playing'; i++) {
      const before = g.stepCount;
      const d = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }][g.dir];
      if (g.isBlocked(g.head.x + d.x, g.head.y + d.y) || g.moverAt(g.head.x + d.x, g.head.y + d.y)) {
        g.steer(((g.dir + 1) % 4) as 0 | 1 | 2 | 3);
      }
      while (g.stepCount === before && g.status === 'playing') g.update(1);
    }
    expect(g.status).toBe('playing');
    const near = g.world.cells().filter((c) => Math.abs(c.x - g.head.x) < 40 && Math.abs(c.y - g.head.y) < 40);
    expect(near.length).toBeGreaterThan(0);
    // Far chunks are dropped, so memory stays bounded.
    expect(g.world.chunkCount).toBeLessThanOrEqual(81);
  });

  it('extreme has moving obstacles that never step next to the head', () => {
    const g = new Game({ mode: MODES.classic, difficulty: DIFFICULTIES.extreme, seed: 9 });
    expect(g.movers.length).toBeGreaterThan(0);
    g.effects.ghost = 1e9;
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
