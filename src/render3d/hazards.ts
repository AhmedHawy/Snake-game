// Ground left behind by breaths: glowing lava patches and crystal spikes.
// Both hurt rivals that cross them; the player is never hurt by them.
import {
  AdditiveBlending,
  Color,
  ConeGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
} from 'three';
import type { Game } from '../core/state';
import { glowTexture } from './items';

const MAX = 256;
const m4 = new Matrix4();
const LAVA = new Color('#ff5a1f');
const SPIKE_GLOW = new Color('#9ff3ff');

export class Hazards3D {
  readonly group = new Group();
  private readonly glows: InstancedMesh;
  private readonly spikes: InstancedMesh;

  constructor() {
    this.glows = new InstancedMesh(
      new PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: AdditiveBlending }),
      MAX,
    );
    this.glows.instanceMatrix.setUsage(DynamicDrawUsage);
    this.glows.setColorAt(0, LAVA);
    this.glows.frustumCulled = false;
    this.spikes = new InstancedMesh(
      new ConeGeometry(0.13, 0.5, 5).translate(0, 0.25, 0),
      new MeshStandardMaterial({ color: '#c9f6ff', emissive: new Color('#5ee6ff'), emissiveIntensity: 0.6, roughness: 0.15, metalness: 0.3 }),
      MAX * 3,
    );
    this.spikes.instanceMatrix.setUsage(DynamicDrawUsage);
    this.spikes.frustumCulled = false;
    this.group.add(this.glows, this.spikes);
  }

  update(game: Game, timeMs: number): void {
    let g = 0;
    let s = 0;
    for (const h of game.hazards.values()) {
      if (g >= MAX) break;
      const left = h.untilMs - game.timeMs;
      const fade = Math.min(1, left / 600);
      if (h.kind === 'lava') {
        const pulse = 0.85 + 0.25 * Math.sin(timeMs / 120 + h.x * 3 + h.y);
        m4.makeScale(pulse * fade, 1, pulse * fade);
        m4.setPosition(h.x, 0.02, h.y);
        this.glows.setMatrixAt(g, m4);
        this.glows.setColorAt(g++, LAVA);
      } else {
        m4.makeScale(0.8 * fade, 1, 0.8 * fade);
        m4.setPosition(h.x, 0.02, h.y);
        this.glows.setMatrixAt(g, m4);
        this.glows.setColorAt(g++, SPIKE_GLOW);
        // Three little crystal spikes per cell.
        for (let k = 0; k < 3; k++) {
          const a = k * 2.1 + h.x;
          m4.makeScale(fade, fade * (0.8 + 0.3 * k), fade);
          m4.setPosition(h.x + Math.cos(a) * 0.22, 0, h.y + Math.sin(a) * 0.22);
          this.spikes.setMatrixAt(s++, m4);
        }
      }
    }
    this.glows.count = g;
    this.spikes.count = s;
    this.glows.instanceMatrix.needsUpdate = true;
    if (this.glows.instanceColor) this.glows.instanceColor.needsUpdate = true;
    this.spikes.instanceMatrix.needsUpdate = true;
  }
}
