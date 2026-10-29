// Ambient particles per zone (leaves, sand, bubbles, snow, embers, neon
// streaks, twinkling stars). Positions are in cell units so they survive
// resizes; each zone keeps a small fixed pool, so the cost is constant.
import type { AmbientKind, ZoneConfig } from '../config/zones';
import { Rng } from '../core/rng';

const REFERENCE_AREA = 17 * 30;

export class Ambient {
  readonly kind: AmbientKind;
  private readonly n: number;
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly size: Float32Array;
  private readonly phase: Float32Array;
  private readonly color: Uint8Array;
  private readonly colors: string[];
  private readonly rng = new Rng();
  private t = 0;

  constructor(zone: ZoneConfig, private readonly cols: number, private readonly rows: number) {
    this.kind = zone.ambient;
    this.colors = zone.palette.ambient;
    this.n = Math.max(6, Math.round((zone.ambientCount * cols * rows) / REFERENCE_AREA));
    this.x = new Float32Array(this.n);
    this.y = new Float32Array(this.n);
    this.vx = new Float32Array(this.n);
    this.vy = new Float32Array(this.n);
    this.size = new Float32Array(this.n);
    this.phase = new Float32Array(this.n);
    this.color = new Uint8Array(this.n);
    for (let i = 0; i < this.n; i++) this.spawn(i, true);
  }

  private spawn(i: number, anywhere: boolean): void {
    const r = this.rng;
    const { cols, rows } = this;
    this.phase[i] = r.next() * Math.PI * 2;
    this.color[i] = r.int(this.colors.length);
    this.x[i] = r.next() * cols;
    this.y[i] = r.next() * rows;
    switch (this.kind) {
      case 'leaves':
        this.vx[i] = r.range(0.3, 0.9);
        this.vy[i] = r.range(0.4, 0.9);
        this.size[i] = r.range(0.22, 0.38);
        if (!anywhere) r.chance(0.5) ? (this.y[i] = -1) : (this.x[i] = -1);
        break;
      case 'sand':
        this.vx[i] = -r.range(2.5, 5);
        this.vy[i] = r.range(-0.3, 0.3);
        this.size[i] = r.range(0.05, 0.12);
        if (!anywhere) this.x[i] = cols + 1;
        break;
      case 'bubbles':
        this.vx[i] = 0;
        this.vy[i] = -r.range(0.6, 1.6);
        this.size[i] = r.range(0.08, 0.25);
        if (!anywhere) this.y[i] = rows + 1;
        break;
      case 'snow':
        this.vx[i] = r.range(-0.2, 0.2);
        this.vy[i] = r.range(0.6, 1.5);
        this.size[i] = r.range(0.05, 0.14);
        if (!anywhere) this.y[i] = -1;
        break;
      case 'embers':
        this.vx[i] = r.range(-0.3, 0.3);
        this.vy[i] = -r.range(0.8, 2);
        this.size[i] = r.range(0.04, 0.1);
        if (!anywhere) this.y[i] = rows + 1;
        break;
      case 'neon':
        // Light streaks running along grid lines.
        this.y[i] = r.int(rows + 1);
        this.vx[i] = r.chance(0.5) ? r.range(4, 9) : -r.range(4, 9);
        this.vy[i] = 0;
        this.size[i] = r.range(1.5, 3.5);
        if (r.chance(0.5)) {
          // vertical streak
          this.x[i] = r.int(cols + 1);
          this.vy[i] = this.vx[i];
          this.vx[i] = 0;
          this.y[i] = this.vy[i] > 0 ? -4 : rows + 4;
        } else if (!anywhere) this.x[i] = this.vx[i] > 0 ? -4 : cols + 4;
        break;
      case 'stars':
        this.vx[i] = 0;
        this.vy[i] = 0;
        this.size[i] = r.range(0.05, 0.16);
        break;
    }
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    this.t += dt;
    const { cols, rows, n } = this;
    for (let i = 0; i < n; i++) {
      let sway = 0;
      if (this.kind === 'leaves' || this.kind === 'snow' || this.kind === 'bubbles') sway = Math.sin(this.t * 1.6 + this.phase[i]) * 0.6;
      this.x[i] += (this.vx[i] + sway) * dt;
      this.y[i] += this.vy[i] * dt;
      const x = this.x[i];
      const y = this.y[i];
      if (x < -5 || y < -5 || x > cols + 5 || y > rows + 5) this.spawn(i, false);
    }
    // Occasional shooting star in space.
    if (this.kind === 'stars' && this.rng.chance(dt * 0.25)) {
      const i = this.rng.int(n);
      this.x[i] = this.rng.next() * cols;
      this.y[i] = -1;
      this.vx[i] = -6;
      this.vy[i] = 6;
    }
  }

  draw(ctx: CanvasRenderingContext2D, bx: number, by: number, c: number, alpha: number): void {
    if (alpha <= 0) return;
    const { n } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    switch (this.kind) {
      case 'leaves':
        for (let i = 0; i < n; i++) {
          const px = bx + this.x[i] * c;
          const py = by + this.y[i] * c;
          const s = this.size[i] * c;
          const rot = this.t * 1.5 + this.phase[i];
          ctx.fillStyle = this.colors[this.color[i]];
          ctx.beginPath();
          ctx.ellipse(px, py, s, s * 0.45, rot, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'sand':
        ctx.globalAlpha = alpha * 0.6;
        for (let i = 0; i < n; i++) {
          ctx.fillStyle = this.colors[this.color[i]];
          ctx.fillRect(bx + this.x[i] * c, by + this.y[i] * c, this.size[i] * c * 4, this.size[i] * c);
        }
        break;
      case 'bubbles':
        ctx.lineWidth = Math.max(1, c * 0.04);
        for (let i = 0; i < n; i++) {
          const px = bx + this.x[i] * c;
          const py = by + this.y[i] * c;
          const s = this.size[i] * c;
          ctx.strokeStyle = this.colors[this.color[i]];
          ctx.beginPath();
          ctx.arc(px, py, s, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.6)';
          ctx.fillRect(px - s * 0.45, py - s * 0.45, s * 0.3, s * 0.3);
        }
        break;
      case 'snow':
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < n; i++) {
          ctx.beginPath();
          ctx.arc(bx + this.x[i] * c, by + this.y[i] * c, this.size[i] * c, 0, Math.PI * 2);
          ctx.fill();
        }
        // Snow on a white board needs a hint of contrast.
        ctx.strokeStyle = 'rgba(120,170,210,0.35)';
        ctx.lineWidth = 1;
        for (let i = 0; i < n; i += 2) {
          ctx.beginPath();
          ctx.arc(bx + this.x[i] * c, by + this.y[i] * c, this.size[i] * c, 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      case 'embers':
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < n; i++) {
          const px = bx + this.x[i] * c;
          const py = by + this.y[i] * c;
          const flicker = 0.6 + 0.4 * Math.sin(this.t * 12 + this.phase[i] * 5);
          const s = this.size[i] * c;
          ctx.fillStyle = this.colors[this.color[i]];
          ctx.globalAlpha = alpha * 0.25 * flicker;
          ctx.beginPath();
          ctx.arc(px, py, s * 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = alpha * flicker;
          ctx.beginPath();
          ctx.arc(px, py, s, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      case 'neon':
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        for (let i = 0; i < n; i++) {
          const px = bx + this.x[i] * c;
          const py = by + this.y[i] * c;
          const horizontal = this.vy[i] === 0;
          const len = this.size[i] * c * Math.sign(horizontal ? this.vx[i] : this.vy[i]);
          ctx.strokeStyle = this.colors[this.color[i]];
          for (const [w, a] of [[c * 0.28, 0.18], [c * 0.08, 0.9]]) {
            ctx.lineWidth = w;
            ctx.globalAlpha = alpha * a;
            ctx.beginPath();
            ctx.moveTo(px, py);
            if (horizontal) ctx.lineTo(px - len, py);
            else ctx.lineTo(px, py - len);
            ctx.stroke();
          }
        }
        break;
      case 'stars':
        for (let i = 0; i < n; i++) {
          const tw = 0.35 + 0.65 * Math.abs(Math.sin(this.t * 1.7 + this.phase[i]));
          const px = bx + this.x[i] * c;
          const py = by + this.y[i] * c;
          const s = this.size[i] * c;
          ctx.globalAlpha = alpha * tw;
          ctx.fillStyle = this.colors[this.color[i]];
          ctx.fillRect(px - s, py - s * 0.15, s * 2, s * 0.3);
          ctx.fillRect(px - s * 0.15, py - s, s * 0.3, s * 2);
          if (this.vx[i] !== 0) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = Math.max(1, c * 0.05);
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px - this.vx[i] * c * 0.25, py - this.vy[i] * c * 0.25);
            ctx.stroke();
          }
        }
        break;
    }
    ctx.restore();
  }
}
