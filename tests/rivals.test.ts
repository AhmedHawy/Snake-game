import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../src/config/difficulty';
import { MODES } from '../src/config/modes';
import { SKINS, SKIN_ORDER, isUnlocked } from '../src/config/skins';
import { FOODS_PER_ZONE, ZONES } from '../src/config/zones';
import { cellKey } from '../src/core/spawn';
import { Game, type Rival } from '../src/core/state';
import type { Vec } from '../src/core/types';

function stepOnce(g: Game): void {
  const before = g.stepCount;
  while (g.stepCount === before && g.status === 'playing') g.update(1);
}

/** Replaces a rival's body (head first) and keeps it from moving on its own. */
function putRival(r: Rival, body: Vec[]): void {
  r.snake = body.map((c) => ({ ...c }));
  r.prevSnake = body.map((c) => ({ ...c }));
  r.cells.clear();
  for (const c of body) r.cells.set(cellKey(c.x, c.y), (r.cells.get(cellKey(c.x, c.y)) ?? 0) + 1);
  r.alive = true;
  r.moveTimer = -1e9;
}

/** Player heading up at (0, 0) with `len` segments below it; one rival lying across the path. */
function setup(mode: 'rivals' | 'zen', playerLen: number, rivalLen: number) {
  const g = new Game({ mode: MODES[mode], difficulty: DIFFICULTIES.easy, seed: 3 });
  g.world.clear();
  g.foods.length = 0;
  g.setSnake(Array.from({ length: playerLen }, (_, i) => ({ x: 0, y: i })));
  g.dir = 0;
  const [r, ...others] = g.rivals;
  for (const o of others) {
    o.alive = false;
    o.cells.clear();
    o.respawnMs = 1e9;
  }
  // Head at (2, -1), body running left through the cell the player moves into.
  putRival(r, Array.from({ length: rivalLen }, (_, i) => ({ x: 2 - i, y: -1 })));
  g.begin();
  return { g, r };
}

describe('rivals mode', () => {
  it('spawns more rivals on harder difficulties', () => {
    const easy = new Game({ mode: MODES.rivals, difficulty: DIFFICULTIES.easy, seed: 1 });
    const extreme = new Game({ mode: MODES.rivals, difficulty: DIFFICULTIES.extreme, seed: 1 });
    expect(easy.enemies.length).toBe(DIFFICULTIES.easy.rivals);
    expect(extreme.enemies.length).toBe(DIFFICULTIES.extreme.rivals);
    expect(new Game({ mode: MODES.classic, difficulty: DIFFICULTIES.easy, seed: 1 }).rivals.length).toBe(0);
    // Rivals start away from the player and never on the player's body.
    for (const r of extreme.rivals.filter((q) => q.alive)) {
      for (const c of r.snake) expect(extreme.snake.some((p) => p.x === c.x && p.y === c.y)).toBe(false);
    }
  });

  it('the bigger player eats a smaller rival', () => {
    const { g, r } = setup('rivals', 8, 4);
    const score = g.score;
    stepOnce(g);
    expect(g.status).toBe('playing');
    expect(r.alive).toBe(false);
    expect(g.rivalsKilled).toBe(1);
    expect(g.score).toBeGreaterThan(score);
    expect(g.events.some((e) => e.type === 'rivalKilled' && e.byPlayer)).toBe(true);
  });

  it('a bigger rival kills the player', () => {
    const { g, r } = setup('rivals', 4, 9);
    stepOnce(g);
    expect(['dying', 'over']).toContain(g.status);
    expect(r.alive).toBe(true);
  });

  it('equal length goes to the player', () => {
    const { g, r } = setup('rivals', 5, 5);
    stepOnce(g);
    expect(g.status).toBe('playing');
    expect(r.alive).toBe(false);
  });

  it('ghost passes through rivals', () => {
    const { g, r } = setup('rivals', 4, 9);
    g.effects.ghost = 5000;
    stepOnce(g);
    expect(g.status).toBe('playing');
    expect(r.alive).toBe(true);
  });

  it('in Zen rivals are harmless both ways', () => {
    const { g, r } = setup('zen', 4, 9);
    stepOnce(g);
    stepOnce(g);
    expect(g.status).toBe('playing');
    expect(r.alive).toBe(true);
    expect(g.rivalsKilled).toBe(0);
  });

  it('rivals only eat after the first player meal, then move, eat and respawn', () => {
    const g = new Game({ mode: MODES.zen, difficulty: DIFFICULTIES.extreme, seed: 9 });
    g.begin();
    const r = g.rivals[0];
    const foodAhead = () => {
      g.foods.length = 0;
      const f = g.spawnFood('apple')!;
      const d = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }][r.dir];
      f.pos = { x: r.snake[0].x + d.x, y: r.snake[0].y + d.y };
      f.prev = { ...f.pos };
      return f;
    };
    const start = r.snake[0];
    let f = foodAhead();
    const len = r.snake.length;
    for (let i = 0; i < 400; i++) g.update(1);
    expect(r.snake[0]).not.toEqual(start);
    // Player has not eaten yet: the rival leaves the food alone.
    expect(g.foods.includes(f)).toBe(true);
    expect(r.snake.length).toBe(len);
    g.foodsEaten = 1;
    f = foodAhead();
    for (let i = 0; i < 400; i++) g.update(1);
    expect(g.foods.includes(f)).toBe(false);
    expect(r.snake.length).toBe(len + 1);
    // A rival that falls far behind comes back near the player.
    putRival(r, [{ x: 999, y: 999 }, { x: 999, y: 1000 }, { x: 999, y: 1001 }]);
    r.moveTimer = 0;
    g.update(1);
    expect(Math.abs(r.snake[0].x - g.head.x)).toBeLessThan(60);
  });
});

it('rivals grow slower on easier difficulties', () => {
  expect(DIFFICULTIES.easy.rivalGrowth).toBeLessThan(DIFFICULTIES.normal.rivalGrowth);
  expect(DIFFICULTIES.normal.rivalGrowth).toBeLessThan(DIFFICULTIES.extreme.rivalGrowth);
});

describe('single world', () => {
  it('stays in the chosen world and speeds up every round', () => {
    const g = new Game({ mode: MODES.classic, difficulty: DIFFICULTIES.easy, seed: 2, zones: [ZONES[3]] });
    g.begin();
    const speed = g.stepMs;
    for (let i = 0; i < FOODS_PER_ZONE; i++) {
      g.foods.length = 0;
      const f = g.spawnFood('apple')!;
      const d = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }][g.dir];
      f.pos = { x: g.head.x + d.x, y: g.head.y + d.y };
      f.prev = { ...f.pos };
      g.world.clear();
      stepOnce(g);
    }
    expect(g.zone).toBe(ZONES[3]);
    expect(g.loop).toBe(1);
    expect(g.stepMs).toBeLessThan(speed);
  });
});

describe('skin unlocks', () => {
  it('every skin is a dragon with an ability; 6 free, the rest unlock by points', () => {
    expect(SKIN_ORDER.length).toBe(14);
    for (const id of SKIN_ORDER) {
      expect(SKINS[id].dragon).toBeTruthy();
      expect(SKINS[id].ability).toBeTruthy();
    }
    expect(new Set(SKIN_ORDER.map((id) => SKINS[id].ability)).size).toBe(14);
    expect(SKIN_ORDER.filter((id) => !SKINS[id].unlockAt).length).toBe(6);
    expect(isUnlocked('classic', 0)).toBe(true);
    expect(isUnlocked('dragon', 0)).toBe(true);
    expect(isUnlocked('dragonJade', 999)).toBe(false);
    expect(isUnlocked('dragonJade', 1000)).toBe(true);
    const locked = SKIN_ORDER.filter((id) => SKINS[id].unlockAt);
    const costs = locked.map((id) => SKINS[id].unlockAt!);
    expect([...costs].sort((a, b) => a - b)).toEqual(costs);
  });
});

describe('ally', () => {
  type Stepper = { stepRival(r: Rival, forced?: number): void };

  it('joins Rivals mode only, wearing the player\'s dragon', () => {
    const g = new Game({ mode: MODES.rivals, difficulty: DIFFICULTIES.easy, seed: 1, playerSkin: 'dragonFrost' });
    expect(g.ally).toBeTruthy();
    expect(g.ally!.skin).toBe('dragonFrost');
    expect(g.enemies.every((r) => r.skin !== 'dragonFrost')).toBe(true);
    expect(new Game({ mode: MODES.zen, difficulty: DIFFICULTIES.easy, seed: 1 }).ally).toBeUndefined();
    expect(new Game({ mode: MODES.classic, difficulty: DIFFICULTIES.easy, seed: 1 }).ally).toBeUndefined();
  });

  it('the player passes through the ally; neither dies', () => {
    const g = new Game({ mode: MODES.rivals, difficulty: DIFFICULTIES.easy, seed: 3 });
    g.world.clear();
    g.foods.length = 0;
    g.setSnake(Array.from({ length: 4 }, (_, i) => ({ x: 0, y: i })));
    g.dir = 0;
    for (const o of g.enemies) {
      o.alive = false;
      o.dead = true;
      o.cells.clear();
    }
    const ally = g.ally!;
    putRival(ally, Array.from({ length: 9 }, (_, i) => ({ x: 2 - i, y: -1 })));
    g.begin();
    stepOnce(g);
    stepOnce(g);
    expect(g.status).toBe('playing');
    expect(ally.alive).toBe(true);
  });

  it('beats smaller rivals and dies against bigger ones', () => {
    const g = new Game({ mode: MODES.rivals, difficulty: DIFFICULTIES.easy, seed: 3 });
    g.world.clear();
    g.foods.length = 0;
    g.setSnake(Array.from({ length: 4 }, (_, i) => ({ x: 50, y: 50 + i })));
    const [small, big, ...rest] = g.enemies;
    for (const o of rest) {
      o.alive = false;
      o.dead = true;
      o.cells.clear();
    }
    const ally = g.ally!;
    // Ally (6) heading up at (0,0); small rival (4) lies across y = -1.
    putRival(ally, Array.from({ length: 6 }, (_, i) => ({ x: 0, y: i })));
    putRival(small, Array.from({ length: 4 }, (_, i) => ({ x: 2 - i, y: -1 })));
    putRival(big, Array.from({ length: 12 }, (_, i) => ({ x: 6 - i, y: -3 })));
    g.begin();
    g.events.length = 0;
    const stepper = g as unknown as Stepper;
    stepper.stepRival(ally, 0);
    expect(small.alive).toBe(false);
    expect(ally.alive).toBe(true);
    expect(g.allyKills).toBe(1);
    stepper.stepRival(ally, 0);
    stepper.stepRival(ally, 0); // into the big rival
    expect(ally.alive).toBe(false);
    expect(big.alive).toBe(true);
    expect(g.events.some((e) => e.type === 'rivalKilled' && e.rival.ally)).toBe(true);
  });
});

describe('emperor', () => {
  it('crowned rivals can be eaten even when bigger than the player', () => {
    const g = new Game({ mode: MODES.rivals, difficulty: DIFFICULTIES.easy, seed: 3, playerSkin: 'dragonEmperor' });
    g.world.clear();
    g.foods.length = 0;
    g.setSnake(Array.from({ length: 4 }, (_, i) => ({ x: 0, y: i })));
    g.dir = 0;
    const [r, ...others] = g.rivals;
    for (const o of others) {
      o.alive = false;
      o.dead = true;
      o.cells.clear();
    }
    putRival(r, Array.from({ length: 20 }, (_, i) => ({ x: 2 - i, y: -1 })));
    g.begin();
    g.fireBreath();
    expect(r.alive).toBe(true);
    expect(r.markedMs).toBeGreaterThan(0);
    expect(r.snake.length).toBeGreaterThan(g.snake.length);
    stepOnce(g);
    expect(g.status).toBe('playing');
    expect(r.alive).toBe(false);
  });
});
