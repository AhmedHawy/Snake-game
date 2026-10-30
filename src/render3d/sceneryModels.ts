// Big scenery pieces (trees, palms, kelp, snowmen, towers...) and animated
// creatures, built from primitives and merged into vertex-colored geometry.
import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  IcosahedronGeometry,
  OctahedronGeometry,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
} from 'three';
import type { CreatureKind, TallKind } from '../config/zones';
import { merge, part } from './models';

export interface TallModel {
  body: BufferGeometry;
  /** Unlit glowing parts. */
  glow?: BufferGeometry;
  /** Gently sways (kelp, palms). */
  sway?: boolean;
}

const leafRing = (n: number, r: number, y: number, len: number, col: string, droop = 0.5): BufferGeometry[] =>
  Array.from({ length: n }, (_, k) => {
    const a = (k / n) * Math.PI * 2;
    return part(new ConeGeometry(0.09, len, 4), col, {
      pos: [Math.cos(a) * r, y, Math.sin(a) * r],
      rot: [Math.sin(a) * (Math.PI / 2 + droop), 0, -Math.cos(a) * (Math.PI / 2 + droop)],
      scale: [1.6, 1, 0.35],
    });
  });

export function buildTallModel(kind: TallKind): TallModel {
  switch (kind) {
    case 'tree':
      return {
        body: merge([
          part(new CylinderGeometry(0.1, 0.15, 1.0, 7), '#7a4b2a', { pos: [0, 0.5, 0] }),
          part(new IcosahedronGeometry(0.62, 1), '#3faa3f', { pos: [0, 1.35, 0] }),
          part(new IcosahedronGeometry(0.45, 1), '#56c25c', { pos: [0.32, 1.6, 0.12] }),
          part(new IcosahedronGeometry(0.42, 1), '#2e8b3d', { pos: [-0.3, 1.5, -0.1] }),
          part(new IcosahedronGeometry(0.32, 1), '#7ad97a', { pos: [0.05, 1.85, 0.05] }),
        ]),
      };
    case 'blossomTree':
      return {
        body: merge([
          part(new CylinderGeometry(0.09, 0.14, 0.95, 7), '#6d3f22', { pos: [0, 0.48, 0], rot: [0, 0, 0.08] }),
          part(new CylinderGeometry(0.05, 0.07, 0.5, 5), '#6d3f22', { pos: [0.18, 1.0, 0], rot: [0, 0, -0.7] }),
          part(new IcosahedronGeometry(0.55, 1), '#ffb3d1', { pos: [0, 1.3, 0] }),
          part(new IcosahedronGeometry(0.42, 1), '#ff8fbf', { pos: [0.38, 1.45, 0.1] }),
          part(new IcosahedronGeometry(0.4, 1), '#ffd1e3', { pos: [-0.32, 1.42, -0.08] }),
          part(new IcosahedronGeometry(0.3, 1), '#ffffff', { pos: [0.1, 1.72, 0.08] }),
        ]),
      };
    case 'bush':
      return {
        body: merge([
          part(new IcosahedronGeometry(0.4, 1), '#2f9e44', { pos: [0, 0.32, 0] }),
          part(new IcosahedronGeometry(0.32, 1), '#40c057', { pos: [0.35, 0.26, 0.1] }),
          part(new IcosahedronGeometry(0.3, 1), '#2b8a3e', { pos: [-0.32, 0.24, -0.05] }),
          ...[0, 1, 2, 3, 4].map((k) => part(new SphereGeometry(0.05, 5, 4), '#ffffff', { pos: [Math.cos(k * 1.3) * 0.36, 0.5 + (k % 2) * 0.1, Math.sin(k * 1.3) * 0.3] })),
        ]),
      };
    case 'sunflower':
      return {
        body: merge([
          part(new CylinderGeometry(0.035, 0.045, 1.3, 6), '#3a8a2a', { pos: [0, 0.65, 0] }),
          part(new SphereGeometry(0.12, 6, 4), '#4caf50', { pos: [0.12, 0.6, 0], scale: [1.4, 0.3, 0.7], rot: [0, 0, -0.5] }),
          part(new SphereGeometry(0.12, 6, 4), '#4caf50', { pos: [-0.12, 0.85, 0], scale: [1.4, 0.3, 0.7], rot: [0, 0, 0.5] }),
          ...Array.from({ length: 12 }, (_, k) =>
            part(new SphereGeometry(0.09, 5, 4), '#ffd23f', {
              pos: [Math.cos((k / 12) * Math.PI * 2) * 0.26, 1.4 + Math.sin((k / 12) * Math.PI * 2) * 0.26, 0.06],
              scale: [1.5, 0.7, 0.3],
              rot: [0, 0, (k / 12) * Math.PI * 2],
            }),
          ),
          part(new CylinderGeometry(0.17, 0.17, 0.08, 12), '#6d3b12', { pos: [0, 1.4, 0.08], rot: [Math.PI / 2, 0, 0] }),
        ]),
      };
    case 'saguaro':
      return {
        body: merge([
          part(new CylinderGeometry(0.2, 0.24, 1.9, 9), '#2f9e44', { pos: [0, 0.95, 0] }),
          part(new SphereGeometry(0.2, 9, 6), '#2f9e44', { pos: [0, 1.9, 0] }),
          part(new CylinderGeometry(0.12, 0.12, 0.42, 8), '#37b24d', { pos: [0.3, 0.8, 0], rot: [0, 0, Math.PI / 2] }),
          part(new CylinderGeometry(0.12, 0.12, 0.6, 8), '#37b24d', { pos: [0.5, 1.08, 0] }),
          part(new SphereGeometry(0.12, 8, 5), '#37b24d', { pos: [0.5, 1.38, 0] }),
          part(new CylinderGeometry(0.11, 0.11, 0.36, 8), '#37b24d', { pos: [-0.28, 1.2, 0], rot: [0, 0, Math.PI / 2] }),
          part(new CylinderGeometry(0.11, 0.11, 0.45, 8), '#37b24d', { pos: [-0.45, 1.42, 0] }),
          part(new SphereGeometry(0.11, 8, 5), '#37b24d', { pos: [-0.45, 1.65, 0] }),
          part(new SphereGeometry(0.08, 6, 4), '#ff6fb5', { pos: [0, 2.08, 0] }),
        ]),
      };
    case 'palm': {
      const trunk: BufferGeometry[] = [];
      for (let k = 0; k < 6; k++) trunk.push(part(new CylinderGeometry(0.1 - k * 0.006, 0.12 - k * 0.006, 0.36, 7), k % 2 ? '#a8763e' : '#8f6232', { pos: [k * k * 0.012, 0.18 + k * 0.33, 0], rot: [0, 0, -k * 0.05] }));
      return {
        body: merge([
          ...trunk,
          ...leafRing(7, 0.38, 2.05, 0.95, '#2fa84f', 0.25),
          part(new SphereGeometry(0.08, 6, 5), '#6d3b12', { pos: [0.48, 1.95, 0.08] }),
          part(new SphereGeometry(0.08, 6, 5), '#6d3b12', { pos: [0.38, 1.92, -0.1] }),
        ]),
        sway: true,
      };
    }
    case 'rockPillar':
      return {
        body: merge([
          part(new DodecahedronGeometry(0.5, 0), '#d9822b', { pos: [0, 0.4, 0], scale: [1, 0.8, 1] }),
          part(new DodecahedronGeometry(0.4, 0), '#e8a04f', { pos: [0.05, 1.0, 0], scale: [1, 0.9, 1] }),
          part(new DodecahedronGeometry(0.3, 0), '#c46a1f', { pos: [-0.05, 1.5, 0.02] }),
        ]),
      };
    case 'kelp': {
      const blades: BufferGeometry[] = [];
      for (let k = 0; k < 8; k++) blades.push(part(new SphereGeometry(0.12, 6, 4), k % 2 ? '#4f8a2b' : '#6aa832', { pos: [Math.sin(k * 0.8) * 0.08, 0.15 + k * 0.28, 0], scale: [1, 1.8, 0.35] }));
      for (let k = 0; k < 6; k++) blades.push(part(new SphereGeometry(0.1, 6, 4), '#7cbf3a', { pos: [0.3 + Math.sin(k * 0.8) * 0.06, 0.12 + k * 0.26, 0.15], scale: [1, 1.8, 0.35] }));
      return { body: merge(blades), sway: true };
    }
    case 'coralFan':
      return {
        body: merge([
          part(new SphereGeometry(0.6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#b5179e', { pos: [0, 0.1, 0], scale: [1, 1.5, 0.12] }),
          part(new SphereGeometry(0.45, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), '#f72585', { pos: [0.4, 0.05, 0.2], scale: [1, 1.4, 0.12], rot: [0, 0.6, 0] }),
          part(new CylinderGeometry(0.06, 0.08, 0.2, 6), '#7209b7', { pos: [0, 0.1, 0] }),
        ]),
        sway: true,
      };
    case 'brainCoral':
      return {
        body: merge([
          part(new IcosahedronGeometry(0.55, 2), '#ff9f43', { pos: [0, 0.35, 0], scale: [1, 0.7, 1] }),
          part(new TorusGeometry(0.4, 0.04, 6, 20), '#ffbe76', { pos: [0, 0.6, 0], rot: [Math.PI / 2, 0, 0] }),
          part(new TorusGeometry(0.25, 0.035, 6, 16), '#ffbe76', { pos: [0, 0.7, 0], rot: [Math.PI / 2, 0, 0] }),
        ]),
      };
    case 'chest':
      return {
        body: merge([
          part(new BoxGeometry(0.8, 0.45, 0.55), '#8b5a2b', { pos: [0, 0.23, 0] }),
          part(new CylinderGeometry(0.275, 0.275, 0.8, 10, 1, false, 0, Math.PI), '#9c6b35', { pos: [0, 0.45, -0.05], rot: [0, 0, Math.PI / 2] }),
          part(new BoxGeometry(0.84, 0.08, 0.6), '#d4a017', { pos: [0, 0.45, 0] }),
          part(new BoxGeometry(0.1, 0.16, 0.05), '#d4a017', { pos: [0, 0.38, 0.29] }),
        ]),
        glow: merge([
          part(new SphereGeometry(0.08, 6, 4), '#ffd23f', { pos: [0.15, 0.62, 0.15] }),
          part(new SphereGeometry(0.06, 6, 4), '#fff59d', { pos: [-0.1, 0.66, 0.1] }),
          part(new OctahedronGeometry(0.07, 0), '#5ee6ff', { pos: [0.02, 0.7, 0.18] }),
        ]),
      };
    case 'snowPine':
      return {
        body: merge([
          part(new CylinderGeometry(0.08, 0.1, 0.4, 6), '#6d4c41', { pos: [0, 0.2, 0] }),
          part(new ConeGeometry(0.62, 0.8, 9), '#1b5e20', { pos: [0, 0.75, 0] }),
          part(new ConeGeometry(0.5, 0.55, 9), '#ffffff', { pos: [0, 0.98, 0] }),
          part(new ConeGeometry(0.46, 0.7, 9), '#1e6b25', { pos: [0, 1.25, 0] }),
          part(new ConeGeometry(0.36, 0.45, 9), '#ffffff', { pos: [0, 1.45, 0] }),
          part(new ConeGeometry(0.3, 0.6, 9), '#237a2b', { pos: [0, 1.7, 0] }),
          part(new ConeGeometry(0.18, 0.32, 9), '#ffffff', { pos: [0, 1.92, 0] }),
        ]),
      };
    case 'snowman':
      return {
        body: merge([
          part(new SphereGeometry(0.42, 12, 9), '#ffffff', { pos: [0, 0.38, 0] }),
          part(new SphereGeometry(0.31, 12, 9), '#f5fbff', { pos: [0, 0.95, 0] }),
          part(new SphereGeometry(0.23, 12, 9), '#ffffff', { pos: [0, 1.38, 0] }),
          part(new ConeGeometry(0.05, 0.25, 6), '#ff8c1a', { pos: [0, 1.38, 0.3], rot: [Math.PI / 2, 0, 0] }),
          part(new SphereGeometry(0.035, 5, 4), '#111111', { pos: [-0.08, 1.46, 0.2] }),
          part(new SphereGeometry(0.035, 5, 4), '#111111', { pos: [0.08, 1.46, 0.2] }),
          part(new TorusGeometry(0.24, 0.06, 6, 16), '#e53935', { pos: [0, 1.18, 0], rot: [Math.PI / 2, 0, 0] }),
          part(new BoxGeometry(0.1, 0.3, 0.05), '#e53935', { pos: [0.15, 1.05, 0.2], rot: [0, 0, 0.2] }),
          part(new CylinderGeometry(0.2, 0.2, 0.04, 10), '#222222', { pos: [0, 1.58, 0] }),
          part(new CylinderGeometry(0.14, 0.14, 0.26, 10), '#222222', { pos: [0, 1.72, 0] }),
          part(new SphereGeometry(0.035, 5, 4), '#111111', { pos: [0, 1.0, 0.3] }),
          part(new SphereGeometry(0.035, 5, 4), '#111111', { pos: [0, 0.88, 0.3] }),
        ]),
      };
    case 'iceSpike':
      return {
        body: merge([
          part(new ConeGeometry(0.22, 1.6, 6), '#9fdcff', { pos: [0, 0.8, 0] }),
          part(new ConeGeometry(0.16, 1.1, 6), '#cdeeff', { pos: [0.28, 0.55, 0.1], rot: [0, 0, -0.25] }),
          part(new ConeGeometry(0.14, 0.9, 6), '#7cc8f5', { pos: [-0.25, 0.45, -0.08], rot: [0, 0, 0.3] }),
        ]),
      };
    case 'obsidian':
      return {
        body: merge([
          part(new ConeGeometry(0.28, 1.6, 5), '#1a1424', { pos: [0, 0.8, 0] }),
          part(new ConeGeometry(0.2, 1.1, 5), '#2c1f3d', { pos: [0.3, 0.55, 0.05], rot: [0, 0, -0.3] }),
          part(new ConeGeometry(0.18, 0.9, 5), '#241a33', { pos: [-0.26, 0.45, 0], rot: [0, 0, 0.32] }),
        ]),
        glow: merge([part(new BoxGeometry(0.04, 0.9, 0.04), '#ff5a1f', { pos: [0.02, 0.6, 0.2] })]),
      };
    case 'miniVolcano':
      return {
        body: merge([
          part(new CylinderGeometry(0.25, 0.8, 1.1, 10, 1, true), '#3a2a24', { pos: [0, 0.55, 0] }),
          part(new CylinderGeometry(0.8, 0.85, 0.08, 10), '#2a1d18', { pos: [0, 0.04, 0] }),
        ]),
        glow: merge([
          part(new CylinderGeometry(0.24, 0.24, 0.05, 10), '#ff7b00', { pos: [0, 1.06, 0] }),
          part(new BoxGeometry(0.08, 0.6, 0.03), '#ff5a1f', { pos: [0.3, 0.55, 0.35], rot: [0.35, 0, -0.5] }),
        ]),
      };
    case 'deadTree':
      return {
        body: merge([
          part(new CylinderGeometry(0.07, 0.13, 1.5, 6), '#2b211d', { pos: [0, 0.75, 0] }),
          part(new CylinderGeometry(0.03, 0.06, 0.7, 5), '#2b211d', { pos: [0.25, 1.25, 0], rot: [0, 0, -0.9] }),
          part(new CylinderGeometry(0.03, 0.05, 0.55, 5), '#2b211d', { pos: [-0.2, 1.05, 0.05], rot: [0, 0, 0.8] }),
          part(new CylinderGeometry(0.02, 0.04, 0.4, 5), '#2b211d', { pos: [0.05, 1.6, 0.1], rot: [0.4, 0, 0.2] }),
        ]),
      };
    case 'neonTower':
      return {
        body: merge([part(new BoxGeometry(0.75, 2.4, 0.75), '#130a2a', { pos: [0, 1.2, 0] }), part(new CylinderGeometry(0.02, 0.02, 0.5, 4), '#888888', { pos: [0, 2.65, 0] })]),
        glow: merge([
          ...[0.5, 0.95, 1.4, 1.85].map((y, k) => part(new BoxGeometry(0.78, 0.07, 0.78), k % 2 ? '#00f0ff' : '#ff2bd6', { pos: [0, y, 0] })),
          part(new SphereGeometry(0.06, 6, 4), '#ff3c50', { pos: [0, 2.92, 0] }),
        ]),
      };
    case 'neonPalm':
      return {
        body: merge([part(new CylinderGeometry(0.05, 0.07, 0.15, 6), '#130a2a', { pos: [0, 0.07, 0] })]),
        glow: merge([
          part(new CylinderGeometry(0.04, 0.05, 1.7, 6), '#ff2bd6', { pos: [0, 0.85, 0] }),
          ...leafRing(6, 0.32, 1.75, 0.8, '#00f0ff', 0.3),
        ]),
        sway: true,
      };
    case 'neonArch':
      return {
        body: merge([part(new BoxGeometry(0.2, 0.1, 0.2), '#130a2a', { pos: [-0.7, 0.05, 0] }), part(new BoxGeometry(0.2, 0.1, 0.2), '#130a2a', { pos: [0.7, 0.05, 0] })]),
        glow: merge([part(new TorusGeometry(0.7, 0.05, 8, 28, Math.PI), '#fff200'), part(new TorusGeometry(0.58, 0.03, 8, 28, Math.PI), '#ff2bd6')]),
      };
    case 'crystalSpire':
      return {
        body: merge([part(new DodecahedronGeometry(0.3, 0), '#2a2d4e', { pos: [0, 0.15, 0], scale: [1.4, 0.6, 1.4] })]),
        glow: merge([
          part(new OctahedronGeometry(0.28, 0), '#b388ff', { pos: [0, 1.0, 0], scale: [0.7, 3, 0.7] }),
          part(new OctahedronGeometry(0.18, 0), '#5ee6ff', { pos: [0.3, 0.6, 0.05], scale: [0.7, 2.6, 0.7], rot: [0, 0, -0.3] }),
          part(new OctahedronGeometry(0.15, 0), '#ff7aa8', { pos: [-0.26, 0.5, -0.05], scale: [0.7, 2.4, 0.7], rot: [0, 0, 0.35] }),
        ]),
      };
    case 'satellite':
      return {
        body: merge([
          part(new CylinderGeometry(0.04, 0.04, 0.9, 6), '#9e9e9e', { pos: [0, 0.45, 0] }),
          part(new BoxGeometry(0.4, 0.3, 0.3), '#cfd8dc', { pos: [0, 1.0, 0] }),
          part(new BoxGeometry(0.7, 0.02, 0.32), '#1e3a8a', { pos: [0.58, 1.0, 0] }),
          part(new BoxGeometry(0.7, 0.02, 0.32), '#1e3a8a', { pos: [-0.58, 1.0, 0] }),
          part(new SphereGeometry(0.25, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.5), '#eceff1', { pos: [0, 1.25, 0.1], rot: [-0.8, 0, 0] }),
        ]),
        glow: merge([part(new SphereGeometry(0.05, 6, 4), '#ff3c50', { pos: [0, 1.4, 0.15] })]),
      };
    case 'alienPlant':
      return {
        body: merge([
          part(new CylinderGeometry(0.04, 0.07, 1.1, 6), '#2e7d6b', { pos: [0, 0.55, 0], rot: [0, 0, 0.1] }),
          part(new CylinderGeometry(0.03, 0.05, 0.8, 6), '#2e7d6b', { pos: [0.2, 0.4, 0.05], rot: [0, 0, -0.4] }),
        ]),
        glow: merge([
          part(new SphereGeometry(0.18, 10, 8), '#7cffcb', { pos: [-0.05, 1.12, 0] }),
          part(new SphereGeometry(0.12, 8, 6), '#ff7aa8', { pos: [0.36, 0.78, 0.05] }),
        ]),
        sway: true,
      };
  }
}

// --------------------------------------------------------------- creatures

export interface CreatureModel {
  body: BufferGeometry;
  /** Wings flap around the forward (z) axis. */
  wingL?: BufferGeometry;
  wingR?: BufferGeometry;
  /** Unlit glowing parts. */
  glow?: BufferGeometry;
  /** Flight height range (cells). */
  height: [number, number];
  /** Speed in cells per second. */
  speed: number;
  /** Rolls along the ground (tumbleweed). */
  rolls?: boolean;
  /** Bobs up and down instead of flying level (jellyfish). */
  bob?: boolean;
  /** Wing beats per second. */
  flap: number;
}

export function buildCreatureModel(kind: CreatureKind): CreatureModel {
  switch (kind) {
    case 'butterfly':
      return {
        body: merge([part(new CylinderGeometry(0.025, 0.025, 0.22, 5), '#3a2a1a', { rot: [Math.PI / 2, 0, 0] })]),
        wingL: merge([
          part(new SphereGeometry(0.13, 8, 5), '#ff7aa8', { pos: [0.13, 0, 0.04], scale: [1, 0.12, 0.8] }),
          part(new SphereGeometry(0.09, 8, 5), '#ffd23f', { pos: [0.1, 0, -0.1], scale: [1, 0.12, 0.8] }),
        ]),
        wingR: merge([
          part(new SphereGeometry(0.13, 8, 5), '#ff7aa8', { pos: [-0.13, 0, 0.04], scale: [1, 0.12, 0.8] }),
          part(new SphereGeometry(0.09, 8, 5), '#ffd23f', { pos: [-0.1, 0, -0.1], scale: [1, 0.12, 0.8] }),
        ]),
        height: [0.9, 2.2],
        speed: 1.4,
        flap: 7,
      };
    case 'tumbleweed':
      return {
        body: merge([
          part(new IcosahedronGeometry(0.3, 1), '#b08a5a'),
          part(new TorusGeometry(0.26, 0.025, 4, 12), '#8a6a42', { rot: [0.5, 0.3, 0] }),
          part(new TorusGeometry(0.26, 0.025, 4, 12), '#8a6a42', { rot: [-0.4, 1.2, 0.3] }),
        ]),
        height: [0.3, 0.3],
        speed: 2.4,
        rolls: true,
        flap: 0,
      };
    case 'vulture':
    case 'bird':
    case 'bat': {
      const col = kind === 'bird' ? '#ffffff' : kind === 'bat' ? '#2b1d3a' : '#5d4037';
      const wing = kind === 'bat' ? '#3d2a52' : kind === 'bird' ? '#e3f2fd' : '#6d4c41';
      return {
        body: merge([
          part(new SphereGeometry(0.12, 8, 6), col, { scale: [0.8, 0.8, 1.6] }),
          part(new ConeGeometry(0.04, 0.12, 5), '#ffb300', { pos: [0, 0, 0.24], rot: [Math.PI / 2, 0, 0] }),
        ]),
        wingL: merge([part(new BoxGeometry(0.42, 0.02, 0.18), wing, { pos: [0.24, 0, 0] })]),
        wingR: merge([part(new BoxGeometry(0.42, 0.02, 0.18), wing, { pos: [-0.24, 0, 0] })]),
        height: kind === 'bat' ? [1.6, 3] : [3, 4.5],
        speed: kind === 'vulture' ? 2 : 2.8,
        flap: kind === 'vulture' ? 1.5 : 5,
      };
    }
    case 'fish': {
      return {
        body: merge([
          part(new SphereGeometry(0.16, 10, 7), '#ff8c1a', { scale: [0.6, 0.9, 1.5] }),
          part(new BoxGeometry(0.03, 0.18, 0.02), '#ffffff', { pos: [0, 0, 0.05] }),
          part(new ConeGeometry(0.12, 0.18, 4), '#ff6a00', { pos: [0, 0, -0.3], rot: [-Math.PI / 2, 0, 0], scale: [0.25, 1, 1] }),
          part(new SphereGeometry(0.025, 5, 4), '#111111', { pos: [0.07, 0.04, 0.16] }),
          part(new SphereGeometry(0.025, 5, 4), '#111111', { pos: [-0.07, 0.04, 0.16] }),
        ]),
        height: [1.2, 3],
        speed: 1.6,
        flap: 0,
      };
    }
    case 'jellyfish':
      return {
        body: merge([part(new SphereGeometry(0.28, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#ff9ad5')]),
        glow: merge(
          [-0.14, -0.05, 0.05, 0.14].map((x, k) => part(new CylinderGeometry(0.015, 0.008, 0.5, 4), k % 2 ? '#ffd1ec' : '#c77dff', { pos: [x, -0.25, (k % 2) * 0.08 - 0.04] })),
        ),
        height: [1.5, 3.5],
        speed: 0.5,
        bob: true,
        flap: 0,
      };
    case 'drone':
      return {
        body: merge([part(new BoxGeometry(0.5, 0.14, 0.8), '#1b0f33')]),
        glow: merge([
          part(new BoxGeometry(0.52, 0.03, 0.82), '#00f0ff', { pos: [0, -0.07, 0] }),
          part(new SphereGeometry(0.05, 6, 4), '#fff200', { pos: [0.16, 0, 0.42] }),
          part(new SphereGeometry(0.05, 6, 4), '#fff200', { pos: [-0.16, 0, 0.42] }),
          part(new SphereGeometry(0.05, 6, 4), '#ff2bd6', { pos: [0.16, 0, -0.42] }),
          part(new SphereGeometry(0.05, 6, 4), '#ff2bd6', { pos: [-0.16, 0, -0.42] }),
        ]),
        height: [2.2, 3.6],
        speed: 4,
        flap: 0,
      };
    case 'ufo':
      return {
        body: merge([
          part(new SphereGeometry(0.6, 16, 6), '#b0bec5', { scale: [1, 0.25, 1] }),
          part(new SphereGeometry(0.28, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), '#80deea', { pos: [0, 0.08, 0] }),
        ]),
        glow: merge(
          Array.from({ length: 8 }, (_, k) =>
            part(new SphereGeometry(0.05, 5, 4), k % 2 ? '#ffd23f' : '#7cffcb', { pos: [Math.cos((k / 8) * Math.PI * 2) * 0.5, -0.04, Math.sin((k / 8) * Math.PI * 2) * 0.5] }),
          ),
        ),
        height: [3, 4.5],
        speed: 2,
        flap: 0,
      };
  }
}
