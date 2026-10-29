// Vector painters for food / power-up icons and obstacles. Every painter draws
// into a unit box (0..1) – callers scale the context to the target size.
import { FOODS, type FoodShape, type FoodType } from '../config/food';
import type { ObstacleStyle, ZonePalette } from '../config/zones';

type Ctx = CanvasRenderingContext2D;

const OUTLINE = 'rgba(20,10,40,0.85)';

function starPath(ctx: Ctx, cx: number, cy: number, spikes: number, outer: number, inner: number, rot = -Math.PI / 2): void {
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rot + (i * Math.PI) / spikes;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function strokeFill(ctx: Ctx, fill: string, lw = 0.06): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = lw;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
}

function shine(ctx: Ctx, x: number, y: number, rx: number, ry: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();
}

const painters: Record<FoodShape, (ctx: Ctx, color: string, accent: string) => void> = {
  apple(ctx, color, accent) {
    // stem + leaf
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0.5, 0.3);
    ctx.quadraticCurveTo(0.52, 0.16, 0.6, 0.1);
    ctx.lineWidth = 0.07;
    ctx.strokeStyle = '#6d3b12';
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0.66, 0.17, 0.13, 0.06, -0.5, 0, Math.PI * 2);
    strokeFill(ctx, accent, 0.04);
    // body: two lobes
    ctx.beginPath();
    ctx.moveTo(0.5, 0.3);
    ctx.bezierCurveTo(0.3, 0.16, 0.08, 0.3, 0.12, 0.56);
    ctx.bezierCurveTo(0.16, 0.8, 0.36, 0.94, 0.5, 0.86);
    ctx.bezierCurveTo(0.64, 0.94, 0.84, 0.8, 0.88, 0.56);
    ctx.bezierCurveTo(0.92, 0.3, 0.7, 0.16, 0.5, 0.3);
    ctx.closePath();
    strokeFill(ctx, color);
    shine(ctx, 0.32, 0.44, 0.08, 0.13);
  },
  star(ctx, color, accent) {
    starPath(ctx, 0.5, 0.54, 5, 0.44, 0.2);
    ctx.lineJoin = 'round';
    strokeFill(ctx, color);
    starPath(ctx, 0.5, 0.54, 5, 0.24, 0.11);
    ctx.fillStyle = accent;
    ctx.fill();
  },
  bolt(ctx, color) {
    ctx.beginPath();
    ctx.moveTo(0.6, 0.06);
    ctx.lineTo(0.2, 0.56);
    ctx.lineTo(0.46, 0.56);
    ctx.lineTo(0.36, 0.94);
    ctx.lineTo(0.8, 0.42);
    ctx.lineTo(0.54, 0.42);
    ctx.closePath();
    ctx.lineJoin = 'round';
    strokeFill(ctx, color);
    shine(ctx, 0.48, 0.26, 0.04, 0.09);
  },
  hourglass(ctx, color, accent) {
    ctx.lineJoin = 'round';
    // frame caps
    ctx.beginPath();
    ctx.roundRect(0.16, 0.08, 0.68, 0.12, 0.05);
    strokeFill(ctx, color);
    ctx.beginPath();
    ctx.roundRect(0.16, 0.8, 0.68, 0.12, 0.05);
    strokeFill(ctx, color);
    // glass
    ctx.beginPath();
    ctx.moveTo(0.24, 0.2);
    ctx.lineTo(0.76, 0.2);
    ctx.lineTo(0.54, 0.5);
    ctx.lineTo(0.76, 0.8);
    ctx.lineTo(0.24, 0.8);
    ctx.lineTo(0.46, 0.5);
    ctx.closePath();
    strokeFill(ctx, accent, 0.05);
    // sand
    ctx.beginPath();
    ctx.moveTo(0.32, 0.8);
    ctx.lineTo(0.5, 0.6);
    ctx.lineTo(0.68, 0.8);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0.36, 0.28);
    ctx.lineTo(0.64, 0.28);
    ctx.lineTo(0.5, 0.44);
    ctx.closePath();
    ctx.fill();
  },
  ghost(ctx, color, accent) {
    ctx.beginPath();
    ctx.moveTo(0.16, 0.9);
    ctx.lineTo(0.16, 0.46);
    ctx.arc(0.5, 0.46, 0.34, Math.PI, 0);
    ctx.lineTo(0.84, 0.9);
    ctx.lineTo(0.73, 0.8);
    ctx.lineTo(0.61, 0.9);
    ctx.lineTo(0.5, 0.8);
    ctx.lineTo(0.39, 0.9);
    ctx.lineTo(0.27, 0.8);
    ctx.closePath();
    ctx.lineJoin = 'round';
    strokeFill(ctx, color);
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.ellipse(0.38, 0.46, 0.07, 0.1, 0, 0, Math.PI * 2);
    ctx.ellipse(0.62, 0.46, 0.07, 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  hexMinus(ctx, color, accent) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i * Math.PI) / 3;
      const x = 0.5 + Math.cos(a) * 0.42;
      const y = 0.52 + Math.sin(a) * 0.42;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.lineJoin = 'round';
    strokeFill(ctx, color);
    ctx.beginPath();
    ctx.roundRect(0.27, 0.45, 0.46, 0.14, 0.06);
    ctx.fillStyle = accent;
    ctx.fill();
  },
  magnet(ctx, color, accent) {
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.arc(0.5, 0.5, 0.26, Math.PI, 0, true);
    ctx.lineWidth = 0.22;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0.24, 0.5);
    ctx.lineTo(0.24, 0.18);
    ctx.moveTo(0.76, 0.5);
    ctx.lineTo(0.76, 0.18);
    ctx.stroke();
    ctx.lineWidth = 0.16;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.arc(0.5, 0.5, 0.26, Math.PI, 0, true);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0.24, 0.5);
    ctx.lineTo(0.24, 0.3);
    ctx.moveTo(0.76, 0.5);
    ctx.lineTo(0.76, 0.3);
    ctx.stroke();
    ctx.strokeStyle = accent;
    ctx.beginPath();
    ctx.moveTo(0.24, 0.3);
    ctx.lineTo(0.24, 0.16);
    ctx.moveTo(0.76, 0.3);
    ctx.lineTo(0.76, 0.16);
    ctx.stroke();
  },
  skull(ctx, color, accent) {
    starPath(ctx, 0.5, 0.52, 9, 0.46, 0.34, 0);
    ctx.lineJoin = 'round';
    strokeFill(ctx, color);
    // X eyes
    ctx.strokeStyle = accent;
    ctx.lineWidth = 0.07;
    ctx.lineCap = 'round';
    for (const ex of [0.38, 0.62]) {
      ctx.beginPath();
      ctx.moveTo(ex - 0.06, 0.42);
      ctx.lineTo(ex + 0.06, 0.54);
      ctx.moveTo(ex + 0.06, 0.42);
      ctx.lineTo(ex - 0.06, 0.54);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(0.38, 0.68);
    ctx.quadraticCurveTo(0.5, 0.6, 0.62, 0.68);
    ctx.stroke();
  },
};

export function paintFood(ctx: Ctx, type: FoodType): void {
  const cfg = FOODS[type];
  painters[cfg.shape](ctx, cfg.color, cfg.accent);
}

function hash(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export function obstacleVariant(x: number, y: number): number {
  return hash(x, y) % 2;
}

/** `px` is the sprite size in device pixels (shadow blur is not affected by transforms). */
export function paintObstacle(ctx: Ctx, style: ObstacleStyle, p: ZonePalette, variant: number, px: number): void {
  ctx.lineJoin = 'round';
  switch (style) {
    case 'rock': {
      ctx.beginPath();
      if (variant === 0) {
        ctx.moveTo(0.1, 0.8);
        ctx.quadraticCurveTo(0.06, 0.4, 0.34, 0.2);
        ctx.quadraticCurveTo(0.6, 0.06, 0.82, 0.3);
        ctx.quadraticCurveTo(0.98, 0.6, 0.88, 0.86);
        ctx.closePath();
      } else {
        ctx.ellipse(0.5, 0.58, 0.42, 0.34, 0, 0, Math.PI * 2);
      }
      ctx.fillStyle = p.obstacle;
      ctx.fill();
      ctx.lineWidth = 0.06;
      ctx.strokeStyle = p.obstacleDark;
      ctx.stroke();
      shine(ctx, 0.4, 0.38, 0.14, 0.07);
      ctx.beginPath();
      ctx.moveTo(0.3, 0.84);
      ctx.lineTo(0.7, 0.84);
      ctx.strokeStyle = 'rgba(0,0,0,0.15)';
      ctx.stroke();
      break;
    }
    case 'cactus': {
      ctx.fillStyle = p.obstacle;
      ctx.strokeStyle = p.obstacleDark;
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      ctx.roundRect(0.38, 0.06, 0.24, 0.9, 0.12);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      if (variant === 0) {
        ctx.roundRect(0.12, 0.3, 0.16, 0.36, 0.08);
        ctx.roundRect(0.12, 0.52, 0.3, 0.14, 0.07);
      } else {
        ctx.roundRect(0.72, 0.22, 0.16, 0.36, 0.08);
        ctx.roundRect(0.58, 0.44, 0.3, 0.14, 0.07);
      }
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = p.obstacleLight;
      ctx.lineWidth = 0.03;
      ctx.beginPath();
      ctx.moveTo(0.5, 0.14);
      ctx.lineTo(0.5, 0.88);
      ctx.stroke();
      ctx.fillStyle = '#ff6fb5';
      ctx.beginPath();
      ctx.arc(0.5, 0.08, 0.06, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'coral': {
      ctx.strokeStyle = p.obstacle;
      ctx.lineCap = 'round';
      ctx.lineWidth = 0.14;
      ctx.beginPath();
      ctx.moveTo(0.5, 0.94);
      ctx.lineTo(0.5, 0.5);
      ctx.lineTo(variant ? 0.24 : 0.28, 0.2);
      ctx.moveTo(0.5, 0.6);
      ctx.lineTo(0.78, 0.3);
      ctx.moveTo(0.5, 0.5);
      ctx.lineTo(0.56, 0.12);
      ctx.stroke();
      ctx.lineWidth = 0.06;
      ctx.strokeStyle = p.obstacleLight;
      ctx.stroke();
      ctx.fillStyle = p.obstacleDark;
      for (const [x, y] of [[0.26, 0.2], [0.78, 0.3], [0.56, 0.12]]) {
        ctx.beginPath();
        ctx.arc(x, y, 0.08, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'ice': {
      ctx.beginPath();
      ctx.roundRect(0.06, 0.06, 0.88, 0.88, 0.16);
      const g = ctx.createLinearGradient(0, 0, 1, 1);
      g.addColorStop(0, p.obstacleLight);
      g.addColorStop(1, p.obstacle);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.lineWidth = 0.05;
      ctx.strokeStyle = p.obstacleDark;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 0.06;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0.22, 0.4);
      ctx.lineTo(0.4, 0.22);
      ctx.moveTo(0.22, 0.6);
      ctx.lineTo(variant ? 0.6 : 0.5, 0.22);
      ctx.stroke();
      break;
    }
    case 'lava': {
      ctx.beginPath();
      ctx.moveTo(0.08, 0.7);
      ctx.lineTo(0.2, 0.2);
      ctx.lineTo(0.6, 0.08);
      ctx.lineTo(0.92, 0.36);
      ctx.lineTo(0.86, 0.86);
      ctx.lineTo(0.36, 0.94);
      ctx.closePath();
      ctx.fillStyle = p.obstacle;
      ctx.fill();
      ctx.lineWidth = 0.05;
      ctx.strokeStyle = p.obstacleDark;
      ctx.stroke();
      ctx.strokeStyle = '#ff7b00';
      ctx.lineWidth = 0.06;
      ctx.lineCap = 'round';
      ctx.shadowColor = '#ff5a1f';
      ctx.shadowBlur = 0.15 * px;
      ctx.beginPath();
      ctx.moveTo(0.3, 0.3);
      ctx.lineTo(0.48, 0.5);
      ctx.lineTo(variant ? 0.4 : 0.7, 0.72);
      ctx.moveTo(0.48, 0.5);
      ctx.lineTo(0.74, 0.4);
      ctx.stroke();
      ctx.shadowBlur = 0;
      break;
    }
    case 'neon': {
      ctx.beginPath();
      ctx.roundRect(0.1, 0.1, 0.8, 0.8, 0.14);
      ctx.fillStyle = p.obstacle;
      ctx.fill();
      ctx.lineWidth = 0.08;
      ctx.strokeStyle = variant ? p.obstacleLight : p.obstacleDark;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 0.2 * px;
      ctx.stroke();
      ctx.shadowBlur = 0;
      break;
    }
    case 'asteroid': {
      if (variant === 0) {
        ctx.beginPath();
        ctx.moveTo(0.14, 0.5);
        ctx.lineTo(0.26, 0.18);
        ctx.lineTo(0.58, 0.1);
        ctx.lineTo(0.86, 0.32);
        ctx.lineTo(0.88, 0.66);
        ctx.lineTo(0.6, 0.9);
        ctx.lineTo(0.26, 0.82);
        ctx.closePath();
        ctx.fillStyle = p.obstacle;
        ctx.fill();
        ctx.lineWidth = 0.05;
        ctx.strokeStyle = p.obstacleDark;
        ctx.stroke();
        ctx.fillStyle = p.obstacleDark;
        for (const [x, y, r] of [[0.4, 0.4, 0.09], [0.64, 0.6, 0.07], [0.36, 0.66, 0.05]]) {
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // small ringed planet
        ctx.beginPath();
        ctx.arc(0.5, 0.5, 0.3, 0, Math.PI * 2);
        const g = ctx.createLinearGradient(0.2, 0.2, 0.8, 0.8);
        g.addColorStop(0, '#ffb86b');
        g.addColorStop(1, '#c2410c');
        ctx.fillStyle = g;
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(0.5, 0.52, 0.46, 0.12, -0.4, 0, Math.PI * 2);
        ctx.lineWidth = 0.06;
        ctx.strokeStyle = '#fde68a';
        ctx.stroke();
      }
      break;
    }
  }
}
