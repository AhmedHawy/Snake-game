import { describe, expect, it } from 'vitest';
import { chooseGridDims, computeLayout, fitBoard, isTablet } from '../src/core/grid';

const noSafe = { top: 0, right: 0, bottom: 0, left: 0 };

describe('grid layout', () => {
  it('uses 17 cells on the short side for phones', () => {
    const l = computeLayout({ width: 400, height: 860, safe: noSafe, hudHeight: 56, dpad: null, dpr: 2.6 });
    const d = chooseGridDims(l.area, isTablet(400, 860));
    expect(d.cols).toBe(17);
    expect(d.rows).toBeGreaterThan(25);
  });

  it('uses 21 cells on the short side for tablets', () => {
    expect(isTablet(800, 1280)).toBe(true);
    const l = computeLayout({ width: 1280, height: 800, safe: noSafe, hudHeight: 56, dpad: null, dpr: 2 });
    const d = chooseGridDims(l.area, isTablet(1280, 800));
    expect(d.rows).toBe(21);
    expect(d.cols).toBeGreaterThan(21);
  });

  it('fits the board without stretching and inside the area', () => {
    const area = { x: 10, y: 70, w: 380, h: 700 };
    const b = fitBoard(area, 17, 30, 3);
    expect(b.w).toBeCloseTo(b.cell * 17);
    expect(b.h).toBeCloseTo(b.cell * 30);
    expect(b.w).toBeLessThanOrEqual(area.w);
    expect(b.h).toBeLessThanOrEqual(area.h);
    expect(Number.isInteger(Math.round(b.cell * 3 * 1000) / 1000)).toBe(true);
  });

  it('reserves D-pad space below the board in portrait and beside it in landscape', () => {
    const p = computeLayout({ width: 400, height: 860, safe: noSafe, hudHeight: 56, dpad: { side: 'right', size: 160 }, dpr: 2 });
    expect(p.dpadBeside).toBe(false);
    expect(p.dpadRect!.y).toBeGreaterThanOrEqual(p.area.y + p.area.h);
    const l = computeLayout({ width: 1280, height: 800, safe: noSafe, hudHeight: 56, dpad: { side: 'left', size: 180 }, dpr: 2 });
    expect(l.dpadBeside).toBe(true);
    expect(l.area.x).toBeGreaterThanOrEqual(l.dpadRect!.x + l.dpadRect!.w);
  });

  it('respects safe-area insets', () => {
    const l = computeLayout({ width: 400, height: 860, safe: { top: 40, right: 0, bottom: 24, left: 0 }, hudHeight: 56, dpad: null, dpr: 2 });
    expect(l.area.y).toBeGreaterThanOrEqual(96);
    expect(l.area.y + l.area.h).toBeLessThanOrEqual(860 - 24);
  });
});
