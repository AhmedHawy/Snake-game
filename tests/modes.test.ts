import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, DIFFICULTY_ORDER } from '../src/config/difficulty';
import { MODES } from '../src/config/modes';
import { FOODS_PER_ZONE, ZONES } from '../src/config/zones';
import { Game } from '../src/core/state';

function stepOnce(g: Game): void {
  const before = g.stepCount;
  while (g.stepCount === before && g.status === 'playing') g.update(1);
}

/** Eats an apple placed right in front of the head (keeps steering in a safe loop). */
function eatAhead(g: Game): void {
  g.foods.length = 0;
  const f = g.spawnFood('apple')!;
  const d = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }][g.dir];
  f.pos = { x: g.head.x + d.x, y: g.head.y + d.y };
  f.prev = { ...f.pos };
  stepOnce(g);
}

describe('modes', () => {
  it('portal mode teleports the head to the linked portal', () => {
    const g = new Game({ mode: MODES.portal, difficulty: DIFFICULTIES.easy, seed: 5 });
    const p = g.portals[0];
    g.foods.length = 0;
    // Put the head right below portal A, heading up.
    g.setSnake([{ x: p.a.x, y: p.a.y + 1 }, { x: p.a.x, y: p.a.y + 2 }, { x: p.a.x, y: p.a.y + 3 }]);
    g.dir = 0;
    g.begin();
    stepOnce(g);
    expect(g.head).toEqual(p.b);
    expect(g.teleported).toBe(true);
  });

  it('zen mode never dies from walls or own body', () => {
    const g = new Game({ mode: MODES.zen, difficulty: DIFFICULTIES.extreme, seed: 1, startLength: 10 });
    g.begin();
    for (let i = 0; i < 500; i++) {
      if (i % 3 === 0) g.steer(((g.dir + 1) % 4) as 0 | 1 | 2 | 3);
      stepOnce(g);
    }
    expect(g.status).toBe('playing');
    expect(g.foods.some((f) => f.type === 'poison')).toBe(false);
  });

  it('time attack has a 60 second limit', () => {
    expect(MODES.timeAttack.timeLimitMs).toBe(60000);
  });
});

describe('difficulty', () => {
  it('gets progressively faster and denser', () => {
    for (let i = 1; i < DIFFICULTY_ORDER.length; i++) {
      const a = DIFFICULTIES[DIFFICULTY_ORDER[i - 1]];
      const b = DIFFICULTIES[DIFFICULTY_ORDER[i]];
      expect(b.baseStepMs).toBeLessThan(a.baseStepMs);
      expect(b.rampMsPerFood).toBeGreaterThanOrEqual(a.rampMsPerFood);
      expect(b.goldenLifetimeMs).toBeLessThanOrEqual(a.goldenLifetimeMs);
    }
    expect(DIFFICULTIES.easy.obstaclesPerChunk).toBe(0);
    expect(DIFFICULTIES.normal.poisonChance).toBe(0);
    expect(DIFFICULTIES.extreme.movingObstacles).toBeGreaterThan(0);
  });

  it('speed ramps with food and never goes below the floor', () => {
    const g = new Game({ mode: MODES.zen, difficulty: DIFFICULTIES.normal, seed: 2 });
    const start = g.stepMs;
    g.foodsEaten = 30;
    expect(g.stepMs).toBeLessThan(start);
    g.foodsEaten = 10000;
    expect(g.stepMs).toBeCloseTo(DIFFICULTIES.normal.minStepMs);
  });

  it('loops back to the first zone with a faster speed tier', () => {
    const g = new Game({ mode: MODES.zen, difficulty: DIFFICULTIES.easy, seed: 3 });
    g.begin();
    const before = g.stepMs;
    for (let i = 0; i < FOODS_PER_ZONE * ZONES.length; i++) {
      if (i % 5 === 0) g.dir = ((g.dir + 1) % 4) as 0 | 1 | 2 | 3;
      eatAhead(g);
    }
    expect(g.zoneIndex).toBe(0);
    expect(g.loop).toBe(1);
    g.foodsEaten = 0;
    expect(g.stepMs).toBeLessThan(before);
  });
});

describe('zone change obstacles', () => {
  it('regenerated obstacles stay away from the snake on every zone change', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = new Game({ mode: MODES.classic, difficulty: DIFFICULTIES.hard, seed, startLength: 6 });
      g.effects.ghost = 1e9;
      g.begin();
      for (let z = 0; z < ZONES.length && g.status === 'playing'; z++) {
        const before = g.world.cells().length;
        g.foodsEaten = (z + 1) * FOODS_PER_ZONE - 1;
        (g as unknown as { advanceZone(): void }).advanceZone();
        expect(g.oldObstacles.length).toBe(before);
        for (const o of g.world.cells()) {
          for (const s of g.snake) expect(Math.max(Math.abs(o.x - s.x), Math.abs(o.y - s.y))).toBeGreaterThan(1);
        }
        for (const f of g.foods) expect(g.isBlocked(f.pos.x, f.pos.y)).toBe(false);
        for (let i = 0; i < 3; i++) stepOnce(g);
      }
    }
  });
});
