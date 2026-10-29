// Renders the pooled 3D particles as round soft points (one normal and one
// additive draw call). Per-particle size, color and fade come from attributes.
import { AdditiveBlending, BufferAttribute, BufferGeometry, DynamicDrawUsage, Group, NormalBlending, Points, ShaderMaterial } from 'three';
import type { Particles } from '../fx/particles';

const vertex = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying float vAlpha;
  varying vec3 vColor;
  uniform float uScale;
  void main() {
    vAlpha = aAlpha;
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = max(1.0, aSize * uScale / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;

const fragment = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  uniform float uSoft;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    if (d > 1.0) discard;
    float edge = mix(1.0 - smoothstep(0.75, 1.0, d), 1.0 - d, uSoft);
    // Simple shading so solid pieces look round.
    float light = mix(1.0, 1.0 - 0.35 * (c.x + c.y), 1.0 - uSoft);
    gl_FragColor = vec4(vColor * light, vAlpha * edge);
  }
`;

class Layer {
  readonly points: Points;
  readonly geo = new BufferGeometry();
  readonly pos: Float32Array;
  readonly col: Float32Array;
  readonly size: Float32Array;
  readonly alpha: Float32Array;
  readonly mat: ShaderMaterial;

  constructor(cap: number, additive: boolean) {
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.size = new Float32Array(cap);
    this.alpha = new Float32Array(cap);
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(DynamicDrawUsage));
    this.geo.setAttribute('aColor', new BufferAttribute(this.col, 3).setUsage(DynamicDrawUsage));
    this.geo.setAttribute('aSize', new BufferAttribute(this.size, 1).setUsage(DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new BufferAttribute(this.alpha, 1).setUsage(DynamicDrawUsage));
    this.mat = new ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: { uScale: { value: 600 }, uSoft: { value: additive ? 1 : 0 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? AdditiveBlending : NormalBlending,
    });
    this.points = new Points(this.geo, this.mat);
    this.points.frustumCulled = false;
  }

  commit(n: number): void {
    this.geo.setDrawRange(0, n);
    for (const name of ['position', 'aColor', 'aSize', 'aAlpha']) {
      const a = this.geo.getAttribute(name) as BufferAttribute;
      a.needsUpdate = true;
    }
  }
}

export class Particles3D {
  readonly group = new Group();
  private readonly solid: Layer;
  private readonly glow: Layer;

  constructor(capacity: number) {
    this.solid = new Layer(capacity, false);
    this.glow = new Layer(capacity, true);
    this.group.add(this.solid.points, this.glow.points);
  }

  /** `pixelScale` converts world size to pixels at distance 1 (viewport height / (2 tan(fov/2))). */
  update(p: Particles, pixelScale: number): void {
    let ns = 0;
    let ng = 0;
    for (let i = 0; i < p.count; i++) {
      const L = p.glow[i] ? this.glow : this.solid;
      const k = p.glow[i] ? ng++ : ns++;
      L.pos[k * 3] = p.x[i];
      L.pos[k * 3 + 1] = p.y[i];
      L.pos[k * 3 + 2] = p.z[i];
      L.col[k * 3] = p.r[i];
      L.col[k * 3 + 1] = p.g[i];
      L.col[k * 3 + 2] = p.b[i];
      L.size[k] = p.size[i];
      const t = p.life[i] / p.maxLife[i];
      L.alpha[k] = t < 0.3 ? t / 0.3 : 1;
    }
    this.solid.mat.uniforms.uScale.value = pixelScale;
    this.glow.mat.uniforms.uScale.value = pixelScale;
    this.solid.commit(ns);
    this.glow.commit(ng);
  }
}
