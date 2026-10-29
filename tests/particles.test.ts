import { describe, expect, it } from 'vitest';
import { Particles } from '../src/fx/particles';
import { DIFFICULTIES } from '../src/config/difficulty';
import { MODES } from '../src/config/modes';
import { Game } from '../src/core/state';

describe('particle pool', () => {
  it('never exceeds capacity and recycles dead particles', () => {
    const p = new Particles(100);
    p.burst(0, 0, 0, '#fff', 250, 5, 0.2, 300);
    expect(p.count).toBe(100);
    p.update(200);
    expect(p.count).toBeGreaterThan(0);
    p.update(400);
    expect(p.count).toBe(0);
  });

  it('handles a long stress run without growing', () => {
    const p = new Particles(3000);
    for (let f = 0; f < 600; f++) {
      p.burst(10, 1, 10, '#f0f', 40, 6, 0.2, 900, { gravity: 9, bounce: true });
      p.update(16.7);
      expect(p.count).toBeLessThanOrEqual(3000);
    }
    // Bouncing particles never sink below the ground.
    for (let i = 0; i < p.count; i++) expect(p.y[i]).toBeGreaterThanOrEqual(0);
  });
});

describe('long simulation', () => {
  it('runs thousands of steps on every difficulty without throwing', () => {
    for (const d of Object.values(DIFFICULTIES)) {
      for (const m of Object.values(MODES)) {
        const g = new Game({ mode: m, difficulty: d, seed: 11 });
        g.effects.ghost = 1e12;
        g.begin();
        for (let i = 0; i < 20000 && g.status === 'playing'; i++) {
          if (i % 97 === 0) g.steer(((g.dir + 1) % 4) as 0 | 1 | 2 | 3);
          g.update(8.33);
        }
        expect(['playing', 'dying', 'over']).toContain(g.status);
        expect(g.score).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
