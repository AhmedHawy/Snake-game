// Low-poly 3D models built from primitives (no model files): food and
// power-ups, obstacles for every zone style and small ground decorations.
// Each model is merged into one vertex-colored geometry so it renders in a
// single draw call (or one instanced draw call for many copies).
import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Euler,
  ExtrudeGeometry,
  Float32BufferAttribute,
  IcosahedronGeometry,
  Matrix4,
  OctahedronGeometry,
  Quaternion,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { FoodType } from '../config/food';
import { FOODS } from '../config/food';
import type { DecorKind, ObstacleStyle, ZonePalette } from '../config/zones';

const tmpColor = new Color();
const mtx = new Matrix4();
const quat = new Quaternion();
const up = new Vector3(0, 1, 0);

interface PartOpts {
  pos?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number];
}

/** Bakes a transform + flat vertex color into a non-indexed geometry part. */
export function part(geo: BufferGeometry, color: string, o: PartOpts = {}): BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const [rx, ry, rz] = o.rot ?? [0, 0, 0];
  quat.setFromEuler(new Euler(rx, ry, rz));
  mtx.compose(new Vector3(...(o.pos ?? [0, 0, 0])), quat, new Vector3(...(o.scale ?? [1, 1, 1])));
  g.applyMatrix4(mtx);
  tmpColor.set(color);
  const n = g.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  g.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return g;
}

export function merge(parts: BufferGeometry[]): BufferGeometry {
  const g = mergeGeometries(parts, false)!;
  g.computeBoundingSphere();
  return g;
}

export function extrude(shape: Shape, depth: number): BufferGeometry {
  const g = new ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1, curveSegments: 6 });
  g.center();
  return g;
}

export function starShape(points: number, outer: number, inner: number): Shape {
  const s = new Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = Math.PI / 2 + (i * Math.PI) / points;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

// ------------------------------------------------------------------ food

export interface FoodModel {
  geometry: BufferGeometry;
  metalness: number;
  roughness: number;
  /** Self-glow (0..1) using the model's own vertex colors. */
  emissive: number;
  opacity: number;
}

export function buildFoodModel(type: FoodType): FoodModel {
  const c = FOODS[type].color;
  const a = FOODS[type].accent;
  const dark = '#1a1033';
  switch (type) {
    case 'apple':
      return {
        geometry: merge([
          // Two overlapping lobes + a dimple at the top read as an apple, not a tomato.
          part(new SphereGeometry(0.3, 18, 14), c, { pos: [-0.07, 0, 0], scale: [1, 1.05, 1] }),
          part(new SphereGeometry(0.3, 18, 14), c, { pos: [0.07, 0, 0], scale: [1, 1.05, 1] }),
          part(new SphereGeometry(0.27, 14, 10), '#ff6b5b', { pos: [0, -0.06, 0.08] }),
          part(new SphereGeometry(0.09, 8, 6), '#9c1018', { pos: [0, 0.29, 0], scale: [1.4, 0.5, 1.4] }),
          part(new CylinderGeometry(0.025, 0.035, 0.24, 6), '#6d3b12', { pos: [0.02, 0.4, 0], rot: [0, 0, -0.2] }),
          part(new SphereGeometry(0.13, 8, 6), a, { pos: [0.15, 0.42, 0], scale: [1.5, 0.3, 0.75], rot: [0, 0, 0.45] }),
          part(new SphereGeometry(0.08, 8, 6), '#ffffff', { pos: [-0.17, 0.12, 0.2], scale: [0.6, 1, 0.4] }),
        ]),
        metalness: 0.05, roughness: 0.3, emissive: 0.12, opacity: 1,
      };
    case 'egg':
      return {
        geometry: merge([
          part(new SphereGeometry(0.24, 16, 12), c, { pos: [0, 0.05, 0], scale: [1, 1.35, 1] }),
          ...[[0.1, 0.15, 0.18], [-0.12, 0.05, 0.17], [0.05, -0.1, 0.22], [-0.04, 0.25, 0.15], [0.17, -0.05, 0.12]].map(([x, y, z]) =>
            part(new SphereGeometry(0.03, 5, 4), a, { pos: [x, y, z], scale: [1, 1, 0.4] }),
          ),
          // Little straw nest.
          part(new TorusGeometry(0.24, 0.07, 6, 16), '#c9a26b', { pos: [0, -0.24, 0], rot: [Math.PI / 2, 0, 0] }),
          part(new TorusGeometry(0.2, 0.05, 6, 16), '#b08a5a', { pos: [0, -0.2, 0], rot: [Math.PI / 2, 0, 0.5] }),
        ]),
        metalness: 0.05, roughness: 0.4, emissive: 0.15, opacity: 1,
      };
    case 'ladybug': {
      const spots = [[0.1, 0.12, 0.12], [-0.12, 0.13, 0.08], [0.15, 0.08, -0.08], [-0.1, 0.1, -0.13], [0.0, 0.17, -0.02]];
      return {
        geometry: merge([
          part(new SphereGeometry(0.27, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), c, { pos: [0, -0.06, -0.03], scale: [1, 0.85, 1.15] }),
          part(new BoxGeometry(0.015, 0.2, 0.55), a, { pos: [0, 0.07, -0.04] }),
          ...spots.map(([x, y, z]) => part(new SphereGeometry(0.05, 6, 4), a, { pos: [x, y, z], scale: [1, 0.5, 1] })),
          part(new SphereGeometry(0.12, 10, 8), a, { pos: [0, -0.04, 0.27] }),
          part(new SphereGeometry(0.03, 5, 4), '#ffffff', { pos: [-0.05, 0.0, 0.37] }),
          part(new SphereGeometry(0.03, 5, 4), '#ffffff', { pos: [0.05, 0.0, 0.37] }),
          part(new CylinderGeometry(0.01, 0.01, 0.16, 4), a, { pos: [-0.05, 0.09, 0.36], rot: [0.7, 0, 0.3] }),
          part(new CylinderGeometry(0.01, 0.01, 0.16, 4), a, { pos: [0.05, 0.09, 0.36], rot: [0.7, 0, -0.3] }),
          ...[-1, 1].flatMap((sd) => [-0.12, 0, 0.12].map((z) => part(new CylinderGeometry(0.012, 0.012, 0.16, 4), a, { pos: [sd * 0.25, -0.1, z], rot: [0, 0, sd * 1.1] }))),
        ]),
        metalness: 0.2, roughness: 0.2, emissive: 0.12, opacity: 1,
      };
    }
    case 'mouse':
      return {
        geometry: merge([
          part(new SphereGeometry(0.22, 14, 10), c, { pos: [0, -0.05, -0.02], scale: [0.9, 0.75, 1.3] }),
          part(new SphereGeometry(0.14, 12, 9), c, { pos: [0, 0.0, 0.26], scale: [0.9, 0.85, 1.1] }),
          part(new ConeGeometry(0.06, 0.12, 8), c, { pos: [0, -0.02, 0.4], rot: [Math.PI / 2, 0, 0] }),
          part(new SphereGeometry(0.03, 6, 4), a, { pos: [0, -0.02, 0.46] }),
          part(new SphereGeometry(0.1, 10, 6), a, { pos: [-0.11, 0.14, 0.2], scale: [1, 1, 0.3] }),
          part(new SphereGeometry(0.1, 10, 6), a, { pos: [0.11, 0.14, 0.2], scale: [1, 1, 0.3] }),
          part(new SphereGeometry(0.11, 10, 6), c, { pos: [-0.11, 0.14, 0.19], scale: [1.15, 1.15, 0.25] }),
          part(new SphereGeometry(0.11, 10, 6), c, { pos: [0.11, 0.14, 0.19], scale: [1.15, 1.15, 0.25] }),
          part(new SphereGeometry(0.025, 5, 4), '#111111', { pos: [-0.06, 0.04, 0.35] }),
          part(new SphereGeometry(0.025, 5, 4), '#111111', { pos: [0.06, 0.04, 0.35] }),
          part(new TorusGeometry(0.16, 0.015, 4, 12, Math.PI * 1.2), a, { pos: [0.1, -0.12, -0.3], rot: [Math.PI / 2, 0, 0] }),
        ]),
        metalness: 0.05, roughness: 0.55, emissive: 0.1, opacity: 1,
      };
    case 'golden':
      return {
        geometry: merge([part(extrude(starShape(5, 0.44, 0.2), 0.14), c), part(extrude(starShape(5, 0.22, 0.1), 0.2), a)]),
        metalness: 0.6, roughness: 0.25, emissive: 0.35, opacity: 1,
      };
    case 'speed': {
      const s = new Shape();
      s.moveTo(0.08, 0.45);
      s.lineTo(-0.22, -0.02);
      s.lineTo(0.0, -0.02);
      s.lineTo(-0.1, -0.45);
      s.lineTo(0.24, 0.08);
      s.lineTo(0.02, 0.08);
      s.closePath();
      return { geometry: merge([part(extrude(s, 0.14), c)]), metalness: 0.2, roughness: 0.3, emissive: 0.45, opacity: 1 };
    }
    case 'slow':
      return {
        geometry: merge([
          part(new ConeGeometry(0.24, 0.32, 12), a, { pos: [0, -0.15, 0], rot: [Math.PI, 0, 0] }),
          part(new ConeGeometry(0.24, 0.32, 12), a, { pos: [0, 0.15, 0] }),
          part(new ConeGeometry(0.17, 0.16, 12), c, { pos: [0, -0.22, 0], rot: [Math.PI, 0, 0] }),
          part(new CylinderGeometry(0.3, 0.3, 0.07, 14), c, { pos: [0, 0.33, 0] }),
          part(new CylinderGeometry(0.3, 0.3, 0.07, 14), c, { pos: [0, -0.33, 0] }),
        ]),
        metalness: 0.2, roughness: 0.35, emissive: 0.2, opacity: 1,
      };
    case 'ghost':
      return {
        geometry: merge([
          part(new SphereGeometry(0.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), c, { pos: [0, 0.08, 0] }),
          part(new CylinderGeometry(0.3, 0.33, 0.32, 16, 1, true), c, { pos: [0, -0.08, 0] }),
          ...[0, 1, 2, 3, 4, 5].map((k) =>
            part(new ConeGeometry(0.09, 0.14, 6), c, {
              pos: [Math.cos((k / 6) * Math.PI * 2) * 0.24, -0.29, Math.sin((k / 6) * Math.PI * 2) * 0.24],
              rot: [Math.PI, 0, 0],
            }),
          ),
          part(new SphereGeometry(0.06, 8, 6), a, { pos: [-0.1, 0.12, 0.26], scale: [1, 1.4, 0.6] }),
          part(new SphereGeometry(0.06, 8, 6), a, { pos: [0.1, 0.12, 0.26], scale: [1, 1.4, 0.6] }),
        ]),
        metalness: 0, roughness: 0.4, emissive: 0.35, opacity: 0.85,
      };
    case 'shrink':
      return {
        geometry: merge([
          part(new CylinderGeometry(0.36, 0.36, 0.16, 6), c, { rot: [Math.PI / 2, 0, 0] }),
          part(new BoxGeometry(0.4, 0.1, 0.06), a, { pos: [0, 0, 0.1] }),
          part(new BoxGeometry(0.4, 0.1, 0.06), a, { pos: [0, 0, -0.1] }),
        ]),
        metalness: 0.15, roughness: 0.3, emissive: 0.25, opacity: 1,
      };
    case 'magnet':
      return {
        geometry: merge([
          part(new TorusGeometry(0.22, 0.09, 8, 18, Math.PI), c, { pos: [0, -0.04, 0], rot: [0, 0, Math.PI] }),
          part(new CylinderGeometry(0.09, 0.09, 0.2, 10), c, { pos: [-0.22, 0.06, 0] }),
          part(new CylinderGeometry(0.09, 0.09, 0.2, 10), c, { pos: [0.22, 0.06, 0] }),
          part(new CylinderGeometry(0.095, 0.095, 0.12, 10), a, { pos: [-0.22, 0.22, 0] }),
          part(new CylinderGeometry(0.095, 0.095, 0.12, 10), a, { pos: [0.22, 0.22, 0] }),
        ]),
        metalness: 0.5, roughness: 0.3, emissive: 0.2, opacity: 1,
      };
    case 'poison': {
      const spikes: BufferGeometry[] = [];
      const dirs = new IcosahedronGeometry(1, 0).getAttribute('position');
      const seen = new Set<string>();
      for (let i = 0; i < dirs.count; i++) {
        const v = new Vector3(dirs.getX(i), dirs.getY(i), dirs.getZ(i)).normalize();
        const key = v.toArray().map((n) => n.toFixed(2)).join();
        if (seen.has(key)) continue;
        seen.add(key);
        const g = new ConeGeometry(0.07, 0.16, 6);
        quat.setFromUnitVectors(up, v);
        g.applyQuaternion(quat);
        g.translate(v.x * 0.3, v.y * 0.3, v.z * 0.3);
        spikes.push(part(g, c));
      }
      return {
        geometry: merge([
          part(new SphereGeometry(0.27, 16, 12), c),
          ...spikes,
          part(new BoxGeometry(0.13, 0.035, 0.04), a, { pos: [-0.09, 0.06, 0.26], rot: [0, 0, 0.7] }),
          part(new BoxGeometry(0.13, 0.035, 0.04), a, { pos: [-0.09, 0.06, 0.26], rot: [0, 0, -0.7] }),
          part(new BoxGeometry(0.13, 0.035, 0.04), a, { pos: [0.09, 0.06, 0.26], rot: [0, 0, 0.7] }),
          part(new BoxGeometry(0.13, 0.035, 0.04), a, { pos: [0.09, 0.06, 0.26], rot: [0, 0, -0.7] }),
          part(new BoxGeometry(0.16, 0.035, 0.04), dark, { pos: [0, -0.08, 0.26] }),
        ]),
        metalness: 0.1, roughness: 0.35, emissive: 0.25, opacity: 1,
      };
    }
  }
}

// ------------------------------------------------------------- obstacles

export interface ObstacleModel {
  /** Lit body geometry. */
  body: BufferGeometry;
  /** Optional unlit "glowing" geometry (lava cracks, neon frames). */
  glow?: BufferGeometry;
}

/**
 * Variants of the obstacle model for a zone style (instances pick one by seed).
 * Every obstacle stands on a red "danger" plate so it can never be mistaken for
 * harmless scenery.
 */
export function buildObstacleModels(style: ObstacleStyle, p: ZonePalette): ObstacleModel[] {
  return obstacleVariants(style, p).map((v) => ({
    ...v,
    body: merge([
      part(new CylinderGeometry(0.62, 0.66, 0.04, 4), '#8e1b2b', { pos: [0, 0.02, 0], rot: [0, Math.PI / 4, 0] }),
      part(new CylinderGeometry(0.56, 0.56, 0.05, 4), '#e8475b', { pos: [0, 0.03, 0], rot: [0, Math.PI / 4, 0] }),
      v.body,
    ]),
  }));
}

function obstacleVariants(style: ObstacleStyle, p: ZonePalette): ObstacleModel[] {
  switch (style) {
    case 'rock':
      return [
        { body: merge([part(new DodecahedronGeometry(0.46, 0), p.obstacle, { pos: [0, 0.3, 0], scale: [1, 0.72, 1] }), part(new DodecahedronGeometry(0.2, 0), p.obstacleLight, { pos: [0.22, 0.12, 0.2] })]) },
        {
          body: merge([
            part(new DodecahedronGeometry(0.3, 0), p.obstacleDark, { pos: [-0.12, 0.24, 0.05] }),
            part(new DodecahedronGeometry(0.26, 0), p.obstacle, { pos: [0.2, 0.2, -0.08] }),
            part(new DodecahedronGeometry(0.2, 0), p.obstacleLight, { pos: [0.02, 0.5, 0] }),
          ]),
        },
      ];
    case 'cactus': {
      const body = (armSide: number) =>
        merge([
          part(new CylinderGeometry(0.15, 0.17, 0.95, 10), p.obstacle, { pos: [0, 0.47, 0] }),
          part(new SphereGeometry(0.15, 10, 6), p.obstacle, { pos: [0, 0.95, 0] }),
          part(new CylinderGeometry(0.09, 0.09, 0.28, 8), p.obstacle, { pos: [armSide * 0.24, 0.45, 0], rot: [0, 0, Math.PI / 2] }),
          part(new CylinderGeometry(0.09, 0.09, 0.32, 8), p.obstacle, { pos: [armSide * 0.36, 0.6, 0] }),
          part(new SphereGeometry(0.09, 8, 6), p.obstacle, { pos: [armSide * 0.36, 0.76, 0] }),
          part(new SphereGeometry(0.07, 8, 6), '#ff6fb5', { pos: [0, 1.08, 0] }),
          part(new CylinderGeometry(0.3, 0.34, 0.06, 10), '#d9b061', { pos: [0, 0.03, 0] }),
        ]);
      return [{ body: body(1) }, { body: body(-1) }];
    }
    case 'coral': {
      const branch = (x: number, z: number, h: number, tilt: number, col: string) => [
        part(new CylinderGeometry(0.06, 0.09, h, 7), col, { pos: [x, h / 2, z], rot: [tilt, 0, -tilt] }),
        part(new SphereGeometry(0.1, 8, 6), p.obstacleLight, { pos: [x - Math.sin(tilt) * h * 0.5, h, z + Math.sin(tilt) * h * 0.5] }),
      ];
      return [
        { body: merge([...branch(0, 0, 0.8, 0, p.obstacle), ...branch(0.15, 0.05, 0.6, 0.35, p.obstacle), ...branch(-0.15, -0.05, 0.55, -0.35, p.obstacleDark)]) },
        { body: merge([part(new SphereGeometry(0.36, 12, 8), p.obstacleDark, { pos: [0, 0.25, 0], scale: [1, 0.7, 1] }), ...branch(0.05, 0, 0.7, 0.2, p.obstacle)]) },
      ];
    }
    case 'ice':
      return [
        { body: merge([part(new BoxGeometry(0.86, 0.72, 0.86), p.obstacle, { pos: [0, 0.36, 0] }), part(new BoxGeometry(0.88, 0.08, 0.88), p.obstacleLight, { pos: [0, 0.74, 0] })]) },
        { body: merge([part(new OctahedronGeometry(0.42, 0), p.obstacleLight, { pos: [0, 0.5, 0], scale: [0.8, 1.3, 0.8] }), part(new BoxGeometry(0.7, 0.2, 0.7), p.obstacle, { pos: [0, 0.1, 0] })]) },
      ];
    case 'lava': {
      const cracks = (s: number) =>
        merge([
          part(new BoxGeometry(0.5, 0.05, 0.06), '#ff7b00', { pos: [0, 0.42, 0.3 * s], rot: [0, 0.4, 0.2] }),
          part(new BoxGeometry(0.06, 0.05, 0.4), '#ffb000', { pos: [0.28, 0.34, 0], rot: [0.3, 0, 0] }),
          part(new SphereGeometry(0.1, 8, 6), '#ff5a1f', { pos: [-0.1, 0.62, 0] }),
        ]);
      return [
        { body: merge([part(new DodecahedronGeometry(0.45, 0), p.obstacle, { pos: [0, 0.34, 0], scale: [1, 0.85, 1] })]), glow: cracks(1) },
        { body: merge([part(new ConeGeometry(0.42, 0.75, 7), p.obstacle, { pos: [0, 0.37, 0] })]), glow: merge([part(new CylinderGeometry(0.12, 0.16, 0.06, 8), '#ff7b00', { pos: [0, 0.74, 0] }), part(new BoxGeometry(0.05, 0.4, 0.05), '#ff5a1f', { pos: [0.2, 0.3, 0.12], rot: [0, 0, 0.5] })]) },
      ];
    }
    case 'neon': {
      const frame = (col: string, h: number) => {
        const t = 0.05;
        const s = 0.82;
        const parts: BufferGeometry[] = [];
        for (const y of [0.03, h]) {
          parts.push(part(new BoxGeometry(s, t, t), col, { pos: [0, y, s / 2] }), part(new BoxGeometry(s, t, t), col, { pos: [0, y, -s / 2] }));
          parts.push(part(new BoxGeometry(t, t, s), col, { pos: [s / 2, y, 0] }), part(new BoxGeometry(t, t, s), col, { pos: [-s / 2, y, 0] }));
        }
        for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) parts.push(part(new BoxGeometry(t, h, t), col, { pos: [(x * s) / 2, h / 2, (z * s) / 2] }));
        return merge(parts);
      };
      return [
        { body: merge([part(new BoxGeometry(0.8, 0.7, 0.8), p.obstacle, { pos: [0, 0.35, 0] })]), glow: frame(p.obstacleLight, 0.7) },
        { body: merge([part(new BoxGeometry(0.8, 1.0, 0.8), p.obstacle, { pos: [0, 0.5, 0] })]), glow: frame(p.obstacleDark, 1.0) },
      ];
    }
    case 'asteroid':
      return [
        { body: merge([part(new IcosahedronGeometry(0.42, 0), p.obstacle, { pos: [0, 0.4, 0] }), part(new IcosahedronGeometry(0.12, 0), p.obstacleDark, { pos: [0.2, 0.62, 0.2] })]) },
        {
          body: merge([
            part(new SphereGeometry(0.32, 16, 12), '#e07a2f', { pos: [0, 0.45, 0] }),
            part(new TorusGeometry(0.48, 0.04, 6, 28), '#fde68a', { pos: [0, 0.45, 0], rot: [Math.PI / 2.4, 0, 0.3] }),
          ]),
        },
      ];
  }
}

// ------------------------------------------------------------------ decor

export interface DecorModel {
  geometry: BufferGeometry;
  /** Unlit (glowing) material instead of lit. */
  glow?: boolean;
}

export function buildDecorModel(kind: DecorKind): DecorModel {
  switch (kind) {
    case 'flower': {
      const petals = [0, 1, 2, 3, 4].map((k) =>
        part(new SphereGeometry(0.07, 6, 4), k % 2 ? '#ff7aa8' : '#ffd23f', {
          pos: [Math.cos((k / 5) * Math.PI * 2) * 0.08, 0.2, Math.sin((k / 5) * Math.PI * 2) * 0.08],
          scale: [1, 0.4, 1],
        }),
      );
      return { geometry: merge([part(new CylinderGeometry(0.015, 0.015, 0.2, 4), '#2e7d32', { pos: [0, 0.1, 0] }), ...petals, part(new SphereGeometry(0.05, 6, 4), '#fff59d', { pos: [0, 0.22, 0] })]) };
    }
    case 'mushroom':
      return {
        geometry: merge([
          part(new CylinderGeometry(0.04, 0.05, 0.14, 6), '#fff3e0', { pos: [0, 0.07, 0] }),
          part(new SphereGeometry(0.12, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), '#c58b4b', { pos: [0, 0.13, 0] }),
          part(new SphereGeometry(0.025, 4, 3), '#ffffff', { pos: [0.05, 0.22, 0.04] }),
          part(new SphereGeometry(0.025, 4, 3), '#ffffff', { pos: [-0.05, 0.2, -0.04] }),
        ]),
      };
    case 'grass':
      return {
        geometry: merge([
          part(new ConeGeometry(0.03, 0.22, 4), '#3fa34d', { pos: [0, 0.11, 0] }),
          part(new ConeGeometry(0.03, 0.18, 4), '#56c25c', { pos: [0.05, 0.09, 0.02], rot: [0, 0, -0.35] }),
          part(new ConeGeometry(0.03, 0.17, 4), '#2e8b3d', { pos: [-0.05, 0.08, -0.02], rot: [0, 0, 0.35] }),
        ]),
      };
    case 'pebble':
      return { geometry: merge([part(new DodecahedronGeometry(0.09, 0), '#b08a5a', { pos: [0, 0.04, 0], scale: [1, 0.6, 1] }), part(new DodecahedronGeometry(0.06, 0), '#c9a26b', { pos: [0.1, 0.03, 0.05] })]) };
    case 'dune':
      return { geometry: merge([part(new SphereGeometry(0.3, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), '#e3bd6c', { scale: [1.4, 0.25, 0.8] })]) };
    case 'skull':
      return {
        geometry: merge([
          part(new SphereGeometry(0.08, 8, 5), '#f5f0e1', { pos: [0, 0.07, 0] }),
          part(new SphereGeometry(0.02, 4, 3), '#3a2a1a', { pos: [-0.03, 0.08, 0.07] }),
          part(new SphereGeometry(0.02, 4, 3), '#3a2a1a', { pos: [0.03, 0.08, 0.07] }),
        ]),
      };
    case 'shell':
      return { geometry: merge([part(new SphereGeometry(0.1, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), '#ffc1d6', { scale: [1, 0.5, 1.2] }), part(new ConeGeometry(0.03, 0.06, 6), '#ff9ebf', { pos: [0, 0.03, -0.12], rot: [-Math.PI / 2, 0, 0] })]) };
    case 'starfish':
      return { geometry: merge([part(extrude(starShape(5, 0.15, 0.06), 0.04), '#ff8a3d', { pos: [0, 0.03, 0], rot: [-Math.PI / 2, 0, 0] })]) };
    case 'seaweed':
      return {
        geometry: merge([
          part(new ConeGeometry(0.04, 0.5, 5), '#2e8b57', { pos: [0, 0.25, 0], rot: [0.1, 0, 0.1] }),
          part(new ConeGeometry(0.035, 0.38, 5), '#3cb371', { pos: [0.07, 0.19, 0.03], rot: [-0.15, 0, -0.2] }),
        ]),
      };
    case 'snowMound':
      return { geometry: merge([part(new SphereGeometry(0.22, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), '#ffffff', { scale: [1.2, 0.45, 1] })]) };
    case 'crystal':
      return { geometry: merge([part(new OctahedronGeometry(0.09, 0), '#9fdcff', { pos: [0, 0.12, 0], scale: [0.7, 1.5, 0.7] }), part(new OctahedronGeometry(0.06, 0), '#d6f1ff', { pos: [0.08, 0.07, 0.03], scale: [0.7, 1.4, 0.7] })]) };
    case 'pine':
      return {
        geometry: merge([
          part(new CylinderGeometry(0.025, 0.03, 0.1, 5), '#6d4c41', { pos: [0, 0.05, 0] }),
          part(new ConeGeometry(0.13, 0.22, 7), '#1b5e20', { pos: [0, 0.18, 0] }),
          part(new ConeGeometry(0.09, 0.16, 7), '#ffffff', { pos: [0, 0.3, 0] }),
        ]),
      };
    case 'ember':
      return { geometry: merge([part(new IcosahedronGeometry(0.06, 0), '#ff7b00'), part(new IcosahedronGeometry(0.04, 0), '#ffb000', { pos: [0.08, 0, 0.04] })]), glow: true };
    case 'darkRock':
      return { geometry: merge([part(new DodecahedronGeometry(0.12, 0), '#3a2f2b', { pos: [0, 0.05, 0], scale: [1, 0.6, 1] })]) };
    case 'neonTile':
      // Small round floor lights (kept tiny so they never read as obstacles).
      return {
        geometry: merge([
          part(new CylinderGeometry(0.05, 0.05, 0.02, 10), '#00f0ff', { pos: [0, 0.01, 0] }),
          part(new CylinderGeometry(0.035, 0.035, 0.02, 10), '#ff2bd6', { pos: [0.16, 0.01, 0.08] }),
          part(new CylinderGeometry(0.03, 0.03, 0.02, 10), '#fff200', { pos: [-0.12, 0.01, 0.14] }),
        ]),
        glow: true,
      };
    case 'neonPyramid':
      return { geometry: merge([part(new ConeGeometry(0.12, 0.2, 4), '#00f0ff', { pos: [0, 0.1, 0] })]), glow: true };
    case 'crater':
      return { geometry: merge([part(new TorusGeometry(0.2, 0.04, 6, 16), '#4a4d6e', { pos: [0, 0.01, 0], rot: [Math.PI / 2, 0, 0] }), part(new CylinderGeometry(0.19, 0.19, 0.01, 14), '#15162e', { pos: [0, 0.004, 0] })]) };
    case 'spaceCrystal':
      return { geometry: merge([part(new OctahedronGeometry(0.08, 0), '#b388ff', { pos: [0, 0.1, 0], scale: [0.7, 1.6, 0.7] }), part(new OctahedronGeometry(0.05, 0), '#5ee6ff', { pos: [0.07, 0.06, 0], scale: [0.7, 1.5, 0.7] })]), glow: true };
    case 'tulip': {
      const col = ['#ff5fa2', '#ffd23f', '#b388ff'];
      return {
        geometry: merge([
          part(new CylinderGeometry(0.018, 0.018, 0.3, 4), '#2e7d32', { pos: [0, 0.15, 0] }),
          part(new SphereGeometry(0.06, 6, 4), '#43a047', { pos: [0.05, 0.08, 0], scale: [0.5, 1.6, 0.3], rot: [0, 0, -0.5] }),
          part(new ConeGeometry(0.07, 0.12, 6, 1, true), col[0], { pos: [0, 0.34, 0], rot: [Math.PI, 0, 0] }),
          part(new CylinderGeometry(0.018, 0.018, 0.24, 4), '#2e7d32', { pos: [0.14, 0.12, 0.08] }),
          part(new ConeGeometry(0.06, 0.1, 6, 1, true), col[1], { pos: [0.14, 0.27, 0.08], rot: [Math.PI, 0, 0] }),
          part(new CylinderGeometry(0.018, 0.018, 0.26, 4), '#2e7d32', { pos: [-0.12, 0.13, -0.06] }),
          part(new ConeGeometry(0.06, 0.1, 6, 1, true), col[2], { pos: [-0.12, 0.29, -0.06], rot: [Math.PI, 0, 0] }),
        ]),
      };
    }
    case 'clover':
      return {
        geometry: merge(
          [0, 1, 2, 3, 4, 5].map((k) =>
            part(new SphereGeometry(0.07, 6, 4), k % 2 ? '#4caf50' : '#66bb6a', {
              pos: [Math.cos(k * 1.05) * 0.12, 0.03, Math.sin(k * 1.05) * 0.12],
              scale: [1, 0.25, 1],
            }),
          ),
        ),
      };
    case 'succulent':
      return {
        geometry: merge(
          [0, 1, 2, 3, 4, 5, 6].map((k) =>
            part(new ConeGeometry(0.05, 0.22, 5), k % 2 ? '#7cb342' : '#9ccc65', {
              pos: [Math.cos(k * 0.9) * 0.05, 0.08, Math.sin(k * 0.9) * 0.05],
              rot: [Math.sin(k * 0.9) * 0.6, 0, -Math.cos(k * 0.9) * 0.6],
            }),
          ).concat([part(new CylinderGeometry(0.12, 0.1, 0.08, 8), '#c97b4a', { pos: [0, 0.03, 0] })]),
        ),
      };
    case 'urchin': {
      const spikes: BufferGeometry[] = [];
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2;
        spikes.push(part(new ConeGeometry(0.02, 0.16, 4), '#3b1f5c', { pos: [Math.cos(a) * 0.09, 0.08, Math.sin(a) * 0.09], rot: [Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1] }));
      }
      return { geometry: merge([part(new SphereGeometry(0.09, 8, 5), '#4a2a70', { pos: [0, 0.05, 0] }), ...spikes]) };
    }
    case 'icePuddle':
      return { geometry: merge([part(new CylinderGeometry(0.32, 0.32, 0.015, 14), '#bfe8ff', { pos: [0, 0.008, 0], scale: [1.3, 1, 0.8] })]) };
    case 'lavaPool':
      return {
        geometry: merge([
          part(new CylinderGeometry(0.34, 0.34, 0.015, 14), '#ff6a00', { pos: [0, 0.008, 0], scale: [1.3, 1, 0.9] }),
          part(new CylinderGeometry(0.2, 0.2, 0.02, 12), '#ffd000', { pos: [0.05, 0.01, 0] }),
        ]),
        glow: true,
      };
    case 'neonRing':
      return { geometry: merge([part(new TorusGeometry(0.22, 0.025, 6, 24), '#fff200', { pos: [0, 0.02, 0], rot: [Math.PI / 2, 0, 0] })]), glow: true };
    case 'meteorite':
      return {
        geometry: merge([
          part(new DodecahedronGeometry(0.14, 0), '#6d6a7a', { pos: [0, 0.08, 0] }),
          part(new DodecahedronGeometry(0.07, 0), '#8f8aa3', { pos: [0.15, 0.04, 0.05] }),
        ]),
      };
  }
}
