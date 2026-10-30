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
    expect(easy.rivals.length).toBe(DIFFICULTIES.easy.rivals);
    expect(extreme.rivals.length).toBe(DIFFICULTIES.extreme.rivals);
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

  it('rivals move, eat food and respawn after dying', () => {
    const g = new Game({ mode: MODES.zen, difficulty: DIFFICULTIES.normal, seed: 9 });
    g.begin();
    const r = g.rivals[0];
    const start = r.snake[0];
    // Food right in front of the rival.
    g.foods.length = 0;
    const f = g.spawnFood('apple')!;
    const d = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }][r.dir];
    f.pos = { x: start.x + d.x, y: start.y + d.y };
    f.prev = { ...f.pos };
    const len = r.snake.length;
    for (let i = 0; i < 400; i++) g.update(1);
    expect(r.snake[0]).not.toEqual(start);
    expect(g.foods.includes(f)).toBe(false);
    expect(r.snake.length).toBe(len + 1);
    // A rival that falls far behind comes back near the player.
    putRival(r, [{ x: 999, y: 999 }, { x: 999, y: 1000 }, { x: 999, y: 1001 }]);
    r.moveTimer = 0;
    g.update(1);
    expect(Math.abs(r.snake[0].x - g.head.x)).toBeLessThan(60);
  });
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
  it('unlocks dragons by total points; old skins stay free', () => {
    expect(isUnlocked('classic', 0)).toBe(true);
    expect(isUnlocked('dragon', 0)).toBe(true);
    expect(isUnlocked('dragonJade', 999)).toBe(false);
    expect(isUnlocked('dragonJade', 1000)).toBe(true);
    const locked = SKIN_ORDER.filter((id) => SKINS[id].unlockAt);
    expect(locked).toEqual(['dragonJade', 'dragonFrost', 'dragonGold', 'dragonShadow']);
    const costs = locked.map((id) => SKINS[id].unlockAt!);
    expect([...costs].sort((a, b) => a - b)).toEqual(costs);
  });
});
