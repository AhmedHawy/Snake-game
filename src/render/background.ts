// Pre-rendered board backgrounds: checkerboard in the zone's colors plus a
// zone-specific pattern. Rendered once per zone/size and cached.
import type { ZoneConfig } from '../config/zones';
import { Rng } from '../core/rng';
import { makeCanvas } from './sprites';

export function boardRadius(cell: number): number {
  return Math.min(18, cell * 0.6);
}

export function renderBoardBackground(zone: ZoneConfig, cols: number, rows: number, cellPx: number): HTMLCanvasElement {
  const w = cols * cellPx;
  const h = rows * cellPx;
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d')!;
  const p = zone.palette;
  const rng = new Rng(zone.id.length * 7919 + cols * 31 + rows);

  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, boardRadius(cellPx));
  ctx.clip();

  ctx.fillStyle = p.boardA;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = p.boardB;
  for (let y = 0; y < rows; y++) {
    for (let x = (y % 2); x < cols; x += 2) ctx.fillRect(x * cellPx, y * cellPx, cellPx, cellPx);
  }

  const c = cellPx;
  ctx.save();
  switch (zone.pattern) {
    case 'grass': {
      ctx.strokeStyle = p.pattern;
      ctx.lineWidth = Math.max(1, c * 0.05);
      ctx.lineCap = 'round';
      for (let i = 0; i < cols * rows * 0.35; i++) {
        const x = rng.next() * w;
        const y = rng.next() * h;
        ctx.beginPath();
        for (let k = -1; k <= 1; k++) {
          ctx.moveTo(x + k * c * 0.08, y);
          ctx.quadraticCurveTo(x + k * c * 0.12, y - c * 0.12, x + k * c * 0.18, y - c * 0.22);
        }
        ctx.stroke();
      }
      for (let i = 0; i < cols * rows * 0.06; i++) {
        ctx.fillStyle = rng.pick(['#ffffff', '#fff176', '#ff8a80']);
        ctx.beginPath();
        ctx.arc(rng.next() * w, rng.next() * h, c * 0.07, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'dunes': {
      ctx.strokeStyle = p.pattern;
      ctx.lineWidth = Math.max(1, c * 0.07);
      ctx.globalAlpha = 0.7;
      for (let y = c * 1.2; y < h; y += c * 2.4) {
        ctx.beginPath();
        const off = rng.next() * Math.PI * 2;
        for (let x = 0; x <= w; x += c * 0.5) {
          const yy = y + Math.sin(x / (c * 2.2) + off) * c * 0.35;
          if (x === 0) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
      break;
    }
    case 'waves': {
      ctx.strokeStyle = p.pattern;
      ctx.lineWidth = Math.max(1, c * 0.06);
      ctx.globalAlpha = 0.45;
      for (let i = 0; i < cols * rows * 0.08; i++) {
        const x = rng.next() * w;
        const y = rng.next() * h;
        ctx.beginPath();
        ctx.ellipse(x, y, c * rng.range(0.4, 0.9), c * rng.range(0.2, 0.4), rng.next() * Math.PI, 0, Math.PI * 2);
        ctx.stroke();
      }
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(120,220,255,0.18)');
      g.addColorStop(1, 'rgba(0,10,40,0.25)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case 'frost': {
      ctx.strokeStyle = p.pattern;
      ctx.lineWidth = Math.max(1, c * 0.05);
      ctx.lineCap = 'round';
      for (let i = 0; i < cols * rows * 0.12; i++) {
        const x = rng.next() * w;
        const y = rng.next() * h;
        const r = c * rng.range(0.12, 0.25);
        ctx.beginPath();
        for (let k = 0; k < 3; k++) {
          const a = (k * Math.PI) / 3;
          ctx.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r);
          ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        ctx.stroke();
      }
      break;
    }
    case 'cracks': {
      ctx.strokeStyle = p.pattern;
      ctx.lineWidth = Math.max(1, c * 0.06);
      ctx.lineCap = 'round';
      ctx.shadowColor = '#ff3d00';
      ctx.shadowBlur = c * 0.5;
      ctx.globalAlpha = 0.55;
      for (let i = 0; i < (cols * rows) / 30; i++) {
        let x = rng.next() * w;
        let y = rng.next() * h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let k = 0; k < 5; k++) {
          x += rng.range(-1, 1) * c;
          y += rng.range(-1, 1) * c;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      break;
    }
    case 'grid': {
      ctx.strokeStyle = p.pattern;
      ctx.lineWidth = Math.max(1, c * 0.03);
      ctx.shadowColor = p.pattern;
      ctx.shadowBlur = c * 0.3;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      for (let x = 0; x <= cols; x++) {
        ctx.moveTo(x * c, 0);
        ctx.lineTo(x * c, h);
      }
      for (let y = 0; y <= rows; y++) {
        ctx.moveTo(0, y * c);
        ctx.lineTo(w, y * c);
      }
      ctx.stroke();
      ctx.strokeStyle = p.border;
      ctx.shadowColor = p.border;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      for (let y = 4; y < rows; y += 5) {
        ctx.moveTo(0, y * c);
        ctx.lineTo(w, y * c);
      }
      ctx.stroke();
      break;
    }
    case 'starfield': {
      for (const [col, r] of [['rgba(120,60,200,0.35)', 0.5], ['rgba(40,90,220,0.3)', 0.4]] as const) {
        const x = rng.next() * w;
        const y = rng.next() * h;
        const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(w, h) * r);
        g.addColorStop(0, col);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      ctx.fillStyle = '#fff';
      for (let i = 0; i < cols * rows * 0.5; i++) {
        ctx.globalAlpha = rng.range(0.2, 0.8);
        const s = rng.range(0.03, 0.08) * c;
        ctx.fillRect(rng.next() * w, rng.next() * h, s, s);
      }
      break;
    }
  }
  ctx.restore();

  // Soft vignette for depth.
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
  return canvas;
}
