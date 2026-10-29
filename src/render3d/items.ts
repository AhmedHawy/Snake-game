// Food / power-up meshes, moving obstacles, portals and countdown rings.
import {
  AdditiveBlending,
  CanvasTexture,
  CircleGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RingGeometry,
  TorusGeometry,
  type BufferGeometry,
} from 'three';
import { EFFECT_COLORS, FOODS, type FoodType, type TimedEffect } from '../config/food';
import { TIMED_EFFECTS, type FoodItem, type Game } from '../core/state';
import { buildFoodModel, type FoodModel } from './models';
import { blobShadowTexture } from './snake';

let glowTex: CanvasTexture | null = null;
export function glowTexture(): CanvasTexture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  glowTex = new CanvasTexture(c);
  return glowTex;
}

function flatRing(inner: number, outer: number, segments = 48): RingGeometry {
  const g = new RingGeometry(inner, outer, segments, 1, -Math.PI / 2, Math.PI * 2);
  g.rotateX(-Math.PI / 2);
  return g;
}

/** Shows a fraction (0..1) of a ring by limiting how many triangles are drawn. */
function setRingFraction(geo: BufferGeometry, frac: number): void {
  const total = geo.index ? geo.index.count : geo.getAttribute('position').count;
  const tris = Math.round((total / 3) * Math.max(0, Math.min(1, frac)));
  geo.setDrawRange(0, tris * 3);
}

function easeOutBack(t: number): number {
  const c1 = 1.70158;
  const u = Math.min(1, Math.max(0, t)) - 1;
  return 1 + (c1 + 1) * u * u * u + c1 * u * u;
}

interface FoodView {
  root: Group;
  model: Mesh;
  ring: Mesh | null;
}

const SPECIAL_GLOW: Partial<Record<FoodType, true>> = { golden: true, speed: true, magnet: true, ghost: true, slow: true, shrink: true };

export class Items3D {
  readonly group = new Group();
  private readonly models = new Map<FoodType, { model: FoodModel; mat: MeshStandardMaterial }>();
  private readonly foods = new Map<number, FoodView>();
  private readonly portalViews: Group[] = [];
  private readonly effectRings: Mesh[] = [];
  private readonly shadowGeo = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private readonly shadowMat = new MeshBasicMaterial({ map: blobShadowTexture(), transparent: true, depthWrite: false });

  constructor() {
    TIMED_EFFECTS.forEach((e, i) => {
      const m = new Mesh(flatRing(0.78 + i * 0.16, 0.86 + i * 0.16, 64), new MeshBasicMaterial({ color: EFFECT_COLORS[e as TimedEffect], transparent: true, opacity: 0.9, depthWrite: false }));
      m.visible = false;
      this.effectRings.push(m);
      this.group.add(m);
    });
  }

  private template(type: FoodType) {
    let t = this.models.get(type);
    if (!t) {
      const model = buildFoodModel(type);
      const mat = new MeshStandardMaterial({
        vertexColors: true,
        metalness: model.metalness,
        roughness: model.roughness,
        transparent: model.opacity < 1,
        opacity: model.opacity,
      });
      if (model.emissive > 0) {
        mat.emissive = new Color(FOODS[type].color);
        mat.emissiveIntensity = model.emissive;
      }
      t = { model, mat };
      this.models.set(type, t);
    }
    return t;
  }

  private createFood(f: FoodItem): FoodView {
    const t = this.template(f.type);
    const root = new Group();
    const model = new Mesh(t.model.geometry, t.mat);
    root.add(model);
    const shadow = new Mesh(this.shadowGeo, this.shadowMat);
    shadow.scale.setScalar(0.8);
    shadow.position.y = 0.011;
    root.add(shadow);
    if (SPECIAL_GLOW[f.type]) {
      const halo = new Mesh(
        new CircleGeometry(0.62, 24).rotateX(-Math.PI / 2),
        new MeshBasicMaterial({ map: glowTexture(), color: FOODS[f.type].color, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false }),
      );
      halo.position.y = 0.02;
      root.add(halo);
    }
    let ring: Mesh | null = null;
    if (Number.isFinite(f.expiresMs)) {
      ring = new Mesh(flatRing(0.52, 0.6), new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, depthWrite: false }));
      ring.position.y = 0.025;
      root.add(ring);
    }
    this.group.add(root);
    return { root, model, ring };
  }

  update(game: Game, alpha: number, timeMs: number, headX: number, headZ: number, showEffectRings: boolean): void {
    // Foods: create / update / remove.
    const alive = new Set<number>();
    for (const f of game.foods) {
      alive.add(f.id);
      let v = this.foods.get(f.id);
      if (!v) {
        v = this.createFood(f);
        this.foods.set(f.id, v);
      }
      const x = f.prev.x + (f.pos.x - f.prev.x) * alpha;
      const z = f.prev.y + (f.pos.y - f.prev.y) * alpha;
      const age = game.status === 'ready' ? 1e9 : game.timeMs - f.bornMs;
      const appear = age < 300 ? easeOutBack(age / 300) : 1;
      const bob = Math.sin(timeMs / 280 + f.id) * 0.06;
      v.root.position.set(x, 0, z);
      v.model.position.y = 0.42 + bob;
      v.model.rotation.y = timeMs / 700 + f.id;
      v.model.scale.setScalar(appear * (1 + 0.05 * Math.sin(timeMs / 200 + f.id)));
      let visible = true;
      if (v.ring) {
        const left = f.expiresMs - game.timeMs;
        const life = f.expiresMs - f.bornMs;
        setRingFraction(v.ring.geometry, left / life);
        if (left < 1500) visible = Math.sin(timeMs / 55) > -0.3;
      }
      v.model.visible = visible;
    }
    for (const [id, v] of this.foods) {
      if (!alive.has(id)) {
        this.group.remove(v.root);
        v.ring?.geometry.dispose();
        this.foods.delete(id);
      }
    }

    // Portals.
    while (this.portalViews.length < game.portals.length * 2) {
      const g = new Group();
      const ring = new Mesh(new TorusGeometry(0.42, 0.07, 10, 32).rotateX(Math.PI / 2), new MeshStandardMaterial({ color: '#fff', emissive: new Color('#fff'), emissiveIntensity: 0.6 }));
      ring.position.y = 0.08;
      const disc = new Mesh(new CircleGeometry(0.38, 32).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: '#05010f' }));
      disc.position.y = 0.02;
      const swirl = new Mesh(new RingGeometry(0.1, 0.36, 24, 1, 0, Math.PI * 1.2).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.8, blending: AdditiveBlending, depthWrite: false }));
      swirl.position.y = 0.03;
      g.add(ring, disc, swirl);
      this.portalViews.push(g);
      this.group.add(g);
    }
    this.portalViews.forEach((g, i) => {
      const p = game.portals[i >> 1];
      g.visible = !!p;
      if (!p) return;
      const end = i % 2 === 0 ? p.a : p.b;
      g.position.set(end.x, 0, end.y);
      const [ring, , swirl] = g.children as Mesh[];
      (ring.material as MeshStandardMaterial).color.set(p.color);
      (ring.material as MeshStandardMaterial).emissive.set(p.color);
      (swirl.material as MeshBasicMaterial).color.set(p.color);
      swirl.rotation.y = timeMs / 250;
      ring.position.y = 0.08 + Math.sin(timeMs / 300 + i) * 0.04;
    });

    // Power-up countdown rings around the head.
    TIMED_EFFECTS.forEach((e, i) => {
      const m = this.effectRings[i];
      const left = game.effects[e];
      m.visible = showEffectRings && left > 0;
      if (!m.visible) return;
      m.position.set(headX, 0.03, headZ);
      setRingFraction(m.geometry, left / game.effectTotals[e]);
    });
  }

  clear(): void {
    for (const v of this.foods.values()) {
      this.group.remove(v.root);
      v.ring?.geometry.dispose();
    }
    this.foods.clear();
  }
}
