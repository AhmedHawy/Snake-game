// 3D snake: shiny instanced spheres along the interpolated body (with extra
// in-between spheres for a smooth tube), a head with eyes that look where the
// snake goes, a tongue flick, blob shadows, and dragon horns + back spines.
import {
  CanvasTexture,
  Color,
  ConeGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  BoxGeometry,
  type Material,
} from 'three';
import type { SkinConfig } from '../config/skins';
import type { Game } from '../core/state';
import { DIRS } from '../core/types';

const colorCache = new Map<string, Color>();
export function cssColor(css: string): Color {
  let c = colorCache.get(css);
  if (!c) {
    c = new Color(css);
    colorCache.set(css, c);
  }
  return c;
}

let shadowTex: CanvasTexture | null = null;
export function blobShadowTexture(): CanvasTexture {
  if (shadowTex) return shadowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.6, 'rgba(0,0,0,0.25)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  shadowTex = new CanvasTexture(c);
  return shadowTex;
}

export interface SnakeDrawOptions {
  alpha: number;
  timeMs: number;
  skin: SkinConfig;
  headScale: number;
  bulges: number[];
  ghost: boolean;
  /** Glow color when a power-up is active. */
  glow: string | null;
  visible: boolean;
}

const BODY_RADIUS = 0.4;
const m4 = new Matrix4();

export class Snake3D {
  readonly group = new Group();
  /** Interpolated segment centers (world x, z). */
  xs = new Float32Array(256);
  zs = new Float32Array(256);
  count = 0;
  /** Smoothed facing direction of the head (world x, z). */
  faceX = 0;
  faceZ = -1;

  private body: InstancedMesh;
  private shadows: InstancedMesh;
  private spines: InstancedMesh;
  private readonly bodyMat = new MeshStandardMaterial({ roughness: 0.32, metalness: 0.08 });
  private readonly headMat = new MeshStandardMaterial({ roughness: 0.3, metalness: 0.08 });
  private readonly eyeMat = new MeshStandardMaterial({ roughness: 0.2 });
  private readonly pupilMat = new MeshStandardMaterial({ roughness: 0.2, color: '#111' });
  private readonly hornMat = new MeshStandardMaterial({ roughness: 0.5 });
  private readonly spineMat = new MeshStandardMaterial({ roughness: 0.4 });
  private readonly shadowMat = new MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false });
  private readonly head = new Group();
  private readonly headBall: Mesh;
  private readonly tongue = new Group();
  private readonly horns = new Group();
  private readonly blinkers: Mesh[] = [];
  private readonly sphere = new SphereGeometry(0.5, 12, 9);

  constructor() {
    this.body = this.makeBody(512);
    this.shadows = this.makeShadows(256);
    this.spines = this.makeSpines(256);

    this.headBall = new Mesh(this.sphere, this.headMat);
    this.headBall.scale.set(1, 0.86, 1.12);
    this.head.add(this.headBall);
    for (const s of [-1, 1]) {
      const eye = new Mesh(new SphereGeometry(0.15, 12, 10), this.eyeMat);
      eye.position.set(s * 0.22, 0.2, 0.3);
      const pupil = new Mesh(new SphereGeometry(0.085, 10, 8), this.pupilMat);
      pupil.position.set(s * 0.23, 0.22, 0.42);
      const shine = new Mesh(new SphereGeometry(0.03, 6, 4), new MeshBasicMaterial({ color: '#ffffff' }));
      shine.position.set(s * 0.2, 0.27, 0.48);
      this.head.add(eye, pupil, shine);
      this.blinkers.push(eye, pupil, shine);
      const cheek = new Mesh(new SphereGeometry(0.07, 8, 6), new MeshBasicMaterial({ color: '#ff7aa8', transparent: true, opacity: 0.5 }));
      cheek.position.set(s * 0.33, 0.02, 0.32);
      cheek.scale.set(1, 0.5, 0.6);
      this.head.add(cheek);
    }
    const tongueMat = new MeshBasicMaterial({ color: '#ff2d55' });
    const stem = new Mesh(new BoxGeometry(0.05, 0.02, 0.3), tongueMat);
    stem.position.z = 0.15;
    const forkL = new Mesh(new BoxGeometry(0.035, 0.02, 0.12), tongueMat);
    forkL.position.set(-0.04, 0, 0.33);
    forkL.rotation.y = -0.5;
    const forkR = forkL.clone();
    forkR.position.x = 0.04;
    forkR.rotation.y = 0.5;
    this.tongue.add(stem, forkL, forkR);
    this.tongue.position.set(0, -0.08, 0.42);
    this.head.add(this.tongue);
    for (const s of [-1, 1]) {
      const horn = new Mesh(new ConeGeometry(0.1, 0.55, 8), this.hornMat);
      horn.position.set(s * 0.22, 0.5, -0.2);
      horn.rotation.set(-0.55, 0, -s * 0.35);
      // Fin-like frills on the sides of the head.
      const frill = new Mesh(new ConeGeometry(0.2, 0.5, 3), this.spineMat);
      frill.scale.set(1, 1, 0.3);
      frill.position.set(s * 0.5, 0.18, -0.22);
      frill.rotation.set(0, 0, -s * 1.25);
      const nostril = new Mesh(new SphereGeometry(0.04, 6, 4), this.pupilMat);
      nostril.position.set(s * 0.1, 0.12, 0.56);
      this.horns.add(horn, frill, nostril);
    }
    this.head.add(this.horns);
    this.group.add(this.head);
  }

  private makeBody(cap: number): InstancedMesh {
    const m = new InstancedMesh(this.sphere, this.bodyMat, cap);
    m.instanceMatrix.setUsage(DynamicDrawUsage);
    m.setColorAt(0, new Color('#fff'));
    m.frustumCulled = false;
    m.count = 0;
    this.group.add(m);
    return m;
  }

  private makeShadows(cap: number): InstancedMesh {
    const g = new PlaneGeometry(1, 1);
    g.rotateX(-Math.PI / 2);
    const m = new InstancedMesh(g, this.shadowMat, cap);
    m.instanceMatrix.setUsage(DynamicDrawUsage);
    m.frustumCulled = false;
    m.count = 0;
    m.renderOrder = -1;
    this.group.add(m);
    return m;
  }

  private makeSpines(cap: number): InstancedMesh {
    const m = new InstancedMesh(new ConeGeometry(0.5, 1, 6), this.spineMat, cap);
    m.instanceMatrix.setUsage(DynamicDrawUsage);
    m.frustumCulled = false;
    m.count = 0;
    this.group.add(m);
    return m;
  }

  private ensure(n: number): void {
    if (this.xs.length < n) {
      const size = Math.max(n, this.xs.length * 2);
      this.xs = new Float32Array(size);
      this.zs = new Float32Array(size);
    }
    if (this.body.instanceMatrix.count < n * 3) {
      this.group.remove(this.body);
      this.body.dispose();
      this.body = this.makeBody(Math.max(n * 3, this.body.instanceMatrix.count * 2));
    }
    if (this.shadows.instanceMatrix.count < n) {
      this.group.remove(this.shadows);
      this.shadows.dispose();
      this.shadows = this.makeShadows(n * 2);
      this.group.remove(this.spines);
      this.spines.dispose();
      this.spines = this.makeSpines(n * 2);
    }
  }

  /** Interpolated segment centers in world space. */
  computePoints(game: Game, alpha: number): number {
    const n = game.snake.length;
    this.ensure(n);
    for (let i = 0; i < n; i++) {
      const cur = game.snake[i];
      const prev = game.prevSnake[i] ?? cur;
      let dx = cur.x - prev.x;
      let dy = cur.y - prev.y;
      if (Math.abs(dx) + Math.abs(dy) > 1) {
        dx = 0;
        dy = 0;
      }
      this.xs[i] = cur.x - dx * (1 - alpha);
      this.zs[i] = cur.y - dy * (1 - alpha);
    }
    this.count = n;
    return n;
  }

  update(game: Game, o: SnakeDrawOptions): void {
    this.group.visible = o.visible;
    const n = this.computePoints(game, o.alpha);
    if (!o.visible || n === 0) return;
    const { skin } = o;

    // Materials: ghost transparency, power-up / skin glow.
    const opacity = o.ghost ? 0.45 + 0.12 * Math.sin(o.timeMs / 120) : 1;
    for (const mat of [this.bodyMat, this.headMat, this.hornMat, this.spineMat] as MeshStandardMaterial[]) {
      setOpacity(mat, opacity);
      if (o.glow) {
        mat.emissive.set(o.glow);
        mat.emissiveIntensity = 0.35 + 0.2 * Math.sin(o.timeMs / 90);
      } else if (skin.emissive) {
        mat.emissive.set('#ffffff');
        mat.emissiveIntensity = skin.emissive * 0.5;
      } else {
        mat.emissiveIntensity = 0;
      }
    }
    setOpacity(this.eyeMat, opacity);
    setOpacity(this.pupilMat, opacity);
    this.headMat.color.set(skin.head);
    this.eyeMat.color.set(skin.eyeWhite);
    this.pupilMat.color.set(skin.pupil);

    // Body radii (taper + bulges).
    const radius = (i: number) => {
      const t = n > 1 ? i / (n - 1) : 0;
      let r = BODY_RADIUS * (1 - 0.4 * Math.pow(t, 1.4));
      for (const b of o.bulges) {
        const d = Math.abs(i - b);
        if (d < 1.4) r *= 1 + 0.4 * (1 - d / 1.4);
      }
      return r;
    };

    let k = 0;
    let s = 0;
    let sp = 0;
    const dragon = skin.dragon;
    if (dragon) this.spineMat.color.set(dragon.spine);
    for (let i = n - 1; i >= 1; i--) {
      const r0 = radius(i);
      const r1 = radius(i - 1);
      const x0 = this.xs[i];
      const z0 = this.zs[i];
      const x1 = this.xs[i - 1];
      const z1 = this.zs[i - 1];
      const color = cssColor(skin.body(i, n, o.timeMs));
      const near = Math.abs(x1 - x0) + Math.abs(z1 - z0) < 1.6;
      const steps = near ? 3 : 1;
      for (let j = 0; j < steps; j++) {
        const t = j / 3;
        const r = r0 + (r1 - r0) * t;
        m4.makeScale(r * 2, r * 2, r * 2);
        m4.setPosition(x0 + (x1 - x0) * t, r, z0 + (z1 - z0) * t);
        this.body.setMatrixAt(k, m4);
        this.body.setColorAt(k, color);
        k++;
      }
      m4.makeScale(r0 * 2.6, 1, r0 * 2.6);
      m4.setPosition(x0, 0.012, z0);
      this.shadows.setMatrixAt(s++, m4);
      if (dragon && i % 2 === 0) {
        m4.makeScale(r0 * 0.6, r0 * 1.1, r0 * 0.6);
        m4.setPosition(x0, r0 * 2.2, z0);
        this.spines.setMatrixAt(sp++, m4);
      }
    }
    // Shadow under the head.
    const hr = BODY_RADIUS * 1.3 * o.headScale;
    m4.makeScale(hr * 2.8, 1, hr * 2.8);
    m4.setPosition(this.xs[0], 0.012, this.zs[0]);
    this.shadows.setMatrixAt(s++, m4);

    this.body.count = k;
    this.shadows.count = s;
    this.spines.count = sp;
    this.body.instanceMatrix.needsUpdate = true;
    if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
    this.shadows.instanceMatrix.needsUpdate = true;
    this.spines.instanceMatrix.needsUpdate = true;
    this.spines.visible = !!dragon;

    // Head: position, smooth facing, scale pop.
    let fx = 0;
    let fz = 0;
    if (n > 1) {
      fx = this.xs[0] - this.xs[1];
      fz = this.zs[0] - this.zs[1];
    }
    const len = Math.hypot(fx, fz);
    if (len < 0.2 || len > 1.6) {
      const d = DIRS[game.dir];
      fx = d.x;
      fz = d.y;
    } else {
      fx /= len;
      fz /= len;
    }
    this.faceX = fx;
    this.faceZ = fz;
    this.head.position.set(this.xs[0], hr * 0.95, this.zs[0]);
    this.head.rotation.y = Math.atan2(fx, fz);
    this.head.scale.setScalar(hr * 2);

    // Tongue flick + blink.
    const phase = o.timeMs % 2200;
    const flick = phase < 280 && game.status !== 'dying' ? Math.sin((phase / 280) * Math.PI) : 0;
    this.tongue.visible = flick > 0.02;
    this.tongue.scale.set(1, 1, 0.4 + flick);
    const blink = o.timeMs % 3700 < 120;
    for (const b of this.blinkers) b.scale.y = blink ? 0.15 : 1;

    this.horns.visible = !!dragon;
    if (dragon) this.hornMat.color.set(dragon.horn);
  }
}

function setOpacity(mat: Material, opacity: number): void {
  const transparent = opacity < 0.999;
  if (mat.transparent !== transparent) {
    mat.transparent = transparent;
    mat.needsUpdate = true;
  }
  mat.opacity = opacity;
}
