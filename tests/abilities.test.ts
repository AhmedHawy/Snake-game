import { describe, expect, it } from 'vitest';
import { DIFFICULTIES } from '../src/config/difficulty';
import { MODES } from '../src/config/modes';
import type { SkinId } from '../src/config/skins';
import { cellKey } from '../src/core/spawn';
import { AUTO_FIRE_GAP_MS, Game, MAX_CHARGES, WAVE_DELAY_MS, type Rival } from '../src/core/state';
import type { Vec } from '../src/core/types';

function stepOnce(g: Game): void {
  const before = g.stepCount;
  while (g.stepCount === before && g.status === 'playing') g.update(1);
}

function putRival(r: Rival, body: Vec[]): void {
  r.snake = body.map((c) => ({ ...c }));
  r.prevSnake = body.map((c) => ({ ...c }));
  r.cells.clear();
  for (const c of body) r.cells.set(cellKey(c.x, c.y), (r.cells.get(cellKey(c.x, c.y)) ?? 0) + 1);
  r.alive = true;
  r.dead = false;
  r.moveTimer = -1e9;
}

/** Player at (0,0) heading up with an apple right ahead; one rival lying across y = -3. Fire with fireBreath(). */
function setup(skin: SkinId, rivalLen: number, playerLen = 8, mode: 'rivals' | 'zen' = 'rivals') {
  const g = new Game({ mode: MODES[mode], difficulty: DIFFICULTIES.easy, seed: 4, playerSkin: skin });
  g.world.clear();
  g.setSnake(Array.from({ length: playerLen }, (_, i) => ({ x: 0, y: i })));
  g.dir = 0;
  const [r, ...others] = g.rivals;
  for (const o of others) {
    o.alive = false;
    o.dead = true;
    o.cells.clear();
  }
  putRival(r, Array.from({ length: rivalLen }, (_, i) => ({ x: 2 - i, y: -3 })));
  g.foods.length = 0;
  const f = g.spawnFood('apple')!;
  f.pos = { x: 0, y: -1 };
  f.prev = { ...f.pos };
  g.begin();
  return { g, r };
}

describe('dragon breath', () => {
  it('fire burns a rival ahead and keeps burning it', () => {
    const { g, r } = setup('dragon', 10);
    expect(g.fireBreath()).toBe(true);
    expect(g.events.some((e) => e.type === 'breath' && e.ability === 'fire')).toBe(true);
    expect(r.snake.length).toBe(8);
    expect(r.burnMs).toBeGreaterThan(0);
    g.steer(3); // turn away so the player doesn't run into it
    for (let i = 0; i < 1100; i++) g.update(1);
    expect(r.alive).toBe(true);
    expect(r.snake.length).toBeLessThan(8);
  });

  it('weakens a rival until it dies (and the player gets the points)', () => {
    const { g, r } = setup('dragon', 4);
    const score = g.score;
    g.fireBreath();
    expect(r.alive).toBe(false);
    expect(g.rivalsKilled).toBe(1);
    expect(g.score).toBeGreaterThan(score + 10);
  });

  it('ice freezes a rival, and a frozen rival can be eaten even if bigger', () => {
    const { g, r } = setup('dragonFrost', 20, 4);
    g.fireBreath();
    expect(r.frozenMs).toBeGreaterThan(0);
    const head = { ...r.snake[0] };
    for (let i = 0; i < 500; i++) g.update(1);
    expect(r.snake[0]).toEqual(head); // frozen: not moving
    // Run into it: the player wins despite being shorter.
    stepOnce(g);
    stepOnce(g);
    expect(g.status).toBe('playing');
    expect(r.alive).toBe(false);
  });

  it('leaf storm steals length from the rival', () => {
    const { g } = setup('dragonJade', 12);
    g.fireBreath();
    expect(g.pendingGrow).toBe(2);
  });

  it('lava leaves burning ground behind', () => {
    const { g } = setup('lava', 10);
    g.fireBreath();
    g.foods.length = 0; // no new charge, so no automatic breath refreshes the lava
    g.steer(3); // turn away instead of running into the (longer) rival
    expect(g.hazards.size).toBeGreaterThan(0);
    for (let i = 0; i < 3100; i++) g.update(1);
    expect(g.hazards.size).toBe(0);
  });

  it('is harmless to rivals in Zen', () => {
    const { g, r } = setup('dragonEmperor', 10, 8, 'zen');
    g.fireBreath();
    expect(r.snake.length).toBe(10);
    expect(r.alive).toBe(true);
  });

  it('breaks obstacles in its path', () => {
    const g = new Game({ mode: MODES.classic, difficulty: DIFFICULTIES.hard, seed: 11, playerSkin: 'dragonSea' });
    const o = g.world.cells().find((c) => !g.world.has(c.x, c.y + 1) && !g.world.has(c.x, c.y + 2) && !g.world.has(c.x, c.y + 3))!;
    expect(o).toBeTruthy();
    g.setSnake([3, 4, 5, 6].map((k) => ({ x: o.x, y: o.y + k })));
    g.dir = 0;
    g.effects.ghost = 1e9; // ignore whatever the test body overlaps
    g.begin();
    g.fireBreath();
    expect(g.world.has(o.x, o.y)).toBe(false);
    expect(g.smashed).toBeGreaterThan(0);
  });
});

describe('breath charges', () => {
  it('eating only shows off the breath and stores a charge; firing spends it', () => {
    // A shorter rival: no automatic breath.
    const { g, r } = setup('dragon', 6);
    expect(g.charges).toBe(1);
    stepOnce(g); // eats the apple
    const shows = g.events.filter((e) => e.type === 'breath');
    expect(shows.length).toBe(1);
    expect(shows[0].type === 'breath' && shows[0].real).toBe(false);
    expect(r.snake.length).toBe(6);
    expect(r.burnMs).toBe(0);
    expect(g.charges).toBe(2);
    expect(g.fireBreath()).toBe(true);
    expect(g.fireBreath()).toBe(true);
    expect(g.fireBreath()).toBe(false); // out of charges
    expect(g.charges).toBe(0);
  });

  it('stores at most 5 charges; a golden star makes the next one a super breath', () => {
    const g = new Game({ mode: MODES.zen, difficulty: DIFFICULTIES.easy, seed: 2 });
    g.begin();
    for (let i = 0; i < 7; i++) {
      g.foods.length = 0;
      const f = g.spawnFood(i === 6 ? 'golden' : 'apple')!;
      const d = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }][g.dir];
      f.pos = { x: g.head.x + d.x, y: g.head.y + d.y };
      f.prev = { ...f.pos };
      stepOnce(g);
    }
    expect(g.charges).toBe(MAX_CHARGES);
    expect(MAX_CHARGES).toBe(5);
    expect(g.strongCharge).toBe(true);
    g.events.length = 0;
    g.fireBreath();
    const e = g.events.find((ev) => ev.type === 'breath');
    expect(e && e.type === 'breath' && e.strong && e.real).toBe(true);
    expect(g.strongCharge).toBe(false);
  });
});

describe('auto breath', () => {
  it('fires by itself at a longer rival in reach, again and again until it is beatable', () => {
    // Player (8) heading up; a longer rival (14) lies across y = -3, inside the fire cone.
    const { g, r } = setup('dragon', 14);
    g.foods.length = 0;
    g.charges = 5;
    g.steer(3); // turn away after the first step so the player doesn't run into it
    g.update(1);
    expect(g.charges).toBe(4); // first automatic breath
    expect(r.snake.length).toBeLessThan(14);
    // Within the gap: no second shot yet.
    g.update(AUTO_FIRE_GAP_MS / 2);
    expect(g.charges).toBe(4);
  });

  it('keeps firing while the rival is still longer', () => {
    const g = new Game({ mode: MODES.rivals, difficulty: DIFFICULTIES.easy, seed: 4, playerSkin: 'dragon' });
    g.world.clear();
    g.foods.length = 0;
    g.setSnake(Array.from({ length: 8 }, (_, i) => ({ x: 0, y: i })));
    g.dir = 0;
    const [r, ...others] = g.rivals;
    for (const o of others) {
      o.alive = false;
      o.dead = true;
      o.cells.clear();
    }
    putRival(r, Array.from({ length: 16 }, (_, i) => ({ x: 2 - i, y: -3 })));
    g.charges = 5;
    g.begin();
    // Fire repeatedly without moving the player.
    for (let k = 0; k < 4; k++) {
      (g as unknown as { autoFire(dt: number): void }).autoFire(AUTO_FIRE_GAP_MS);
    }
    expect(g.charges).toBeLessThan(4);
    expect(r.snake.length <= g.snake.length || !r.alive).toBe(true);
  });

  it('does not fire at rivals that are shorter or harmless (Zen)', () => {
    const { g } = setup('dragon', 5);
    g.charges = 5;
    g.update(1);
    expect(g.charges).toBe(5);
    const z = setup('dragon', 14, 8, 'zen');
    z.g.charges = 5;
    z.g.update(1);
    expect(z.g.charges).toBe(5);
  });
});

describe('rival waves', () => {
  it('dead rivals stay dead; a bigger wave arrives 5 s after the last one falls', () => {
    const g = new Game({ mode: MODES.rivals, difficulty: DIFFICULTIES.easy, seed: 6 });
    g.begin();
    const first = g.rivals.length;
    // Kill them all.
    for (const r of g.rivals) {
      r.alive = false;
      r.dead = true;
      r.cells.clear();
    }
    g.update(1);
    expect(g.events.some((e) => e.type === 'waveCleared')).toBe(true);
    for (let t = 0; t < WAVE_DELAY_MS - 100; t += 50) g.update(50);
    expect(g.rivals.every((r) => r.dead)).toBe(true);
    for (let t = 0; t < 300; t += 50) g.update(50);
    expect(g.wave).toBe(2);
    expect(g.rivals.length).toBe(first + 1);
    expect(g.rivals.some((r) => r.alive)).toBe(true);
  });
});
