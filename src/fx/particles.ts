// Pooled particle system: fixed-capacity typed arrays, swap-remove on death,
// zero allocations per frame.

/** Particle shapes. Chunk = rotating rounded piece (snake body bits). */
export const PShape = { Square: 0, Circle: 1, Chunk: 2 } as const;
export type PShape = (typeof PShape)[keyof typeof PShape];

export interface EmitOptions {
  gravity?: number;
  /** Velocity multiplier per second (0..1, lower = more drag). */
  drag?: number;
  shape?: PShape;
  /** Draw with additive blending. */
  glow?: boolean;
}

export class Particles {
  count = 0;
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly size: Float32Array;
  private readonly grav: Float32Array;
  private readonly drag: Float32Array;
  private readonly rot: Float32Array;
  private readonly shape: Uint8Array;
  private readonly glow: Uint8Array;
  private readonly color: string[];

  constructor(readonly capacity = 3000) {
    this.x = new Float32Array(capacity);
    this.y = new Float32Array(capacity);
    this.vx = new Float32Array(capacity);
    this.vy = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.maxLife = new Float32Array(capacity);
    this.size = new Float32Array(capacity);
    this.grav = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.rot = new Float32Array(capacity);
    this.shape = new Uint8Array(capacity);
    this.glow = new Uint8Array(capacity);
    this.color = new Array<string>(capacity).fill('#fff');
  }

  clear(): void {
    this.count = 0;
  }

  /** Velocities in px/s, life in ms, size in px. Oldest particle is replaced when full. */
  emit(x: number, y: number, vx: number, vy: number, lifeMs: number, size: number, color: string, o: EmitOptions = {}): void {
    let i = this.count;
    if (i >= this.capacity) i = (Math.random() * this.capacity) | 0;
    else this.count++;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = lifeMs;
    this.maxLife[i] = lifeMs;
    this.size[i] = size;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0.15;
    this.rot[i] = Math.random() * Math.PI;
    this.shape[i] = o.shape ?? PShape.Square;
    this.glow[i] = o.glow ? 1 : 0;
    this.color[i] = color;
  }

  /** Radial burst. */
  burst(x: number, y: number, color: string, n: number, speed: number, size: number, lifeMs: number, o: EmitOptions = {}): void {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random() * 0.65);
      this.emit(x, y, Math.cos(a) * s, Math.sin(a) * s, lifeMs * (0.6 + Math.random() * 0.4), size * (0.6 + Math.random() * 0.6), color, o);
    }
  }

  update(dtMs: number): void {
    const dt = dtMs / 1000;
    for (let i = 0; i < this.count; ) {
      this.life[i] -= dtMs;
      if (this.life[i] <= 0) {
        this.kill(i);
        continue;
      }
      const d = Math.pow(this.drag[i], dt);
      this.vx[i] *= d;
      this.vy[i] = this.vy[i] * d + this.grav[i] * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.rot[i] += dt * 6;
      i++;
    }
  }

  private kill(i: number): void {
    const last = --this.count;
    if (i === last) return;
    this.x[i] = this.x[last];
    this.y[i] = this.y[last];
    this.vx[i] = this.vx[last];
    this.vy[i] = this.vy[last];
    this.life[i] = this.life[last];
    this.maxLife[i] = this.maxLife[last];
    this.size[i] = this.size[last];
    this.grav[i] = this.grav[last];
    this.drag[i] = this.drag[last];
    this.rot[i] = this.rot[last];
    this.shape[i] = this.shape[last];
    this.glow[i] = this.glow[last];
    this.color[i] = this.color[last];
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.count === 0) return;
    // Two passes keep composite-mode switches to a minimum; fillStyle is only
    // reassigned when it changes, and tiny particles are drawn as rects.
    for (let pass = 0; pass < 2; pass++) {
      ctx.globalCompositeOperation = pass === 0 ? 'source-over' : 'lighter';
      let lastColor = '';
      for (let i = 0; i < this.count; i++) {
        if (this.glow[i] !== pass) continue;
        const t = this.life[i] / this.maxLife[i];
        ctx.globalAlpha = t < 0.3 ? t / 0.3 : 1;
        const color = this.color[i];
        if (color !== lastColor) {
          ctx.fillStyle = color;
          lastColor = color;
        }
        const s = this.size[i];
        const x = this.x[i];
        const y = this.y[i];
        const shape = this.shape[i];
        if (shape === PShape.Square || s < 4) {
          ctx.fillRect(x - s / 2, y - s / 2, s, s);
        } else if (shape === PShape.Circle) {
          ctx.beginPath();
          ctx.arc(x, y, s / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // Rotated square without save/restore.
          const h = s * 0.5;
          const c = Math.cos(this.rot[i]) * h;
          const n = Math.sin(this.rot[i]) * h;
          ctx.beginPath();
          ctx.moveTo(x + c - n, y + n + c);
          ctx.lineTo(x - c - n, y - n + c);
          ctx.lineTo(x - c + n, y - n - c);
          ctx.lineTo(x + c + n, y + n - c);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}
