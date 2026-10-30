// Rich zone scenery around the play area:
// - big pieces (trees, palms, kelp, snowmen, towers...) placed per chunk;
//   they are never obstacles: each one shrinks into the ground while the
//   snake, food, a hazard or a portal is next to it or would be hidden
//   behind it, then pops back up;
// - animated creatures (butterflies, fish, birds, tumbleweeds, drones, UFOs);
// - drifting cloud shadows, underwater light rays, and giant planets far
//   below the see-through space ground (real parallax depth).
import {
  AdditiveBlending,
  CanvasTexture,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Material,
} from 'three';
import type { ZoneConfig } from '../config/zones';
import { Rng } from '../core/rng';
import { CHUNK } from '../core/spawn';
import type { Game } from '../core/state';
import { blobShadowTexture } from './snake';
import { buildCreatureModel, buildTallModel, type CreatureModel } from './sceneryModels';

const m4 = new Matrix4();
const m4b = new Matrix4();
const wingRot = new Matrix4();
const q = new Quaternion();
const q2 = new Quaternion();
const pos = new Vector3();
const scl = new Vector3();
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);
const X = new Vector3(1, 0, 0);

function hash2(a: number, b: number): number {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

function setOpacity(mat: Material, opacity: number): void {
  const transparent = opacity < 0.999 || (mat.userData.alwaysTransparent as boolean);
  if (mat.transparent !== transparent) {
    mat.transparent = transparent;
    mat.needsUpdate = true;
  }
  mat.opacity = opacity * ((mat.userData.baseOpacity as number) ?? 1);
}

function track<T extends Material>(list: Material[], mat: T, baseOpacity = 1, alwaysTransparent = false): T {
  mat.userData.baseOpacity = baseOpacity;
  mat.userData.alwaysTransparent = alwaysTransparent;
  if (alwaysTransparent) {
    mat.transparent = true;
    mat.opacity = baseOpacity;
  }
  list.push(mat);
  return mat;
}

interface TallInstance {
  kind: number;
  x: number;
  z: number;
  rot: number;
  scale: number;
  seed: number;
  /** Current grow factor (0 = tucked away, 1 = full size). */
  f: number;
}

interface Creature {
  kind: number;
  x: number;
  z: number;
  ax: number;
  az: number;
  radius: number;
  angle: number;
  dir: number;
  height: number;
  phase: number;
  roll: number;
}

const TALL_RADIUS_CHUNKS = 2;
/** How far around the camera (cells) the cleared-space checks run. */
const CHECK_X = 10;
const CHECK_Z = 16;
const CREATURE_BOX = 18;

export class SceneryLayer {
  readonly group = new Group();
  private readonly mats: Material[] = [];
  private readonly tallBodies: InstancedMesh[] = [];
  private readonly tallGlows: (InstancedMesh | null)[] = [];
  private readonly tallSway: boolean[] = [];
  private readonly tallShadows: InstancedMesh;
  private tall: TallInstance[] = [];
  private tallKey = NaN;

  private readonly creatureModels: CreatureModel[] = [];
  private readonly creatureMeshes: { body: InstancedMesh; wingL?: InstancedMesh; wingR?: InstancedMesh; glow?: InstancedMesh }[] = [];
  private creatures: Creature[] = [];
  private readonly rng: Rng;

  private clouds: InstancedMesh | null = null;
  private cloudPos: { x: number; z: number; s: number }[] = [];
  private rays: Mesh[] = [];
  private planets: { mesh: Mesh; x: number; z: number }[] = [];
  private t = 0;

  constructor(readonly zone: ZoneConfig, private readonly zoneIndex: number) {
    this.rng = new Rng(hash2(zoneIndex + 7, 99));
    const sc = zone.scenery;

    // Big scenery.
    const cap = (TALL_RADIUS_CHUNKS * 2 + 1) ** 2 * (sc.tallPerChunk + 2);
    const bodyMat = track(this.mats, new MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
    const glowMat = track(this.mats, new MeshBasicMaterial({ vertexColors: true }));
    for (const kind of sc.tall) {
      const model = buildTallModel(kind);
      const b = new InstancedMesh(model.body, bodyMat, cap);
      b.instanceMatrix.setUsage(DynamicDrawUsage);
      b.count = 0;
      b.frustumCulled = false;
      this.tallBodies.push(b);
      this.group.add(b);
      if (model.glow) {
        const g = new InstancedMesh(model.glow, glowMat, cap);
        g.instanceMatrix.setUsage(DynamicDrawUsage);
        g.count = 0;
        g.frustumCulled = false;
        this.tallGlows.push(g);
        this.group.add(g);
      } else this.tallGlows.push(null);
      this.tallSway.push(!!model.sway);
    }
    const shadowGeo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const shadowMat = track(this.mats, new MeshBasicMaterial({ map: blobShadowTexture(), depthWrite: false }), 0.8, true);
    this.tallShadows = new InstancedMesh(shadowGeo, shadowMat, cap * sc.tall.length);
    this.tallShadows.instanceMatrix.setUsage(DynamicDrawUsage);
    this.tallShadows.count = 0;
    this.tallShadows.frustumCulled = false;
    this.group.add(this.tallShadows);

    // Creatures.
    const creatureBody = track(this.mats, new MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }));
    const creatureGlow = track(this.mats, new MeshBasicMaterial({ vertexColors: true }));
    const jellyMat = track(this.mats, new MeshStandardMaterial({ vertexColors: true, roughness: 0.3, emissive: '#ff6fb5', emissiveIntensity: 0.4 }), 0.75, true);
    const perKind = Math.max(1, Math.ceil(sc.creatureCount / Math.max(1, sc.creatures.length)));
    sc.creatures.forEach((kind, k) => {
      const model = buildCreatureModel(kind);
      this.creatureModels.push(model);
      const bodyM = kind === 'jellyfish' ? jellyMat : creatureBody;
      const make = (geo: typeof model.body, mat: Material) => {
        const m = new InstancedMesh(geo, mat, perKind);
        m.instanceMatrix.setUsage(DynamicDrawUsage);
        m.frustumCulled = false;
        m.count = 0;
        this.group.add(m);
        return m;
      };
      this.creatureMeshes.push({
        body: make(model.body, bodyM),
        wingL: model.wingL ? make(model.wingL, creatureBody) : undefined,
        wingR: model.wingR ? make(model.wingR, creatureBody) : undefined,
        glow: model.glow ? make(model.glow, creatureGlow) : undefined,
      });
      for (let i = 0; i < perKind; i++) this.creatures.push(this.newCreature(k, 0, 0, true));
    });

    // Cloud shadows.
    if (sc.cloudShadows) {
      const mat = track(this.mats, new MeshBasicMaterial({ map: blobShadowTexture(), depthWrite: false, color: '#203040' }), 0.45, true);
      this.clouds = new InstancedMesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, 7);
      this.clouds.instanceMatrix.setUsage(DynamicDrawUsage);
      this.clouds.frustumCulled = false;
      this.clouds.renderOrder = -5;
      this.group.add(this.clouds);
      for (let i = 0; i < 7; i++) this.cloudPos.push({ x: this.rng.range(-25, 25), z: this.rng.range(-25, 25), s: this.rng.range(7, 13) });
    }

    // Underwater light rays.
    if (sc.lightRays) {
      const tex = rayTexture();
      const mat = track(this.mats, new MeshBasicMaterial({ map: tex, blending: AdditiveBlending, depthWrite: false, color: '#9fe8ff', side: 2 }), 0.4, true);
      for (let i = 0; i < 8; i++) {
        const m = new Mesh(new PlaneGeometry(this.rng.range(1.2, 2.6), 9), mat);
        m.rotation.set(-0.35, this.rng.range(-0.4, 0.4), this.rng.range(-0.25, 0.25));
        m.userData.ox = this.rng.range(-14, 14);
        m.userData.oz = this.rng.range(-14, 10);
        m.userData.ph = this.rng.next() * 6;
        this.rays.push(m);
        this.group.add(m);
      }
    }

    // Giant planets below the space ground.
    if (sc.planets) {
      const colors = ['#e07a2f', '#5c6bc0', '#26a69a', '#ab47bc', '#ef5350', '#ffd54f', '#90a4ae'];
      for (let i = 0; i < 9; i++) {
        const r = this.rng.range(3, 11);
        const col = colors[i % colors.length];
        const mat = track(this.mats, new MeshStandardMaterial({ color: col, roughness: 0.8, emissive: col, emissiveIntensity: 0.25, fog: false }));
        const planet = new Mesh(new SphereGeometry(r, 28, 20), mat);
        if (i % 3 === 0) {
          const ringMat = track(this.mats, new MeshBasicMaterial({ color: '#fde68a', fog: false, side: 2 }), 0.8, true);
          const ring = new Mesh(new TorusGeometry(r * 1.6, r * 0.12, 4, 48), ringMat);
          ring.scale.set(1, 1, 0.08);
          ring.rotation.set(Math.PI / 2.3, 0, 0.4);
          planet.add(ring);
        }
        const p = { mesh: planet, x: this.rng.range(-60, 60), z: this.rng.range(-60, 60) };
        planet.position.y = -this.rng.range(18, 55);
        this.planets.push(p);
        this.group.add(planet);
      }
    }
  }

  private newCreature(kind: number, camX: number, camZ: number, anywhere: boolean): Creature {
    const r = this.rng;
    const model = this.creatureModels[kind];
    const ax = camX + r.range(-CREATURE_BOX, CREATURE_BOX) * (anywhere ? 1 : 0.8);
    const az = camZ + r.range(-CREATURE_BOX, CREATURE_BOX) * (anywhere ? 1 : 0.8);
    return {
      kind,
      x: ax,
      z: az,
      ax,
      az,
      radius: model.rolls ? 0 : r.range(1.5, model.speed > 2.5 ? 7 : 4),
      angle: r.next() * Math.PI * 2,
      dir: r.chance(0.5) ? 1 : -1,
      height: r.range(model.height[0], model.height[1]),
      phase: r.next() * Math.PI * 2,
      roll: 0,
    };
  }

  /** Recomputes big-scenery placement when the camera enters a new chunk. */
  private placeTall(camX: number, camZ: number, game: Game): void {
    const cx = Math.floor(camX / CHUNK);
    const cz = Math.floor(camZ / CHUNK);
    const key = cx * 100_003 + cz;
    if (key === this.tallKey) return;
    this.tallKey = key;
    const old = new Map(this.tall.map((t) => [`${t.x},${t.z}`, t.f]));
    this.tall = [];
    const kinds = this.zone.scenery.tall.length;
    if (kinds === 0) return;
    for (let gz = cz - TALL_RADIUS_CHUNKS; gz <= cz + TALL_RADIUS_CHUNKS; gz++) {
      for (let gx = cx - TALL_RADIUS_CHUNKS; gx <= cx + TALL_RADIUS_CHUNKS; gx++) {
        const rng = new Rng(hash2(gx * 13 + this.zoneIndex * 101, gz * 7 - this.zoneIndex));
        for (let i = 0; i < this.zone.scenery.tallPerChunk; i++) {
          const x = gx * CHUNK + rng.int(CHUNK);
          const z = gz * CHUNK + rng.int(CHUNK);
          const inst: TallInstance = {
            kind: rng.int(kinds),
            x: x + rng.range(-0.2, 0.2),
            z: z + rng.range(-0.2, 0.2),
            rot: rng.next() * Math.PI * 2,
            scale: rng.range(0.85, 1.25),
            seed: rng.next() * 100,
            f: 1,
          };
          if (game.isBlocked(x, z)) continue;
          if (Math.abs(x - camX) > 26 || Math.abs(z - camZ) > 30) continue;
          inst.f = old.get(`${inst.x},${inst.z}`) ?? 1;
          this.tall.push(inst);
        }
      }
    }
  }

  /**
   * True when something that matters is next to the piece or would be hidden
   * behind it (the camera looks toward -z, so "behind" means smaller z).
   */
  private mustClear(t: TallInstance, game: Game, headX: number, headZ: number): boolean {
    const hidden = (px: number, pz: number) => Math.abs(px - t.x) <= 1.5 && pz - t.z >= -3 && pz - t.z <= 1.5;
    if (hidden(headX, headZ)) return true;
    for (const f of game.foods) if (hidden(f.pos.x, f.pos.y)) return true;
    for (const m of game.movers) if (hidden(m.pos.x, m.pos.y)) return true;
    for (const p of game.portals) if (hidden(p.a.x, p.a.y) || hidden(p.b.x, p.b.y)) return true;
    const cx = Math.round(t.x);
    const cz = Math.round(t.z);
    for (let z = cz - 3; z <= cz + 1; z++) {
      for (let x = cx - 1; x <= cx + 1; x++) {
        if (game.onSnake(x, z) || (game.isBlocked(x, z) && z < cz)) return true;
      }
    }
    return false;
  }

  update(dtMs: number, camX: number, camZ: number, game: Game, headX: number, headZ: number): void {
    const dt = Math.min(0.05, dtMs / 1000);
    this.t += dt;

    // ---- big scenery (shrinks out of the way)
    this.placeTall(camX, camZ, game);
    const counts = this.tallBodies.map(() => 0);
    let shadows = 0;
    const ease = 1 - Math.exp(-dt * 9);
    for (const t of this.tall) {
      const near = Math.abs(t.x - camX) < CHECK_X && Math.abs(t.z - camZ) < CHECK_Z;
      const target = near && this.mustClear(t, game, headX, headZ) ? 0.08 : 1;
      t.f += (target - t.f) * ease;
      const f = t.f;
      if (f < 0.02) continue;
      const k = t.kind;
      const idx = counts[k]++;
      const sway = this.tallSway[k] ? Math.sin(this.t * 1.3 + t.seed) * 0.07 : 0;
      q.setFromAxisAngle(Y, t.rot);
      if (sway) q.multiply(q2.setFromAxisAngle(X, sway));
      const s = t.scale;
      m4.compose(pos.set(t.x, 0, t.z), q, scl.set(s * (0.4 + 0.6 * f), s * f, s * (0.4 + 0.6 * f)));
      this.tallBodies[k].setMatrixAt(idx, m4);
      this.tallGlows[k]?.setMatrixAt(idx, m4);
      if (shadows < this.tallShadows.instanceMatrix.count) {
        m4.compose(pos.set(t.x + 0.25, 0.015, t.z + 0.15), q.identity(), scl.set(1.6 * s * f, 1, 1.4 * s * f));
        this.tallShadows.setMatrixAt(shadows++, m4);
      }
    }
    this.tallBodies.forEach((b, i) => {
      b.count = counts[i];
      b.instanceMatrix.needsUpdate = true;
      const g = this.tallGlows[i];
      if (g) {
        g.count = counts[i];
        g.instanceMatrix.needsUpdate = true;
      }
    });
    this.tallShadows.count = shadows;
    this.tallShadows.instanceMatrix.needsUpdate = true;

    // ---- creatures
    const ccount = this.creatureMeshes.map(() => 0);
    for (let i = 0; i < this.creatures.length; i++) {
      let c = this.creatures[i];
      const model = this.creatureModels[c.kind];
      if (Math.abs(c.x - camX) > CREATURE_BOX + 4 || Math.abs(c.z - camZ) > CREATURE_BOX + 4) {
        c = this.creatures[i] = this.newCreature(c.kind, camX, camZ, false);
      }
      let heading: number;
      let y = c.height;
      if (model.rolls) {
        c.x += model.speed * dt;
        c.z += Math.sin(this.t * 0.7 + c.phase) * 0.4 * dt;
        c.roll -= (model.speed / 0.3) * dt;
        y = 0.3 + Math.abs(Math.sin(this.t * 3 + c.phase)) * 0.25;
        heading = Math.PI / 2;
      } else {
        c.angle += ((model.speed / Math.max(0.5, c.radius)) * dt) * c.dir;
        c.x = c.ax + Math.cos(c.angle) * c.radius;
        c.z = c.az + Math.sin(c.angle) * c.radius;
        // Tangent of the circle.
        heading = Math.atan2(-Math.sin(c.angle) * c.dir, Math.cos(c.angle) * c.dir);
        if (model.bob) y += Math.sin(this.t * 1.6 + c.phase) * 0.4;
        else y += Math.sin(this.t * 2.2 + c.phase) * 0.15;
      }
      const meshes = this.creatureMeshes[c.kind];
      const idx = ccount[c.kind]++;
      if (idx >= meshes.body.instanceMatrix.count) continue;
      q.setFromAxisAngle(Y, heading);
      if (model.rolls) q.multiply(q2.setFromAxisAngle(Z, c.roll));
      const pulse = model.bob ? 1 + Math.sin(this.t * 3.2 + c.phase) * 0.12 : 1;
      m4.compose(pos.set(c.x, y, c.z), q, scl.set(pulse, 1 / pulse, pulse));
      meshes.body.setMatrixAt(idx, m4);
      meshes.glow?.setMatrixAt(idx, m4);
      if (meshes.wingL && meshes.wingR) {
        const flap = Math.sin(this.t * model.flap * Math.PI * 2 + c.phase) * 0.7;
        meshes.wingL.setMatrixAt(idx, m4b.multiplyMatrices(m4, wingRot.makeRotationAxis(Z, flap)));
        meshes.wingR.setMatrixAt(idx, m4b.multiplyMatrices(m4, wingRot.makeRotationAxis(Z, -flap)));
      }
    }
    this.creatureMeshes.forEach((m, k) => {
      for (const im of [m.body, m.wingL, m.wingR, m.glow]) {
        if (!im) continue;
        im.count = ccount[k];
        im.instanceMatrix.needsUpdate = true;
      }
    });

    // ---- cloud shadows drift with the wind and wrap around the camera
    if (this.clouds) {
      this.cloudPos.forEach((c, i) => {
        c.x += 0.6 * dt;
        c.z -= 0.25 * dt;
        let dx = c.x - camX;
        let dz = c.z - camZ;
        if (dx > 28) c.x -= 56;
        if (dx < -28) c.x += 56;
        if (dz > 28) c.z -= 56;
        if (dz < -28) c.z += 56;
        dx = c.x;
        dz = c.z;
        m4.compose(pos.set(dx, 0.02, dz), q.identity(), scl.set(c.s, 1, c.s * 0.7));
        this.clouds!.setMatrixAt(i, m4);
      });
      this.clouds.instanceMatrix.needsUpdate = true;
    }

    // ---- light rays sway with the camera
    for (const r of this.rays) {
      r.position.set(camX + r.userData.ox + Math.sin(this.t * 0.3 + r.userData.ph) * 1.5, 3.5, camZ + r.userData.oz);
    }

    // ---- planets: anchored in the world, wrapped around the camera
    for (const p of this.planets) {
      if (p.x - camX > 70) p.x -= 140;
      if (p.x - camX < -70) p.x += 140;
      if (p.z - camZ > 70) p.z -= 140;
      if (p.z - camZ < -70) p.z += 140;
      p.mesh.position.x = p.x;
      p.mesh.position.z = p.z;
      p.mesh.rotation.y += dt * 0.05;
    }
  }

  setOpacity(a: number): void {
    for (const m of this.mats) setOpacity(m, a);
    this.group.visible = a > 0.01;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const mesh = o as Mesh;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    for (const m of this.mats) m.dispose();
  }
}

let rayTex: CanvasTexture | null = null;
function rayTexture(): CanvasTexture {
  if (rayTex) return rayTex;
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 128);
  const side = ctx.createLinearGradient(0, 0, 32, 0);
  side.addColorStop(0, 'rgba(0,0,0,1)');
  side.addColorStop(0.5, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = side;
  ctx.fillRect(0, 0, 32, 128);
  rayTex = new CanvasTexture(c);
  return rayTex;
}
