import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../src/config/difficulty';
import { BASIC_TYPES, FOODS } from '../src/config/food';
import { MODES } from '../src/config/modes';
import { FOODS_PER_ZONE } from '../src/config/zones';
import { Game, type FoodItem } from '../src/core/state';

const make = (over: Partial<ConstructorParameters<typeof Game>[0]> = {}) =>
  new Game({ mode: MODES.classic, difficulty: DIFFICULTIES.normal, seed: 42, ...over });

/** Runs the simulation until exactly one more step has happened. */
function stepOnce(g: Game): void {
  const before = g.stepCount;
  while (g.stepCount === before && g.status === 'playing') g.update(1);
}

/** Puts a food item directly in front of the head. */
function placeAhead(g: Game, type: FoodItem['type']): FoodItem {
  const f = g.spawnFood(type)!;
  const h = g.head;
  f.pos = { x: h.x, y: h.y - 1 };
  f.prev = { ...f.pos };
  return f;
}

describe('Game basics', () => {
  it('starts in ready state and begins on first input', () => {
    const g = make();
    expect(g.status).toBe('ready');
    g.update(1000);
    expect(g.stepCount).toBe(0);
    expect(g.steer(1)).toBe(true);
    expect(g.status).toBe('playing');
  });

  it('ignores 180° reversal and same-direction input', () => {
    const g = make();
    g.begin();
    expect(g.dir).toBe(0);
    expect(g.steer(2)).toBe(false); // reverse
    expect(g.steer(0)).toBe(false); // same
    expect(g.queue).toEqual([]);
  });

  it('buffers quick double-turns so a U-turn works across two steps', () => {
    const g = make();
    g.begin();
    expect(g.steer(1)).toBe(true); // right
    expect(g.steer(2)).toBe(true); // then down (valid relative to right)
    const start = { ...g.head };
    stepOnce(g);
    expect(g.head).toEqual({ x: start.x + 1, y: start.y });
    stepOnce(g);
    expect(g.head).toEqual({ x: start.x + 1, y: start.y + 1 });
  });

  it('rejects a reversal relative to the last queued turn', () => {
    const g = make();
    g.begin();
    g.steer(1);
    expect(g.steer(3)).toBe(false);
  });

  it('grows after eating an apple and scores points', () => {
    const g = make({ mode: MODES.zen });
    g.foods.length = 0;
    g.begin();
    placeAhead(g, 'apple');
    const len = g.snake.length;
    stepOnce(g);
    expect(g.score).toBe(FOODS.apple.points);
    stepOnce(g);
    expect(g.snake.length).toBe(len + 1);
  });

  it('has no walls: the snake can travel far in any direction', () => {
    const g = make({ mode: { ...MODES.classic, obstacles: false } });
    g.begin();
    for (let i = 0; i < 300; i++) stepOnce(g);
    expect(g.status).toBe('playing');
    expect(g.head.y).toBeLessThan(-250);
    g.steer(3);
    for (let i = 0; i < 300; i++) stepOnce(g);
    expect(g.status).toBe('playing');
    expect(g.head.x).toBeLessThan(-250);
  });

  it('crashes into obstacles', () => {
    const g = make({ difficulty: DIFFICULTIES.hard });
    g.begin();
    // Find an obstacle and drive the snake straight into it.
    const o = g.world.cells()[0];
    g.setSnake([{ x: o.x, y: o.y + 1 }, { x: o.x, y: o.y + 2 }, { x: o.x, y: o.y + 3 }]);
    g.dir = 0;
    stepOnce(g);
    expect(g.status).toBe('dying');
  });

  it('dies when biting itself unless ghost is active', () => {
    const g = make({ mode: { ...MODES.classic, obstacles: false }, startLength: 8 });
    g.foods.length = 0;
    g.begin();
    g.steer(1);
    stepOnce(g);
    g.steer(2);
    stepOnce(g);
    g.steer(3);
    stepOnce(g);
    expect(g.status).toBe('dying');

    const h = make({ mode: { ...MODES.classic, obstacles: false }, startLength: 8 });
    h.foods.length = 0;
    h.effects.ghost = 10000;
    h.begin();
    h.steer(1);
    stepOnce(h);
    h.steer(2);
    stepOnce(h);
    h.steer(3);
    stepOnce(h);
    expect(h.status).toBe('playing');
  });

  it('builds combos when eating quickly', () => {
    const g = make({ mode: MODES.zen });
    g.begin();
    g.foods.length = 0;
    placeAhead(g, 'apple');
    stepOnce(g);
    expect(g.comboMult).toBe(1);
    g.foods.length = 0;
    placeAhead(g, 'apple');
    stepOnce(g);
    expect(g.comboMult).toBe(2);
    expect(g.score).toBe(10 + 20);
  });

  it('shrink removes tail segments but keeps a minimum length', () => {
    const g = make({ mode: MODES.zen, startLength: 6 });
    g.begin();
    g.foods.length = 0;
    placeAhead(g, 'shrink');
    stepOnce(g);
    expect(g.snake.length).toBe(3);
  });

  it('speed boost doubles points and shortens step time', () => {
    const g = make({ mode: MODES.zen });
    const normal = g.stepMs;
    g.effects.speed = 5000;
    expect(g.stepMs).toBeLessThan(normal);
    g.begin();
    g.foods.length = 0;
    placeAhead(g, 'apple');
    stepOnce(g);
    expect(g.score).toBe(20);
  });

  it('golden apples expire', () => {
    const g = make();
    g.begin();
    const f = g.spawnFood('golden')!;
    g.update(DIFFICULTIES.normal.goldenLifetimeMs + 10);
    expect(g.foods.includes(f)).toBe(false);
  });

  it('advances zone every N foods', () => {
    const g = make({ mode: MODES.zen });
    g.begin();
    for (let i = 0; i < FOODS_PER_ZONE; i++) {
      g.foods.length = 0;
      placeAhead(g, 'apple');
      g.steer(i % 2 ? 1 : 3);
      g.queue.length = 0;
      stepOnce(g);
    }
    expect(g.zoneIndex).toBe(1);
  });

  it('time attack ends after the time limit', () => {
    const g = make({ mode: MODES.timeAttack, difficulty: DIFFICULTIES.easy });
    g.begin();
    for (let t = 0; t < 61000 && g.status === 'playing'; t += 10) g.update(10);
    expect(g.status).toBe('over');
  });

  it('portal mode places linked portal pairs away from the snake', () => {
    const g = make({ mode: MODES.portal });
    expect(g.portals.length).toBe(2);
    for (const p of g.portals) {
      for (const s of g.snake) {
        expect(Math.max(Math.abs(p.a.x - s.x), Math.abs(p.a.y - s.y))).toBeGreaterThan(1);
      }
    }
  });

  it('food never spawns on the snake, obstacles or portals', () => {
    for (let seed = 1; seed < 30; seed++) {
      const g = make({ mode: MODES.portal, difficulty: DIFFICULTIES.hard, seed });
      for (let i = 0; i < 20; i++) g.spawnFood('apple');
      for (const f of g.foods) {
        expect(g.snake.some((s) => s.x === f.pos.x && s.y === f.pos.y)).toBe(false);
        expect(g.isBlocked(f.pos.x, f.pos.y)).toBe(false);
        expect(g.isPortal(f.pos.x, f.pos.y)).toBe(false);
      }
    }
  });

  it('ghost passes through obstacles without dying', () => {
    const g = make({ difficulty: DIFFICULTIES.hard });
    g.begin();
    const o = g.world.cells()[0];
    g.setSnake([{ x: o.x, y: o.y + 1 }, { x: o.x, y: o.y + 2 }, { x: o.x, y: o.y + 3 }]);
    g.dir = 0;
    g.effects.ghost = 5000;
    stepOnce(g);
    expect(g.status).toBe('playing');
    expect(g.head).toEqual({ x: o.x, y: o.y });
  });

  it('magnet pulls food straight into the mouth and eats it', () => {
    const g = make({ mode: MODES.zen });
    g.begin();
    g.foods.length = 0;
    g.effects.magnet = 5000;
    // Food two cells to the side: the snake keeps going straight.
    const f = g.spawnFood('egg')!;
    f.pos = { x: g.head.x + 2, y: g.head.y - 1 };
    f.prev = { ...f.pos };
    const before = g.score;
    for (let i = 0; i < 3 && g.foods.includes(f); i++) stepOnce(g);
    expect(g.foods.includes(f)).toBe(false);
    expect(g.score).toBeGreaterThan(before);
    expect(g.dir).toBe(0);
  });

  it('everyday food comes in several kinds worth different points', () => {
    const points = new Set(BASIC_TYPES.map((t) => FOODS[t].points));
    expect(BASIC_TYPES.length).toBeGreaterThanOrEqual(4);
    expect(points.size).toBe(BASIC_TYPES.length);
    const seen = new Set<string>();
    const g = make({ mode: MODES.zen, seed: 7 });
    g.begin();
    for (let i = 0; i < 60; i++) {
      const basic = g.foods.find((f) => BASIC_TYPES.includes(f.type))!;
      seen.add(basic.type);
      basic.pos = { x: g.head.x, y: g.head.y - 1 };
      basic.prev = { ...basic.pos };
      stepOnce(g);
    }
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });
});
