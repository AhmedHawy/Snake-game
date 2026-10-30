import { describe, expect, it } from 'vitest';
import { ABILITIES } from '../src/config/abilities';
import { DIFFICULTIES } from '../src/config/difficulty';
import { LEVEL_XP, boostAbility, levelFor, nextLevelXp } from '../src/config/levels';
import { MODES } from '../src/config/modes';
import { cellKey } from '../src/core/spawn';
import { ALLY_BREATH_MS, BOSS_EVERY, Game, WAVE_DELAY_MS, type Rival } from '../src/core/state';
import type { Vec } from '../src/core/types';
import { addDragonXp, dragonXp, type KV } from '../src/storage/storage';

const memory = (): KV => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};

function putRival(r: Rival, body: Vec[], dir: 0 | 1 | 2 | 3 = 0): void {
  r.snake = body.map((c) => ({ ...c }));
  r.prevSnake = body.map((c) => ({ ...c }));
  r.cells.clear();
  for (const c of body) r.cells.set(cellKey(c.x, c.y), (r.cells.get(cellKey(c.x, c.y)) ?? 0) + 1);
  r.alive = true;
  r.dead = false;
  r.dir = dir;
  r.moveTimer = -1e9;
}

function clearRivals(g: Game, keep: Rival[] = []): void {
  for (const o of g.rivals) {
    if (keep.includes(o)) continue;
    o.alive = false;
    o.dead = true;
    o.cells.clear();
  }
}

describe('dragon levels', () => {
  it('levels go from 1 to 5 with experience', () => {
    expect(levelFor(0)).toBe(1);
    expect(levelFor(LEVEL_XP[1] - 1)).toBe(1);
    expect(levelFor(LEVEL_XP[1])).toBe(2);
    expect(levelFor(1e9)).toBe(5);
    expect(nextLevelXp(5)).toBeNull();
    expect(nextLevelXp(1)).toBe(LEVEL_XP[1]);
  });

  it('higher levels make the breath reach further, hit harder and last longer', () => {
    const fire = ABILITIES.fire;
    expect(boostAbility(fire, 1)).toBe(fire);
    const l5 = boostAbility(fire, 5);
    expect(l5.range).toBe(fire.range + 2);
    expect(l5.damage).toBe(fire.damage + 2);
    expect(l5.burnMs!).toBeGreaterThan(fire.burnMs!);
    const g = new Game({ mode: MODES.zen, difficulty: DIFFICULTIES.easy, seed: 1, playerSkin: 'dragon', abilityLevel: 4 });
    expect(g.ability.range).toBe(fire.range + 2);
  });

  it('stores experience per dragon', () => {
    const kv = memory();
    expect(dragonXp('dragon', kv)).toBe(0);
    addDragonXp('dragon', 300, kv);
    expect(addDragonXp('dragon', 250, kv)).toBe(550);
    expect(dragonXp('dragonSea', kv)).toBe(0);
  });
});

describe('boss', () => {
  it('every 5th wave is led by a huge boss', () => {
    const g = new Game({ mode: MODES.rivals, difficulty: DIFFICULTIES.easy, seed: 6 });
    g.begin();
    g.wave = BOSS_EVERY - 1;
    clearRivals(g, [g.ally!]);
    g.update(1);
    for (let t = 0; t <= WAVE_DELAY_MS + 100; t += 50) g.update(50);
    expect(g.wave).toBe(BOSS_EVERY);
    const boss = g.rivals.find((r) => r.boss);
    expect(boss).toBeTruthy();
    expect(boss!.snake.length).toBeGreaterThan(g.snake.length + 10);
    expect(boss!.skin).not.toBe(g.playerSkin);
  });

  it('breathes fire at the player, who shrinks', () => {
    const g = new Game({ mode: MODES.rivals, difficulty: DIFFICULTIES.easy, seed: 3 });
    g.world.clear();
    g.foods.length = 0;
    g.setSnake(Array.from({ length: 8 }, (_, i) => ({ x: i, y: 0 })));
    g.dir = 3;
    const boss = g.enemies[0];
    clearRivals(g, [boss]);
    boss.boss = true;
    // Boss below the player, facing up at its body.
    putRival(boss, Array.from({ length: 20 }, (_, i) => ({ x: 4, y: 2 + i })), 0);
    boss.breathMs = 0;
    g.begin();
    g.update(1);
    expect(g.events.some((e) => e.type === 'playerBurned')).toBe(true);
    expect(g.snake.length).toBe(6);
  });

  it('gives a big bonus when defeated', () => {
    const g = new Game({ mode: MODES.rivals, difficulty: DIFFICULTIES.easy, seed: 3, playerSkin: 'dragonEmperor' });
    g.world.clear();
    g.foods.length = 0;
    g.setSnake(Array.from({ length: 4 }, (_, i) => ({ x: 0, y: i })));
    g.dir = 0;
    const boss = g.enemies[0];
    clearRivals(g, [boss]);
    boss.boss = true;
    putRival(boss, Array.from({ length: 25 }, (_, i) => ({ x: 2 - i, y: -1 })), 3);
    boss.markedMs = 5000; // crowned: can be eaten
    boss.breathMs = 1e9;
    g.begin();
    const before = g.score;
    // Step into it.
    while (g.stepCount === 0 && g.status === 'playing') g.update(1);
    expect(boss.alive).toBe(false);
    expect(g.events.some((e) => e.type === 'bossDefeated')).toBe(true);
    expect(g.score).toBeGreaterThanOrEqual(before + 500);
  });
});

describe('ally breath', () => {
  it('the ally breathes the same ability as the player at rivals in reach', () => {
    const g = new Game({ mode: MODES.rivals, difficulty: DIFFICULTIES.easy, seed: 3, playerSkin: 'dragon' });
    g.world.clear();
    g.foods.length = 0;
    g.setSnake(Array.from({ length: 4 }, (_, i) => ({ x: 10, y: i })));
    const [r] = g.enemies;
    const ally = g.ally!;
    clearRivals(g, [r, ally]);
    putRival(ally, Array.from({ length: 6 }, (_, i) => ({ x: 0, y: i })), 0);
    putRival(r, Array.from({ length: 10 }, (_, i) => ({ x: 3 - i, y: -2 })), 3);
    ally.breathMs = 0;
    g.begin();
    g.update(1);
    const breath = g.events.find((e) => e.type === 'breath' && e.source === 'ally');
    expect(breath).toBeTruthy();
    expect(r.snake.length).toBeLessThan(10);
    expect(r.burnMs).toBeGreaterThan(0);
    expect(ally.breathMs).toBe(ALLY_BREATH_MS);
  });

  it('waits when no rival is in reach', () => {
    const g = new Game({ mode: MODES.rivals, difficulty: DIFFICULTIES.easy, seed: 3 });
    const ally = g.ally!;
    clearRivals(g, [ally]);
    ally.breathMs = 0;
    g.begin();
    g.update(1);
    expect(g.events.some((e) => e.type === 'breath' && e.source === 'ally')).toBe(false);
  });
});
