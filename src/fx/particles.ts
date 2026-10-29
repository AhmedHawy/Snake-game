// Pooled 3D particle system: fixed-capacity typed arrays, swap-remove on
// death, zero allocations per frame. Units are world cells; y is height.
// Rendering lives in render3d/particles.ts.

export interface EmitOptions {
  /** Downward acceleration (cells/s²). */
  gravity?: number;
  /** Velocity multiplier per second (0..1, lower = more drag). */
  drag?: number;
  /** Additive (glowing) blending. */
  glow?: boolean;
  /** Bounce off the ground instead of falling through. */
  bounce?: boolean;
}

const colorCache = new Map<string, [number, number, number]>();
let parser: CanvasRenderingContext2D | null = null;

/** Parses any CSS color into linear-ish 0..1 RGB (cached). */
export function parseColor(css: string): [number, number, number] {
  let c = colorCache.get(css);
  if (c) return c;
  if (css.startsWith('#') && css.length === 7) {
    const v = parseInt(css.slice(1), 16);
    c = [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
  } else {
    if (!parser && typeof document !== 'undefined') parser = document.createElement('canvas').getContext('2d');
    if (parser) {
      parser.fillStyle = '#000';
      parser.fillStyle = css;
      const hex = String(parser.fillStyle);
      const v = parseInt(hex.slice(1, 7), 16);
      c = [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
    } else c = [1, 1, 1];
  }
  colorCache.set(css, c);
  return c;
}

export class Particles {
  count = 0;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly vz: Float32Array;
  readonly life: Float32Array;
  readonly maxLife: Float32Array;
  readonly size: Float32Array;
  private readonly grav: Float32Array;
  private readonly drag: Float32Array;
  readonly r: Float32Array;
  readonly g: Float32Array;
  readonly b: Float32Array;
  readonly glow: Uint8Array;
  private readonly bounce: Uint8Array;
  private readonly floats: Float32Array[];

  constructor(readonly capacity = 3000) {
    const f = () => new Float32Array(capacity);
    this.x = f();
    this.y = f();
    this.z = f();
    this.vx = f();
    this.vy = f();
    this.vz = f();
    this.life = f();
    this.maxLife = f();
    this.size = f();
    this.grav = f();
    this.drag = f();
    this.r = f();
    this.g = f();
    this.b = f();
    this.glow = new Uint8Array(capacity);
    this.bounce = new Uint8Array(capacity);
    this.floats = [this.x, this.y, this.z, this.vx, this.vy, this.vz, this.life, this.maxLife, this.size, this.grav, this.drag, this.r, this.g, this.b];
  }

  clear(): void {
    this.count = 0;
  }

  /** Velocities in cells/s, life in ms, size in cells. A random particle is replaced when full. */
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, lifeMs: number, size: number, color: string, o: EmitOptions = {}): void {
    let i = this.count;
    if (i >= this.capacity) i = (Math.random() * this.capacity) | 0;
    else this.count++;
    const [r, g, b] = parseColor(color);
    this.x[i] = x;
    this.y[i] = y;
    this.z[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.life[i] = lifeMs;
    this.maxLife[i] = lifeMs;
    this.size[i] = size;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0.15;
    this.r[i] = r;
    this.g[i] = g;
    this.b[i] = b;
    this.glow[i] = o.glow ? 1 : 0;
    this.bounce[i] = o.bounce ? 1 : 0;
  }

  /** Spherical burst (upper hemisphere biased so it reads well from the tilted camera). */
  burst(x: number, y: number, z: number, color: string, n: number, speed: number, size: number, lifeMs: number, o: EmitOptions = {}): void {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 0.9 + 0.1;
      const s = speed * (0.35 + Math.random() * 0.65);
      const h = Math.sqrt(1 - up * up);
      this.emit(x, y, z, Math.cos(a) * h * s, up * s, Math.sin(a) * h * s, lifeMs * (0.6 + Math.random() * 0.4), size * (0.6 + Math.random() * 0.6), color, o);
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
      this.vz[i] *= d;
      this.vy[i] = this.vy[i] * d - this.grav[i] * dt;
      this.x[i] += this.vx[i] * dt;
      this.y[i] += this.vy[i] * dt;
      this.z[i] += this.vz[i] * dt;
      if (this.bounce[i] && this.y[i] < this.size[i] * 0.5) {
        this.y[i] = this.size[i] * 0.5;
        this.vy[i] = Math.abs(this.vy[i]) * 0.45;
        this.vx[i] *= 0.7;
        this.vz[i] *= 0.7;
      }
      i++;
    }
  }

  private kill(i: number): void {
    const last = --this.count;
    if (i === last) return;
    for (const arr of this.floats) arr[i] = arr[last];
    this.glow[i] = this.glow[last];
    this.bounce[i] = this.bounce[last];
  }
}
