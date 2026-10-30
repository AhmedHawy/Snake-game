// Three.js renderer: tilted camera that follows the snake over an endless
// world, zone lighting/fog with crossfades, and all 3D layers.
import {
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { EFFECT_COLORS, isBasic, type FoodType } from '../config/food';
import { SKINS, type SkinConfig } from '../config/skins';
import type { ZoneConfig } from '../config/zones';
import { TIMED_EFFECTS, type Game } from '../core/state';
import type { Fx } from '../fx/effects';
import { Items3D } from './items';
import { Overlay, type RivalTag, type ScreenPoint } from './overlay';
import { Particles3D } from './particles';
import { Snake3D } from './snake';
import { Hazards3D } from './hazards';
import type { Rival } from '../core/state';
import { SceneryLayer } from './scenery';
import { Ambient3D, DecorLayer, Ground, Movers3D, ObstacleLayer } from './world';

export interface RenderView {
  game: Game;
  /** Real time (animations keep running in slow motion). */
  timeMs: number;
  /** Real frame time. */
  dtMs: number;
  skin: SkinConfig;
  fx: Fx;
  /** Zone crossfade in progress: previous zone index and progress 0..1. */
  zoneFade: { from: number; t: number } | null;
  /** Show the apple arrow (in game, not paused). */
  showArrow: boolean;
}

interface ZoneLayers {
  index: number;
  zone: ZoneConfig;
  ground: Ground;
  obstacles: ObstacleLayer;
  decor: DecorLayer;
  scenery: SceneryLayer;
  ambient: Ambient3D;
}

const FOV = 40;
const FOOD_EMOJI: Partial<Record<FoodType, string>> = { apple: '🍎', egg: '🥚', ladybug: '🐞', mouse: '🐭' };
/** Camera elevation above the ground plane (degrees). */
const TILT = 52;

export function webglSupported(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

const tmpA = new Color();
const tmpB = new Color();
const v3 = new Vector3();
const v2 = new Vector2();

export class Renderer3D {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(FOV, 1, 0.5, 200);
  private readonly hemi = new HemisphereLight('#ffffff', '#444444', 1.5);
  private readonly sun = new DirectionalLight('#ffffff', 2);
  private readonly fog = new Fog('#000000', 20, 60);
  private readonly snake = new Snake3D();
  private readonly rivalViews = new Map<number, Snake3D>();
  private readonly items = new Items3D();
  private readonly movers = new Movers3D();
  private readonly hazards = new Hazards3D();
  private readonly particles = new Particles3D(3000);
  private readonly overlay: Overlay;
  private cur: ZoneLayers | null = null;
  private old: ZoneLayers | null = null;
  private obstaclesVersion = -1;
  private readonly target = new Vector3();
  private snapCamera = true;
  private shortCells = 11;
  private rect = { x: 0, y: 0, w: 1, h: 1 };
  private distance = 20;

  constructor(canvas: HTMLCanvasElement, overlayRoot: HTMLElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.scene.fog = this.fog;
    this.scene.background = new Color('#000');
    this.sun.position.set(-5, 12, 7);
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.scene.add(this.snake.group, this.items.group, this.movers.group, this.hazards.group, this.particles.group);
    this.overlay = new Overlay(overlayRoot);
  }

  /** Canvas placement (CSS px, page coordinates) and pixel ratio. */
  resize(rect: { x: number; y: number; w: number; h: number }, dpr: number): void {
    this.rect = rect;
    const canvas = this.renderer.domElement;
    Object.assign(canvas.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` });
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(rect.w, rect.h, false);
    this.camera.aspect = rect.w / Math.max(1, rect.h);
    this.camera.updateProjectionMatrix();
    this.updateDistance();
  }

  /** How many cells fit across the short side of the view. */
  setZoom(shortCells: number): void {
    this.shortCells = shortCells;
    this.updateDistance();
  }

  private updateDistance(): void {
    const vf = (FOV * Math.PI) / 180;
    const tilt = (TILT * Math.PI) / 180;
    const aspect = this.camera.aspect;
    if (aspect < 1) {
      const hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
      this.distance = this.shortCells / (2 * Math.tan(hf / 2));
    } else {
      this.distance = (this.shortCells * Math.sin(tilt)) / (2 * Math.tan(vf / 2));
    }
    this.fog.near = this.distance * 1.15;
    this.fog.far = this.distance * 2.6;
  }

  /** New run: snap the camera and rebuild zone layers. */
  reset(): void {
    this.snapCamera = true;
    this.obstaclesVersion = -1;
    this.dropOld();
    if (this.cur) this.disposeLayers(this.cur);
    this.cur = null;
    this.items.clear();
    for (const v of this.rivalViews.values()) this.scene.remove(v.group);
    this.rivalViews.clear();
  }

  private makeLayers(game: Game, index: number): ZoneLayers {
    const zone = game.zones[index];
    const l: ZoneLayers = {
      index,
      zone,
      ground: new Ground(zone, this.old ? 1 : 0),
      obstacles: new ObstacleLayer(zone),
      decor: new DecorLayer(zone, index),
      scenery: new SceneryLayer(zone, index),
      ambient: new Ambient3D(zone),
    };
    this.scene.add(l.ground.mesh, l.obstacles.group, l.decor.group, l.scenery.group, l.ambient.points);
    return l;
  }

  private disposeLayers(l: ZoneLayers): void {
    this.scene.remove(l.ground.mesh, l.obstacles.group, l.decor.group, l.scenery.group, l.ambient.points);
    l.ground.dispose();
    l.obstacles.dispose();
    l.decor.dispose();
    l.scenery.dispose();
    l.ambient.dispose();
  }

  private dropOld(): void {
    if (this.old) this.disposeLayers(this.old);
    this.old = null;
  }

  draw(view: RenderView): void {
    const { game, fx } = view;
    const alpha = game.alpha;

    // Zone layers (with crossfade on zone change).
    if (!this.cur || this.cur.index !== game.zoneIndex) {
      if (this.cur && view.zoneFade) {
        this.dropOld();
        this.old = this.cur;
        this.old.obstacles.setCells(game.oldObstacles);
        this.old.ground.mesh.renderOrder = -10;
      } else if (this.cur) {
        this.disposeLayers(this.cur);
      }
      this.cur = this.makeLayers(game, game.zoneIndex);
      this.obstaclesVersion = -1;
    }
    if (!view.zoneFade && this.old) {
      this.dropOld();
      this.cur.ground.mesh.position.y = 0;
    }
    const cur = this.cur;
    const ft = view.zoneFade && this.old ? view.zoneFade.t : 1;

    if (game.world.version !== this.obstaclesVersion) {
      this.obstaclesVersion = game.world.version;
      cur.obstacles.setCells(game.world.cells());
    }
    if (this.old) cur.obstacles.layout(easeOut(Math.min(1, ft * 1.4)));

    // Snake + camera follow.
    const showSnake = game.status !== 'dying' && game.status !== 'over';
    const glowEffect = TIMED_EFFECTS.find((e) => game.effects[e] > 0);
    this.snake.update(game, {
      alpha,
      timeMs: view.timeMs,
      skin: view.skin,
      headScale: fx.headScale,
      bulges: fx.bulges(game, alpha),
      // Ghost power-up or hidden by the shadow breath.
      ghost: game.effects.ghost > 0 || game.invisibleMs > 0,
      glow: glowEffect ? EFFECT_COLORS[glowEffect] : null,
      visible: showSnake,
    });
    const hx = this.snake.xs[0];
    const hz = this.snake.zs[0];
    const tags = this.drawRivals(game, view, hx, hz);
    const desiredX = hx + this.snake.faceX * 1.2;
    const desiredZ = hz + this.snake.faceZ * 1.2;
    if (this.snapCamera) {
      this.target.set(desiredX, 0, desiredZ);
      this.snapCamera = false;
    } else if (game.status !== 'dying' && game.status !== 'over') {
      const k = 1 - Math.exp((-view.dtMs / 1000) * 5);
      this.target.x += (desiredX - this.target.x) * k;
      this.target.z += (desiredZ - this.target.z) * k;
    }
    const tilt = (TILT * Math.PI) / 180;
    const d = this.distance;
    this.camera.position.set(
      this.target.x + fx.shakeX,
      d * Math.sin(tilt) + fx.shakeY,
      this.target.z + d * Math.cos(tilt) + fx.shakeZ,
    );
    this.camera.lookAt(this.target.x + fx.shakeX * 0.5, 0, this.target.z + fx.shakeZ * 0.5);
    this.sun.position.set(this.target.x - 5, 12, this.target.z + 7);
    this.sun.target.position.set(this.target.x, 0, this.target.z);

    // Zone colors, lights and layer opacities.
    const to = cur.zone;
    const from = this.old?.zone ?? to;
    lerpColor(this.scene.background as Color, from.palette.backdrop, to.palette.backdrop, ft);
    this.fog.color.copy(this.scene.background as Color);
    lerpColor(this.hemi.color, from.light.sky, to.light.sky, ft);
    lerpColor(this.hemi.groundColor, from.light.ground, to.light.ground, ft);
    this.hemi.intensity = from.light.hemi + (to.light.hemi - from.light.hemi) * ft;
    this.sun.intensity = from.light.sun + (to.light.sun - from.light.sun) * ft;

    cur.obstacles.setCenter(this.target.x, this.target.z);
    this.old?.obstacles.setCenter(this.target.x, this.target.z);
    cur.ground.follow(this.target.x, this.target.z);
    cur.ground.setOpacity(this.old ? ft : 1);
    cur.decor.update(this.target.x, this.target.z, (x, y) => game.isBlocked(x, y));
    cur.decor.setOpacity(this.old ? ft : 1);
    cur.scenery.update(view.dtMs, this.target.x, this.target.z, game, hx, hz);
    cur.scenery.setOpacity(this.old ? ft : 1);
    cur.ambient.update(view.dtMs, this.target.x, this.target.z, this.old ? ft : 1);
    if (this.old) {
      this.old.ground.follow(this.target.x, this.target.z);
      this.old.obstacles.setOpacity(1 - ft);
      this.old.decor.setOpacity(1 - ft);
      this.old.scenery.update(view.dtMs, this.target.x, this.target.z, game, hx, hz);
      this.old.scenery.setOpacity(1 - ft);
      this.old.ambient.update(view.dtMs, this.target.x, this.target.z, 1 - ft);
    }

    this.items.update(game, alpha, view.timeMs, hx, hz, showSnake, cur.zone.light.hemi < 1.2);
    this.movers.update(cur.zone, game.movers, alpha, view.timeMs);
    this.hazards.update(game, view.timeMs);
    const pixelScale = this.renderer.getDrawingBufferSize(v2).y / (2 * Math.tan((FOV * Math.PI) / 360));
    this.particles.update(fx.particles, pixelScale);

    this.renderer.render(this.scene, this.camera);

    // DOM overlay: popups, flash, apple arrow.
    const apple = view.showArrow ? game.foods.find((f) => isBasic(f.type)) : undefined;
    this.overlay.update(
      fx.popups,
      (x, y, z) => this.project(x, y, z),
      fx.flash,
      apple ? this.project(apple.pos.x, 0.4, apple.pos.y) : null,
      this.rect,
      apple ? FOOD_EMOJI[apple.type] ?? '🍎' : '🍎',
    );
    this.overlay.tags(tags);
  }

  /** Rival snakes (one Snake3D each) and their length labels. */
  private drawRivals(game: Game, view: RenderView, hx: number, hz: number): RivalTag[] {
    const tags: RivalTag[] = [];
    const lethal = game.mode.rivals === 'lethal';
    const playing = game.status === 'playing' || game.status === 'ready';
    const step = game.rivalStepMs;
    const seen = new Set<number>();
    for (const r of game.rivals) {
      if (!r.alive) continue;
      seen.add(r.id);
      let v = this.rivalViews.get(r.id);
      if (!v) {
        v = new Snake3D();
        this.rivalViews.set(r.id, v);
        this.scene.add(v.group);
      }
      v.update(r, {
        alpha: game.status === 'playing' ? Math.min(1, r.moveTimer / step) : 1,
        timeMs: view.timeMs + r.id * 777,
        skin: SKINS[r.skin],
        headScale: 1,
        bulges: [],
        ghost: !lethal,
        glow: rivalGlow(r, view.timeMs),
        visible: true,
      });
      if (r.burnMs > 0 && Math.random() < view.dtMs / 45) {
        // Flames licking off a burning rival.
        const i = Math.floor(Math.random() * v.count);
        view.fx.particles.emit(v.xs[i], 0.6, v.zs[i], (Math.random() - 0.5) * 0.8, 2 + Math.random() * 1.5, (Math.random() - 0.5) * 0.8, 450, 0.24, Math.random() < 0.5 ? '#ff6a00' : '#ffd23f', { glow: true });
      }
      // Only label rivals near the view (labels far off screen are noise).
      const x = v.xs[0];
      const z = v.zs[0];
      if (playing && Math.abs(x - hx) + Math.abs(z - hz) < 30) {
        const kind = !lethal ? 'calm' : r.snake.length <= game.snake.length || r.frozenMs > 0 ? 'prey' : 'threat';
        const icon = r.frozenMs > 0 ? '❄️ ' : r.burnMs > 0 ? '🔥 ' : kind === 'threat' ? '⚠ ' : '';
        tags.push({ at: this.project(x, 1.15, z), text: `${icon}${r.snake.length}`, kind });
      }
    }
    for (const [id, v] of this.rivalViews) {
      if (!seen.has(id)) {
        this.scene.remove(v.group);
        this.rivalViews.delete(id);
      }
    }
    return tags;
  }

  /** World -> page coordinates (CSS px). */
  project(x: number, y: number, z: number): ScreenPoint {
    v3.set(x, y, z).project(this.camera);
    return {
      x: this.rect.x + ((v3.x + 1) / 2) * this.rect.w,
      y: this.rect.y + ((1 - v3.y) / 2) * this.rect.h,
      visible: v3.z > -1 && v3.z < 1,
    };
  }

  /** Interpolated head position (world x, z). */
  get head(): { x: number; z: number } {
    return { x: this.snake.xs[0], z: this.snake.zs[0] };
  }

  /** Segment centers for the crash effect. */
  segmentPoints(game: Game): { x: number; z: number }[] {
    const n = this.snake.computePoints(game, 1);
    return Array.from({ length: n }, (_, i) => ({ x: this.snake.xs[i], z: this.snake.zs[i] }));
  }
}

function lerpColor(out: Color, a: string, b: string, t: number): void {
  tmpA.set(a);
  tmpB.set(b);
  out.copy(tmpA).lerp(tmpB, t);
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/** Glow color showing a rival's breath status (frozen, burning, poisoned...). */
function rivalGlow(r: Rival, timeMs: number): string | null {
  if (r.frozenMs > 0) return '#9fdcff';
  if (r.burnMs > 0) return '#ff6a00';
  if (r.poisonMs > 0) return '#7dff3b';
  if (r.stunMs > 0) return '#ffe066';
  if (r.confuseMs > 0) return `hsl(${Math.floor(timeMs / 4) % 360},90%,60%)`;
  if (r.fearMs > 0) return '#ffffff';
  return null;
}
