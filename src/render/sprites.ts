// Pre-rendered sprites for food and obstacles, rebuilt whenever the cell size
// changes so drawing each frame is just drawImage.
import type { FoodType } from '../config/food';
import type { ZoneConfig } from '../config/zones';
import { paintFood, paintObstacle } from './shapes';

/** Sprites are rendered slightly larger than a cell so pulsing stays sharp. */
export const FOOD_SPRITE_SCALE = 1.15;

export class SpriteCache {
  private map = new Map<string, HTMLCanvasElement>();
  private px = 0;

  /** Cell size in device pixels. */
  setCellPx(px: number): void {
    const p = Math.max(8, Math.round(px));
    if (p === this.px) return;
    this.px = p;
    this.map.clear();
  }

  food(type: FoodType): HTMLCanvasElement {
    const key = `f:${type}`;
    let c = this.map.get(key);
    if (!c) {
      const size = Math.ceil(this.px * FOOD_SPRITE_SCALE);
      c = makeCanvas(size);
      const ctx = c.getContext('2d')!;
      // Soft drop shadow, then the icon.
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(size / 2, size * 0.9, size * 0.3, size * 0.07, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.scale(size, size);
      paintFood(ctx, type);
      this.map.set(key, c);
    }
    return c;
  }

  obstacle(zone: ZoneConfig, variant: number): HTMLCanvasElement {
    const key = `o:${zone.id}:${variant}`;
    let c = this.map.get(key);
    if (!c) {
      c = makeCanvas(this.px);
      const ctx = c.getContext('2d')!;
      ctx.scale(this.px, this.px);
      paintObstacle(ctx, zone.obstacleStyle, zone.palette, variant, this.px);
      this.map.set(key, c);
    }
    return c;
  }
}

export function makeCanvas(w: number, h = w): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}
