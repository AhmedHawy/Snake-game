// Core game simulation. Pure logic: no DOM, no rendering. The app drains
// `events` every frame to drive effects, audio and haptics.
//
// The world is unbounded (no walls): obstacles are generated in chunks around
// the snake, and food, portals and moving obstacles are kept near it.
import type { DifficultyConfig } from '../config/difficulty';
import {
  FOODS,
  MAGNET_RADIUS,
  MAX_COMBO,
  MIN_LENGTH,
  SLOW_MO_FACTOR,
  SPECIAL_TYPES,
  SPEED_BOOST_FACTOR,
  SPEED_POINTS_MULT,
  type FoodType,
  type TimedEffect,
} from '../config/food';
import { MODES, PORTAL_COLORS, type ModeConfig } from '../config/modes';
import { FOODS_PER_ZONE, ZONES, type ZoneConfig } from '../config/zones';
import { Rng } from './rng';
import { CHUNK, ObstacleWorld, cellKey, randomCellNear } from './spawn';
import { DIRS, chebyshev, isOpposite, manhattan, type Dir, type Vec } from './types';

export interface FoodItem {
  id: number;
  type: FoodType;
  pos: Vec;
  /** Position before the last step (magnet drift interpolation). */
  prev: Vec;
  bornMs: number;
  /** Game time when it disappears (Infinity = never). */
  expiresMs: number;
}

export interface Mover {
  id: number;
  pos: Vec;
  prev: Vec;
  dir: Dir;
}

export interface Portal {
  a: Vec;
  b: Vec;
  color: string;
}

export type GameStatus = 'ready' | 'playing' | 'dying' | 'over';

export type GameEvent =
  | { type: 'start' }
  | { type: 'eat'; food: FoodItem; points: number; multiplier: number }
  | { type: 'combo'; multiplier: number }
  | { type: 'effect'; effect: TimedEffect }
  | { type: 'shrink'; removed: Vec[]; poison: boolean }
  | { type: 'zone'; zoneIndex: number; loop: number }
  | { type: 'crash'; at: Vec }
  | { type: 'timeUp' }
  | { type: 'portal'; from: Vec; to: Vec }
  | { type: 'expire'; food: FoodItem }
  | { type: 'spawn'; food: FoodItem };

export interface GameOptions {
  mode: ModeConfig;
  difficulty: DifficultyConfig;
  seed?: number;
  zones?: ZoneConfig[];
  startLength?: number;
  /** Roughly half the number of cells visible on screen (spawn distances scale with it). */
  viewRadius?: number;
}

export const TIMED_EFFECTS: TimedEffect[] = ['speed', 'slow', 'ghost', 'magnet'];
/** Hard floor on the step time so the game stays playable with every bonus stacked. */
const ABSOLUTE_MIN_STEP_MS = 28;
/** Moving obstacles advance once every N snake steps. */
export const MOVER_EVERY = 2;
const MAX_QUEUE = 3;
/** Radius around the head (Chebyshev) where obstacles never appear. */
export const HEAD_SAFE_RADIUS = 4;
/** Cells straight ahead of the head that obstacles never appear on. */
export const HEAD_SAFE_AHEAD = 8;
/** Chunks generated around the head in every direction. */
export const CHUNK_RADIUS = 3;

export class Game {
  readonly mode: ModeConfig;
  readonly diff: DifficultyConfig;
  readonly zones: ZoneConfig[];
  readonly rng: Rng;
  readonly viewRadius: number;
  readonly world: ObstacleWorld;

  snake: Vec[] = [];
  /** Snake cells before the last step, index-aligned with `snake`. */
  prevSnake: Vec[] = [];
  dir: Dir = 0;
  /** Direction used for the previous step (for rendering the head turn). */
  prevDir: Dir = 0;
  queue: Dir[] = [];
  pendingGrow = 0;
  /** The head went through a portal on the last step. */
  teleported = false;

  /** Obstacles of the previous zone, kept for the crossfade. */
  oldObstacles: Vec[] = [];
  movers: Mover[] = [];
  foods: FoodItem[] = [];
  portals: Portal[] = [];

  status: GameStatus = 'ready';
  score = 0;
  foodsEaten = 0;
  zoneIndex = 0;
  loop = 0;
  comboMult = 1;
  longestCombo = 1;
  comboStepsLeft = 0;
  comboWindow = 1;
  effects: Record<TimedEffect, number> = { speed: 0, slow: 0, ghost: 0, magnet: 0 };
  effectTotals: Record<TimedEffect, number> = { speed: 1, slow: 1, ghost: 1, magnet: 1 };
  timeMs = 0;
  timeLeftMs: number;
  stepCount = 0;
  moveTimer = 0;
  crashAt: Vec | null = null;
  events: GameEvent[] = [];
  private nextId = 1;
  private snakeCells = new Map<number, number>();

  constructor(opts: GameOptions) {
    this.mode = opts.mode;
    this.diff = opts.difficulty;
    this.zones = opts.zones ?? ZONES;
    this.rng = new Rng(opts.seed);
    this.viewRadius = Math.max(5, Math.round(opts.viewRadius ?? 8));
    this.timeLeftMs = this.mode.timeLimitMs;
    this.world = new ObstacleWorld(this.rng, this.zone.obstacleShapes, this.mode.obstacles ? this.diff.obstaclesPerChunk : 0);

    const len = opts.startLength ?? 4;
    for (let i = 0; i < len; i++) this.snake.push({ x: 0, y: i });
    this.prevSnake = this.snake.map((p) => ({ ...p }));
    this.indexSnake();

    this.placePortals();
    this.refreshWorld();
    this.ensureApple();
    this.events.length = 0;
  }

  get zone(): ZoneConfig {
    return this.zones[this.zoneIndex];
  }

  get head(): Vec {
    return this.snake[0];
  }

  /** Milliseconds per cell right now. */
  get stepMs(): number {
    const base = Math.max(this.diff.minStepMs, this.diff.baseStepMs - this.diff.rampMsPerFood * this.foodsEaten);
    let ms = base * Math.pow(this.diff.loopSpeedFactor, this.loop);
    if (this.effects.speed > 0) ms *= SPEED_BOOST_FACTOR;
    if (this.effects.slow > 0) ms *= SLOW_MO_FACTOR;
    return Math.max(ABSOLUTE_MIN_STEP_MS, ms);
  }

  /** 0..1 progress toward the next step (render interpolation). */
  get alpha(): number {
    if (this.status !== 'playing') return this.status === 'ready' ? 0 : 1;
    return Math.min(1, this.moveTimer / this.stepMs);
  }

  get anyEffectActive(): boolean {
    return TIMED_EFFECTS.some((e) => this.effects[e] > 0);
  }

  isBlocked(x: number, y: number): boolean {
    return this.world.has(x, y);
  }

  /** Queue a turn. Same-direction and 180° turns (relative to the last queued move) are ignored. */
  steer(d: Dir): boolean {
    if (this.status === 'dying' || this.status === 'over') return false;
    const last = this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
    if (this.status === 'ready') {
      if (isOpposite(d, this.dir)) return false;
      if (d !== this.dir) this.queue.push(d);
      this.begin();
      return true;
    }
    if (d === last || isOpposite(d, last)) return false;
    if (this.queue.length >= MAX_QUEUE) return false;
    this.queue.push(d);
    return true;
  }

  /** Start moving in the current direction (tap to start). */
  begin(): void {
    if (this.status !== 'ready') return;
    this.status = 'playing';
    this.events.push({ type: 'start' });
  }

  update(dt: number): void {
    if (this.status !== 'playing') return;
    this.timeMs += dt;

    for (const e of TIMED_EFFECTS) if (this.effects[e] > 0) this.effects[e] = Math.max(0, this.effects[e] - dt);

    for (let i = this.foods.length - 1; i >= 0; i--) {
      const f = this.foods[i];
      if (f.expiresMs <= this.timeMs) {
        this.foods.splice(i, 1);
        this.events.push({ type: 'expire', food: f });
      }
    }

    if (this.mode.timeLimitMs > 0) {
      this.timeLeftMs -= dt;
      if (this.timeLeftMs <= 0) {
        this.timeLeftMs = 0;
        this.status = 'over';
        this.events.push({ type: 'timeUp' });
        return;
      }
    }

    this.moveTimer += dt;
    const step = this.stepMs;
    if (this.moveTimer >= step) {
      this.moveTimer -= step;
      if (this.moveTimer > step) this.moveTimer = 0;
      this.step();
    }
  }

  /** Called by the app once the crash animation finishes. */
  finishDying(): void {
    if (this.status === 'dying') this.status = 'over';
  }

  // ---------------------------------------------------------------- stepping

  private step(): void {
    this.stepCount++;
    this.prevDir = this.dir;
    const next = this.queue.shift();
    if (next !== undefined) this.dir = next;

    const head = this.head;
    const d = DIRS[this.dir];
    let nx = head.x + d.x;
    let ny = head.y + d.y;

    let teleported = false;
    const exit = this.portalExit(nx, ny);
    if (exit) {
      this.events.push({ type: 'portal', from: { x: nx, y: ny }, to: { ...exit } });
      nx = exit.x;
      ny = exit.y;
      teleported = true;
    }

    if (this.isBlocked(nx, ny) || this.moverAt(nx, ny)) return this.crash({ x: nx, y: ny });

    if (this.effects.ghost <= 0 && !this.mode.noDeath) {
      // The tail cell frees up this step unless the snake is growing.
      const tail = this.snake[this.snake.length - 1];
      const hit = this.snakeCells.get(cellKey(nx, ny)) ?? 0;
      const tailFrees = this.pendingGrow === 0 && tail.x === nx && tail.y === ny && hit === 1;
      if (hit > 0 && !tailFrees) return this.crash({ x: nx, y: ny });
    }

    this.prevSnake = this.snake.map((p) => ({ x: p.x, y: p.y }));
    this.snake.unshift({ x: nx, y: ny });
    this.addCell(nx, ny);
    if (this.pendingGrow > 0) this.pendingGrow--;
    else {
      const t = this.snake.pop()!;
      this.removeCell(t.x, t.y);
    }
    this.teleported = teleported;

    for (const f of this.foods) {
      f.prev.x = f.pos.x;
      f.prev.y = f.pos.y;
    }

    const food = this.foodAt(nx, ny);
    if (food) this.eat(food);
    else if (this.comboStepsLeft > 0) {
      this.comboStepsLeft--;
      if (this.comboStepsLeft === 0) this.comboMult = 1;
    }

    if (this.effects.magnet > 0) this.pullFood();
    this.stepMovers();
    if (this.stepCount % 4 === 0) this.refreshWorld();
    this.keepNearby();
    this.ensureApple();
  }

  private crash(at: Vec): void {
    this.status = 'dying';
    this.crashAt = { ...at };
    this.queue.length = 0;
    this.events.push({ type: 'crash', at: { ...at } });
  }

  private eat(food: FoodItem): void {
    const cfg = FOODS[food.type];
    this.foods.splice(this.foods.indexOf(food), 1);

    if (cfg.harmful) {
      this.comboMult = 1;
      this.comboStepsLeft = 0;
    } else if (this.comboStepsLeft > 0) {
      this.comboMult = Math.min(MAX_COMBO, this.comboMult + 1);
      this.longestCombo = Math.max(this.longestCombo, this.comboMult);
      this.events.push({ type: 'combo', multiplier: this.comboMult });
    } else {
      this.comboMult = 1;
    }

    const mult = cfg.harmful ? 1 : this.comboMult * (this.effects.speed > 0 ? SPEED_POINTS_MULT : 1);
    const points = cfg.points * mult;
    this.score = Math.max(0, this.score + points);

    if (cfg.grow > 0) this.pendingGrow += cfg.grow;
    else if (cfg.grow < 0) this.shrink(-cfg.grow, cfg.harmful);

    if (cfg.effect) {
      const ms = cfg.effectMs * this.diff.powerUpDurationFactor;
      if (cfg.effect === 'speed') this.effects.slow = 0;
      if (cfg.effect === 'slow') this.effects.speed = 0;
      this.effects[cfg.effect] = ms;
      this.effectTotals[cfg.effect] = ms;
      this.events.push({ type: 'effect', effect: cfg.effect });
    }

    this.events.push({ type: 'eat', food, points, multiplier: mult });

    if (cfg.countsAsFood) {
      this.foodsEaten++;
      if (this.mode.zones && this.foodsEaten % FOODS_PER_ZONE === 0) this.advanceZone();
    }

    if (food.type === 'apple') {
      this.ensureApple();
      this.maybeSpawnSpecials();
    }

    if (!cfg.harmful) {
      // Combo window: distance to the nearest apple plus some slack.
      const apple = this.foods.find((f) => f.type === 'apple');
      const dist = apple ? manhattan(this.head, apple.pos) : 0;
      const slack = Math.round(this.viewRadius * 5 * this.diff.comboSlackFactor);
      this.comboWindow = Math.max(4, dist + slack);
      this.comboStepsLeft = this.comboWindow;
    }
  }

  private shrink(count: number, poison: boolean): void {
    const removable = Math.max(0, this.snake.length - MIN_LENGTH);
    const n = Math.min(count, removable);
    this.pendingGrow = 0;
    const removed = n > 0 ? this.snake.splice(this.snake.length - n, n) : [];
    for (const r of removed) this.removeCell(r.x, r.y);
    this.prevSnake.length = Math.min(this.prevSnake.length, this.snake.length);
    this.events.push({ type: 'shrink', removed, poison });
  }

  private advanceZone(): void {
    this.zoneIndex++;
    if (this.zoneIndex >= this.zones.length) {
      this.zoneIndex = 0;
      this.loop++;
    }
    this.oldObstacles = this.world.cells().map((c) => ({ x: c.x, y: c.y }));
    this.world.clear();
    this.world.setShapes(this.zone.obstacleShapes);
    this.movers = [];
    this.refreshWorld();
    this.events.push({ type: 'zone', zoneIndex: this.zoneIndex, loop: this.loop });
  }

  // ------------------------------------------------------------ world upkeep

  /** Cells where new obstacles may not appear: around the snake, the head, the path ahead, portals and food. */
  private forbidden = (x: number, y: number): boolean => {
    const head = this.head;
    if (Math.abs(x - head.x) <= HEAD_SAFE_RADIUS && Math.abs(y - head.y) <= HEAD_SAFE_RADIUS) return true;
    const d = DIRS[this.dir];
    for (let k = 1; k <= HEAD_SAFE_AHEAD; k++) {
      const cx = head.x + d.x * k;
      const cy = head.y + d.y * k;
      if (Math.abs(x - cx) <= 1 && Math.abs(y - cy) <= 1) return true;
    }
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (this.snakeCells.has(cellKey(x + dx, y + dy))) return true;
    for (const p of this.portals) if (chebyshev(p.a, { x, y }) <= 1 || chebyshev(p.b, { x, y }) <= 1) return true;
    for (const f of this.foods) if (f.pos.x === x && f.pos.y === y) return true;
    for (const m of this.movers) if (m.pos.x === x && m.pos.y === y) return true;
    return false;
  };

  /** Generates obstacle chunks around the head, drops far ones, and keeps movers populated. */
  private refreshWorld(): void {
    const h = this.head;
    this.world.update(h.x, h.y, CHUNK_RADIUS, this.forbidden);

    if (!this.mode.obstacles) return;
    const wanted = this.diff.movingObstacles;
    const far = this.viewRadius * 3;
    this.movers = this.movers.filter((m) => chebyshev(m.pos, h) <= far);
    while (this.movers.length < wanted) {
      const c = randomCellNear(h, this.viewRadius + 1, this.viewRadius * 2, this.rng, (x, y) => !this.forbidden(x, y) && !this.isBlocked(x, y));
      if (!c) break;
      this.movers.push({ id: this.nextId++, pos: c, prev: { ...c }, dir: this.rng.int(4) as Dir });
    }
  }

  /** Food and portals that fall far behind are brought back near the snake. */
  private keepNearby(): void {
    const h = this.head;
    const far = this.viewRadius * 3;
    for (const f of this.foods) {
      if (chebyshev(f.pos, h) > far) {
        const c = this.freeCell(3, this.viewRadius);
        if (c) {
          f.pos = c;
          f.prev = { ...c };
        }
      }
    }
    for (let i = 0; i < this.portals.length; i++) {
      const p = this.portals[i];
      if (chebyshev(p.a, h) > far && chebyshev(p.b, h) > far) {
        const pair = this.makePortalPair(p.color);
        if (pair) this.portals[i] = pair;
      }
    }
  }

  private placePortals(): void {
    for (let i = 0; i < this.mode.portalPairs; i++) {
      const pair = this.makePortalPair(PORTAL_COLORS[i % PORTAL_COLORS.length]);
      if (pair) this.portals.push(pair);
    }
  }

  private makePortalPair(color: string): Portal | null {
    const others = this.portals.flatMap((p) => (p.color === color ? [] : [p.a, p.b]));
    const ok = (x: number, y: number) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (this.isBlocked(x + dx, y + dy)) return false;
      if (this.snakeCells.has(cellKey(x, y)) || this.foodAt(x, y)) return false;
      return others.every((o) => chebyshev(o, { x, y }) >= 3);
    };
    const r = this.viewRadius;
    const a = randomCellNear(this.head, 4, r, this.rng, ok);
    if (!a) return null;
    const b = randomCellNear(this.head, 4, Math.round(r * 1.6), this.rng, (x, y) => ok(x, y) && manhattan(a, { x, y }) >= r);
    if (!b) return null;
    return { a, b, color };
  }

  // ------------------------------------------------------------------ food

  private maybeSpawnSpecials(): void {
    const hasSpecial = this.foods.some((f) => f.type !== 'apple' && f.type !== 'poison');
    if (!hasSpecial && this.rng.chance(this.diff.specialChance)) {
      this.spawnFood(this.rng.weighted(SPECIAL_TYPES, (t) => FOODS[t].weight));
    }
    const hasPoison = this.foods.some((f) => f.type === 'poison');
    if (!hasPoison && !this.mode.noDeath && this.diff.poisonChance > 0 && this.rng.chance(this.diff.poisonChance)) {
      this.spawnFood('poison');
    }
  }

  private ensureApple(): void {
    if (!this.foods.some((f) => f.type === 'apple')) this.spawnFood('apple');
  }

  spawnFood(type: FoodType): FoodItem | null {
    const c = this.freeCell(3, this.viewRadius);
    if (!c) return null;
    const cfg = FOODS[type];
    const life =
      cfg.lifetime === 'golden'
        ? this.diff.goldenLifetimeMs
        : cfg.lifetime === 'powerUp'
          ? this.diff.powerUpLifetimeMs
          : cfg.lifetime === 'poison'
            ? this.diff.poisonLifetimeMs
            : Infinity;
    const food: FoodItem = {
      id: this.nextId++,
      type,
      pos: c,
      prev: { ...c },
      bornMs: this.timeMs,
      expiresMs: life > 0 ? this.timeMs + life : Infinity,
    };
    this.foods.push(food);
    this.events.push({ type: 'spawn', food });
    return food;
  }

  private isFree(x: number, y: number): boolean {
    return !this.snakeCells.has(cellKey(x, y)) && !this.isBlocked(x, y) && !this.isPortal(x, y) && !this.foodAt(x, y) && !this.moverAt(x, y);
  }

  private freeCell(minD: number, maxD: number): Vec | null {
    return (
      randomCellNear(this.head, minD, maxD, this.rng, (x, y) => this.isFree(x, y)) ??
      randomCellNear(this.head, 2, maxD * 2, this.rng, (x, y) => this.isFree(x, y))
    );
  }

  /** Magnet: food near the head drifts one cell toward it each step. */
  private pullFood(): void {
    const head = this.head;
    for (const f of this.foods) {
      if (f.type === 'poison') continue;
      if (chebyshev(f.pos, head) > MAGNET_RADIUS) continue;
      const dx = Math.sign(head.x - f.pos.x);
      const dy = Math.sign(head.y - f.pos.y);
      const options: Vec[] =
        Math.abs(head.x - f.pos.x) >= Math.abs(head.y - f.pos.y)
          ? [{ x: dx, y: 0 }, { x: 0, y: dy }]
          : [{ x: 0, y: dy }, { x: dx, y: 0 }];
      for (const o of options) {
        if (o.x === 0 && o.y === 0) continue;
        const tx = f.pos.x + o.x;
        const ty = f.pos.y + o.y;
        if (tx === head.x && ty === head.y) break;
        if (!this.isFree(tx, ty)) continue;
        f.pos = { x: tx, y: ty };
        break;
      }
    }
  }

  // --------------------------------------------------------------- movers

  private stepMovers(): void {
    const moveNow = this.stepCount % MOVER_EVERY === 0;
    for (const m of this.movers) {
      m.prev = { ...m.pos };
      if (!moveNow) continue;
      for (let tries = 0; tries < 2; tries++) {
        const d = DIRS[m.dir];
        const tx = m.pos.x + d.x;
        const ty = m.pos.y + d.y;
        const blocked =
          this.isBlocked(tx, ty) ||
          this.isPortal(tx, ty) ||
          !!this.foodAt(tx, ty) ||
          this.movers.some((o) => o !== m && o.pos.x === tx && o.pos.y === ty) ||
          chebyshev({ x: tx, y: ty }, this.head) <= 1 ||
          this.snakeCells.has(cellKey(tx, ty));
        if (!blocked) {
          m.pos = { x: tx, y: ty };
          break;
        }
        m.dir = ((m.dir + 2) % 4) as Dir;
      }
    }
  }

  // --------------------------------------------------------------- queries

  private indexSnake(): void {
    this.snakeCells.clear();
    for (const s of this.snake) this.addCell(s.x, s.y);
  }

  private addCell(x: number, y: number): void {
    const k = cellKey(x, y);
    this.snakeCells.set(k, (this.snakeCells.get(k) ?? 0) + 1);
  }

  private removeCell(x: number, y: number): void {
    const k = cellKey(x, y);
    const n = (this.snakeCells.get(k) ?? 0) - 1;
    if (n <= 0) this.snakeCells.delete(k);
    else this.snakeCells.set(k, n);
  }

  /** Replaces the snake body (tests / debugging). */
  setSnake(cells: Vec[]): void {
    this.snake = cells.map((c) => ({ ...c }));
    this.prevSnake = this.snake.map((c) => ({ ...c }));
    this.indexSnake();
  }

  onSnake(x: number, y: number): boolean {
    return this.snakeCells.has(cellKey(x, y));
  }

  foodAt(x: number, y: number): FoodItem | undefined {
    for (const f of this.foods) if (f.pos.x === x && f.pos.y === y) return f;
    return undefined;
  }

  moverAt(x: number, y: number): boolean {
    for (const m of this.movers) if (m.pos.x === x && m.pos.y === y) return true;
    return false;
  }

  isPortal(x: number, y: number): boolean {
    for (const p of this.portals) if ((p.a.x === x && p.a.y === y) || (p.b.x === x && p.b.y === y)) return true;
    return false;
  }

  private portalExit(x: number, y: number): Vec | null {
    for (const p of this.portals) {
      if (p.a.x === x && p.a.y === y) return p.b;
      if (p.b.x === x && p.b.y === y) return p.a;
    }
    return null;
  }
}

export function createGame(modeId: keyof typeof MODES, difficulty: DifficultyConfig, seed?: number): Game {
  return new Game({ mode: MODES[modeId], difficulty, seed });
}

export { CHUNK };
