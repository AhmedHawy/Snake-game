import { describe, expect, it } from 'vitest';
import { computeLayout, isTablet, visibleShortCells } from '../src/core/grid';

const noSafe = { top: 0, right: 0, bottom: 0, left: 0 };

describe('layout', () => {
  it('detects tablets by the short screen side', () => {
    expect(isTablet(400, 860)).toBe(false);
    expect(isTablet(800, 1280)).toBe(true);
  });

  it('maps the zoom setting to visible cells (bigger cells by default)', () => {
    expect(visibleShortCells('large', false)).toBe(11);
    expect(visibleShortCells('normal', false)).toBe(15);
    expect(visibleShortCells('small', false)).toBe(19);
    expect(visibleShortCells('large', true)).toBe(15);
  });

  it('reserves D-pad space below the play area in portrait and beside it in landscape', () => {
    const p = computeLayout({ width: 400, height: 860, safe: noSafe, hudHeight: 84, dpad: { side: 'right', size: 160 }, dpr: 2 });
    expect(p.dpadBeside).toBe(false);
    expect(p.dpadRect!.y).toBeGreaterThanOrEqual(p.area.y + p.area.h);
    const l = computeLayout({ width: 1280, height: 800, safe: noSafe, hudHeight: 92, dpad: { side: 'left', size: 180 }, dpr: 2 });
    expect(l.dpadBeside).toBe(true);
    expect(l.area.x).toBeGreaterThanOrEqual(l.dpadRect!.x + l.dpadRect!.w);
  });

  it('respects safe-area insets and the HUD', () => {
    const l = computeLayout({ width: 400, height: 860, safe: { top: 40, right: 0, bottom: 24, left: 0 }, hudHeight: 84, dpad: null, dpr: 2 });
    expect(l.area.y).toBeGreaterThanOrEqual(124);
    expect(l.area.y + l.area.h).toBeLessThanOrEqual(860 - 24);
  });
});
