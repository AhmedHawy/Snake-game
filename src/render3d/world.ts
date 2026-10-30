// World layers: instanced obstacles per zone style, moving obstacles, small
// ground decorations generated per chunk, the endless textured ground and
// ambient particles (leaves, sand, bubbles, snow, embers, sparkles, stars).
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  NormalBlending,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  RepeatWrapping,
  RingGeometry,
  SRGBColorSpace,
  CanvasTexture,
  Vector3,
  type Material,
} from 'three';
import type { ZoneConfig } from '../config/zones';
import { Rng } from '../core/rng';
import { CHUNK } from '../core/spawn';
import type { Mover } from '../core/state';
import type { Vec } from '../core/types';
import { parseColor } from '../fx/particles';
import { renderGroundTile } from './groundTile';
import { glowTexture } from './items';
import { buildDecorModel, buildObstacleModels } from './models';

const m4 = new Matrix4();
const q = new Quaternion();
const yAxis = new Vector3(0, 1, 0);
const pos = new Vector3();
const scl = new Vector3();

export function hashCell(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function setOpacity(mat: Material, opacity: number): void {
  const transparent = opacity < 0.999;
  if (mat.transparent !== transparent) {
    mat.transparent = transparent;
    mat.needsUpdate = true;
  }
  mat.opacity = opacity;
}

// ------------------------------------------------------------- obstacles

/** Obstacles farther than this (cells, per axis) from the camera are not drawn (fog hides them). */
const CULL_RADIUS = 30;

export class ObstacleLayer {
  readonly group = new Group();
  private readonly bodies: InstancedMesh[] = [];
  private readonly glows: (InstancedMesh | null)[] = [];
  private readonly bodyMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.65, metalness: 0.05 });
  private readonly glowMat = new MeshBasicMaterial({ vertexColors: true });
  private cells: { x: number; y: number; seed: number }[] = [];
  private cx = 0;
  private cz = 0;
  private centerKey = NaN;
  private scale = 1;

  constructor(readonly zone: ZoneConfig, capacity = 1500, private readonly cullRadius = CULL_RADIUS) {
    if (zone.obstacleStyle === 'ice') this.bodyMat.roughness = 0.15;
    if (zone.obstacleStyle === 'neon') this.bodyMat.roughness = 0.3;
    for (const v of buildObstacleModels(zone.obstacleStyle, zone.palette)) {
      const b = new InstancedMesh(v.body, this.bodyMat, capacity);
      b.count = 0;
      b.frustumCulled = false;
      this.bodies.push(b);
      this.group.add(b);
      if (v.glow) {
        const g = new InstancedMesh(v.glow, this.glowMat, capacity);
        g.count = 0;
        g.frustumCulled = false;
        this.glows.push(g);
        this.group.add(g);
      } else this.glows.push(null);
    }
  }

  setCells(cells: { x: number; y: number; seed?: number }[]): void {
    this.cells = cells.map((c) => ({ x: c.x, y: c.y, seed: c.seed ?? hashCell(c.x, c.y) }));
    this.layout(this.scale);
  }

  /** Only obstacles near the camera are drawn; re-culls when the camera moves to another chunk. */
  setCenter(x: number, z: number): void {
    const key = Math.floor(x / 8) * 100_003 + Math.floor(z / 8);
    if (key === this.centerKey) return;
    this.centerKey = key;
    this.cx = x;
    this.cz = z;
    this.layout(this.scale);
  }

  /** Re-lays out instances with a scale factor (zone transition pop-in / out). */
  layout(scale: number): void {
    this.scale = scale;
    const r = this.cullRadius;
    const counts = this.bodies.map(() => 0);
    const variants = this.bodies.length;
    for (const c of this.cells) {
      if (Math.abs(c.x - this.cx) > r || Math.abs(c.y - this.cz) > r) continue;
      const v = c.seed % variants;
      const k = counts[v]++;
      if (k >= this.bodies[v].instanceMatrix.count) continue;
      q.setFromAxisAngle(yAxis, ((c.seed >>> 4) % 4) * (Math.PI / 2) + (((c.seed >>> 8) % 100) / 100 - 0.5) * 0.5);
      const s = (0.92 + ((c.seed >>> 12) % 100) / 100 * 0.16) * scale;
      m4.compose(pos.set(c.x, 0, c.y), q, scl.set(s, s, s));
      this.bodies[v].setMatrixAt(k, m4);
      this.glows[v]?.setMatrixAt(k, m4);
    }
    this.bodies.forEach((b, i) => {
      b.count = Math.min(counts[i], b.instanceMatrix.count);
      b.instanceMatrix.needsUpdate = true;
      const g = this.glows[i];
      if (g) {
        g.count = b.count;
        g.instanceMatrix.needsUpdate = true;
      }
    });
  }

  setOpacity(a: number): void {
    setOpacity(this.bodyMat, a);
    setOpacity(this.glowMat, a);
    this.group.visible = a > 0.01;
  }

  dispose(): void {
    for (const b of this.bodies) b.dispose();
    for (const g of this.glows) g?.dispose();
    this.bodyMat.dispose();
    this.glowMat.dispose();
  }
}

// ---------------------------------------------------------------- movers

export class Movers3D {
  readonly group = new Group();
  private layer: ObstacleLayer | null = null;
  private readonly rings: Mesh[] = [];
  private readonly ringMat = new MeshBasicMaterial({ color: '#ff3c50', transparent: true, depthWrite: false });
  private readonly ringGeo = new RingGeometry(0.46, 0.56, 32).rotateX(-Math.PI / 2);

  update(zone: ZoneConfig, movers: Mover[], alpha: number, timeMs: number): void {
    if (!this.layer || this.layer.zone !== zone) {
      if (this.layer) {
        this.group.remove(this.layer.group);
        this.layer.dispose();
      }
      this.layer = new ObstacleLayer(zone, 16, Infinity);
      this.group.add(this.layer.group);
    }
    const cells = movers.map((m) => ({ x: m.prev.x + (m.pos.x - m.prev.x) * alpha, y: m.prev.y + (m.pos.y - m.prev.y) * alpha, seed: m.id * 2 }));
    this.layer.setCells(cells);
    while (this.rings.length < movers.length) {
      const r = new Mesh(this.ringGeo, this.ringMat);
      this.rings.push(r);
      this.group.add(r);
    }
    this.ringMat.opacity = 0.5 + 0.4 * Math.sin(timeMs / 140);
    this.rings.forEach((r, i) => {
      const c = cells[i];
      r.visible = !!c;
      if (c) r.position.set(c.x, 0.03, c.y);
    });
  }
}

// ----------------------------------------------------------------- decor

/** Decor farther than this from the camera target (cells) is not placed. */
const DECOR_REACH_X = 26;
const DECOR_REACH_Z = 30;

export class DecorLayer {
  readonly group = new Group();
  private readonly meshes: InstancedMesh[] = [];
  private readonly mats: Material[] = [];
  private centerKey = NaN;

  constructor(readonly zone: ZoneConfig, private readonly zoneIndex: number) {
    const cap = 25 * zone.decorPerChunk;
    for (const kind of zone.decor) {
      const model = buildDecorModel(kind);
      const mat = model.glow ? new MeshBasicMaterial({ vertexColors: true }) : new MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
      const m = new InstancedMesh(model.geometry, mat, cap);
      m.count = 0;
      m.frustumCulled = false;
      this.meshes.push(m);
      this.mats.push(mat);
      this.group.add(m);
    }
  }

  /** Places decorations for the chunks around (x, z); only recomputed when the center chunk changes. */
  update(x: number, z: number, blocked: (x: number, y: number) => boolean): void {
    const cx = Math.floor(x / CHUNK);
    const cz = Math.floor(z / CHUNK);
    const key = cx * 100_003 + cz;
    if (key === this.centerKey) return;
    this.centerKey = key;
    const counts = this.meshes.map(() => 0);
    // The tilted camera sees about ±1.5 chunks; ±2 keeps edges filled.
    for (let gz = cz - 2; gz <= cz + 2; gz++) {
      for (let gx = cx - 2; gx <= cx + 2; gx++) {
        const rng = new Rng(hashCell(gx * 31 + this.zoneIndex, gz * 17 - this.zoneIndex));
        for (let i = 0; i < this.zone.decorPerChunk; i++) {
          const kindIdx = rng.int(this.meshes.length);
          const px = gx * CHUNK + rng.int(CHUNK) + 0.5;
          const pz = gz * CHUNK + rng.int(CHUNK) + 0.5;
          const rot = rng.next() * Math.PI * 2;
          const s = 1.1 + rng.next() * 0.9;
          // Only what the tilted camera can actually see (the set is rebuilt every chunk).
          if (Math.abs(px - x) > DECOR_REACH_X || Math.abs(pz - z) > DECOR_REACH_Z) continue;
          if (blocked(Math.floor(px), Math.floor(pz)) || blocked(Math.ceil(px), Math.ceil(pz))) continue;
          const mesh = this.meshes[kindIdx];
          const k = counts[kindIdx]++;
          if (k >= mesh.instanceMatrix.count) continue;
          q.setFromAxisAngle(yAxis, rot);
          m4.compose(pos.set(px, 0, pz), q, scl.set(s, s, s));
          mesh.setMatrixAt(k, m4);
        }
      }
    }
    this.meshes.forEach((m, i) => {
      m.count = Math.min(counts[i], m.instanceMatrix.count);
      m.instanceMatrix.needsUpdate = true;
    });
  }

  setOpacity(a: number): void {
    for (const m of this.mats) setOpacity(m, a);
    this.group.visible = a > 0.01;
  }

  dispose(): void {
    for (const m of this.meshes) m.dispose();
    for (const m of this.mats) m.dispose();
  }
}

// ---------------------------------------------------------------- ground

const TILE_CELLS = 16;
const GROUND_SIZE = 128;
const tileCache = new Map<string, CanvasTexture>();

function groundTexture(zone: ZoneConfig): CanvasTexture {
  let t = tileCache.get(zone.id);
  if (!t) {
    t = new CanvasTexture(renderGroundTile(zone, TILE_CELLS, 32));
    t.wrapS = t.wrapT = RepeatWrapping;
    t.repeat.set(GROUND_SIZE / TILE_CELLS, GROUND_SIZE / TILE_CELLS);
    t.colorSpace = SRGBColorSpace;
    t.anisotropy = 4;
    tileCache.set(zone.id, t);
  }
  return t;
}

export class Ground {
  readonly mesh: Mesh;
  private readonly mat = new MeshStandardMaterial({ roughness: 0.95, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });

  private readonly maxOpacity: number;

  constructor(zone: ZoneConfig, layer: number) {
    this.maxOpacity = zone.groundOpacity ?? 1;
    const g = new PlaneGeometry(GROUND_SIZE, GROUND_SIZE);
    g.rotateX(-Math.PI / 2);
    this.mat.map = groundTexture(zone);
    this.mesh = new Mesh(g, this.mat);
    this.mesh.renderOrder = -10 + layer;
    this.mesh.position.y = layer * 0.002;
  }

  /** Keeps the ground under the camera, snapped to whole tiles so the checkerboard never slides. */
  follow(x: number, z: number): void {
    // Cell centers sit on integer coordinates, so tiles start at half-cells.
    this.mesh.position.x = Math.round(x / TILE_CELLS) * TILE_CELLS - 0.5;
    this.mesh.position.z = Math.round(z / TILE_CELLS) * TILE_CELLS - 0.5;
  }

  setOpacity(a: number): void {
    a *= this.maxOpacity;
    setOpacity(this.mat, a);
    this.mat.depthWrite = a >= 0.999;
    this.mesh.visible = a > 0.01;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

// --------------------------------------------------------------- ambient

const BOX = 34;
const HEIGHT = 7;

export class Ambient3D {
  readonly points: Points;
  private readonly geo = new BufferGeometry();
  private readonly mat: PointsMaterial;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly base: Float32Array;
  private readonly vel: Float32Array;
  private readonly phase: Float32Array;
  private readonly n: number;
  private t = 0;
  private cx = 0;
  private cz = 0;
  private readonly rng = new Rng();

  constructor(readonly zone: ZoneConfig) {
    const kind = zone.ambient;
    this.n = Math.round(zone.ambientCount * 3.2);
    this.pos = new Float32Array(this.n * 3);
    this.col = new Float32Array(this.n * 3);
    this.base = new Float32Array(this.n * 3);
    this.vel = new Float32Array(this.n * 3);
    this.phase = new Float32Array(this.n);
    const glow = kind === 'embers' || kind === 'neon' || kind === 'stars';
    this.mat = new PointsMaterial({
      size: kind === 'leaves' ? 0.32 : kind === 'bubbles' ? 0.26 : kind === 'sand' ? 0.1 : kind === 'stars' ? 0.2 : 0.16,
      map: glowTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: glow ? AdditiveBlending : NormalBlending,
      sizeAttenuation: true,
    });
    for (let i = 0; i < this.n; i++) this.spawn(i, true);
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage));
    this.geo.setAttribute('color', new BufferAttribute(this.col, 3).setUsage(DynamicDrawUsage));
    this.points = new Points(this.geo, this.mat);
    this.points.frustumCulled = false;
  }

  private spawn(i: number, anywhere: boolean): void {
    const r = this.rng;
    const k = i * 3;
    const [cr, cg, cb] = parseColor(r.pick(this.zone.palette.ambient));
    this.base[k] = cr;
    this.base[k + 1] = cg;
    this.base[k + 2] = cb;
    this.phase[i] = r.next() * Math.PI * 2;
    // World positions inside a box around the camera target.
    this.pos[k] = this.cx + (r.next() - 0.5) * BOX;
    this.pos[k + 2] = this.cz + (r.next() - 0.5) * BOX;
    this.pos[k + 1] = r.next() * HEIGHT;
    let vx = 0;
    let vy = 0;
    let vz = 0;
    switch (this.zone.ambient) {
      case 'leaves':
        vx = r.range(0.2, 0.7);
        vy = -r.range(0.4, 0.9);
        if (!anywhere) this.pos[k + 1] = HEIGHT;
        break;
      case 'sand':
        vx = -r.range(3, 6);
        this.pos[k + 1] = r.next() * 1.5;
        break;
      case 'bubbles':
        vy = r.range(0.6, 1.4);
        if (!anywhere) this.pos[k + 1] = 0;
        break;
      case 'snow':
        vy = -r.range(0.6, 1.3);
        vx = r.range(-0.2, 0.2);
        if (!anywhere) this.pos[k + 1] = HEIGHT;
        break;
      case 'embers':
        vy = r.range(0.8, 2);
        vx = r.range(-0.3, 0.3);
        if (!anywhere) this.pos[k + 1] = 0;
        break;
      case 'neon':
        vx = r.range(-0.4, 0.4);
        vz = r.range(-0.4, 0.4);
        vy = r.range(-0.2, 0.2);
        break;
      case 'stars':
        this.pos[k + 1] = r.range(0.3, HEIGHT);
        break;
    }
    this.vel[k] = vx;
    this.vel[k + 1] = vy;
    this.vel[k + 2] = vz;
  }

  update(dtMs: number, camX: number, camZ: number, opacity: number): void {
    const dt = dtMs / 1000;
    this.t += dt;
    this.cx = camX;
    this.cz = camZ;
    const half = BOX / 2;
    const sway = this.zone.ambient === 'leaves' || this.zone.ambient === 'snow' || this.zone.ambient === 'bubbles';
    const twinkle = this.zone.ambient === 'stars' || this.zone.ambient === 'embers' || this.zone.ambient === 'neon';
    for (let i = 0; i < this.n; i++) {
      const k = i * 3;
      const s = sway ? Math.sin(this.t * 1.6 + this.phase[i]) * 0.5 : 0;
      this.pos[k] += (this.vel[k] + s) * dt;
      this.pos[k + 1] += this.vel[k + 1] * dt;
      this.pos[k + 2] += this.vel[k + 2] * dt;
      // Wrap around the box that travels with the camera so particles never run out.
      if (this.pos[k] - camX > half) this.pos[k] -= BOX;
      else if (this.pos[k] - camX < -half) this.pos[k] += BOX;
      if (this.pos[k + 2] - camZ > half) this.pos[k + 2] -= BOX;
      else if (this.pos[k + 2] - camZ < -half) this.pos[k + 2] += BOX;
      if (this.pos[k + 1] < 0 || this.pos[k + 1] > HEIGHT) this.spawn(i, false);
      const b = twinkle ? 0.4 + 0.6 * Math.abs(Math.sin(this.t * 2 + this.phase[i])) : 1;
      this.col[k] = this.base[k] * b;
      this.col[k + 1] = this.base[k + 1] * b;
      this.col[k + 2] = this.base[k + 2] * b;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.mat.opacity = opacity;
    this.points.visible = opacity > 0.01;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
  }
}

export type { Vec };
