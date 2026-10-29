// Core game simulation. Pure logic: no DOM, no rendering. The app drains
// `events` every frame to drive effects, audio and haptics.
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
import { CellMask, buildForbiddenMask, generateObstacles, randomFreeCell, type BoardSpec } from './spawn';
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
  cols: number;
  rows: number;
  mode: ModeConfig;
  difficulty: DifficultyConfig;
  seed?: number;
  zones?: ZoneConfig[];
  startLength?: number;
}

export const TIMED_EFFECTS: TimedEffect[] = ['speed', 'slow', 'ghost', 'magnet'];
/** Hard floor on the step time so the game stays playable with every bonus stacked. */
const ABSOLUTE_MIN_STEP_MS = 28;
/** Moving obstacles advance once every N snake steps. */
export const MOVER_EVERY = 2;
const MAX_QUEUE = 3;

export class Game {
  readonly cols: number;
  readonly rows: number;
  readonly mode: ModeConfig;
  readonly diff: DifficultyConfig;
  readonly wrap: boolean;
  readonly zones: ZoneConfig[];
  readonly rng: Rng;
  private readonly spec: BoardSpec;

  snake: Vec[] = [];
  /** Snake cells before the last step, index-aligned with `snake`. */
  prevSnake: Vec[] = [];
  dir: Dir;
  /** Direction used for the previous step (for rendering the head turn). */
  prevDir: Dir;
  queue: Dir[] = [];
  pendingGrow = 0;
  /** The head went through a portal on the last step. */
  teleported = false;

  obstacles: Vec[] = [];
  /** Previous zone's obstacles, kept for the crossfade. */
  oldObstacles: Vec[] = [];
  readonly blocked: CellMask;
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

  constructor(opts: GameOptions) {
    this.cols = opts.cols;
    this.rows = opts.rows;
    this.mode = opts.mode;
    this.diff = opts.difficulty;
    this.zones = opts.zones ?? ZONES;
    this.wrap = this.diff.wrapWalls || this.mode.noDeath;
    this.rng = new Rng(opts.seed);
    this.spec = { cols: this.cols, rows: this.rows, wrap: this.wrap };
    this.blocked = new CellMask(this.cols, this.rows);
    this.timeLeftMs = this.mode.timeLimitMs;

    // Start in the middle, heading along the long axis.
    this.dir = this.rows >= this.cols ? 0 : 1;
    this.prevDir = this.dir;
    const len = opts.startLength ?? 4;
    const d = DIRS[this.dir];
    const cx = Math.floor(this.cols / 2);
    const cy = this.rows >= this.cols ? Math.floor(this.rows * 0.6) : Math.floor(this.rows / 2);
    const startX = this.rows >= this.cols ? cx : Math.floor(this.cols * 0.4);
    for (let i = 0; i < len; i++) this.snake.push({ x: startX - d.x * i, y: cy - d.y * i });
    this.prevSnake = this.snake.map((p) => ({ ...p }));

    this.placePortals();
    this.buildObstacles();
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

    if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) {
      if (!this.wrap) return this.crash(head);
      nx = (nx + this.cols) % this.cols;
      ny = (ny + this.rows) % this.rows;
    }

    let teleported = false;
    const exit = this.portalExit(nx, ny);
    if (exit) {
      this.events.push({ type: 'portal', from: { x: nx, y: ny }, to: { ...exit } });
      nx = exit.x;
      ny = exit.y;
      teleported = true;
    }

    if (this.blocked.get(nx, ny) || this.moverAt(nx, ny)) return this.crash({ x: nx, y: ny });

    if (this.effects.ghost <= 0 && !this.mode.noDeath) {
      // The tail cell frees up this step unless the snake is growing.
      const len = this.snake.length - (this.pendingGrow > 0 ? 0 : 1);
      for (let i = 0; i < len; i++) {
        const s = this.snake[i];
        if (s.x === nx && s.y === ny) return this.crash({ x: nx, y: ny });
      }
    }

    this.prevSnake = this.snake.map((p) => ({ x: p.x, y: p.y }));
    this.snake.unshift({ x: nx, y: ny });
    if (this.pendingGrow > 0) this.pendingGrow--;
    else this.snake.pop();
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
      const slack = Math.round((this.cols + this.rows) * this.diff.comboSlackFactor);
      this.comboWindow = Math.max(4, dist + slack);
      this.comboStepsLeft = this.comboWindow;
    }
  }

  private shrink(count: number, poison: boolean): void {
    const removable = Math.max(0, this.snake.length - MIN_LENGTH);
    const n = Math.min(count, removable);
    this.pendingGrow = 0;
    const removed = n > 0 ? this.snake.splice(this.snake.length - n, n) : [];
    this.prevSnake.length = Math.min(this.prevSnake.length, this.snake.length);
    this.events.push({ type: 'shrink', removed, poison });
  }

  private advanceZone(): void {
    this.zoneIndex++;
    if (this.zoneIndex >= this.zones.length) {
      this.zoneIndex = 0;
      this.loop++;
    }
    this.oldObstacles = this.obstacles;
    this.buildObstacles();
    // Relocate anything now sitting on an obstacle.
    for (const f of this.foods) {
      if (this.blocked.get(f.pos.x, f.pos.y)) {
        const c = this.freeCell();
        if (c) {
          f.pos = c;
          f.prev = { ...c };
        }
      }
    }
    this.events.push({ type: 'zone', zoneIndex: this.zoneIndex, loop: this.loop });
  }

  // ------------------------------------------------------------ world setup

  private buildObstacles(): void {
    this.blocked.clear();
    this.obstacles = [];
    this.movers = [];
    if (!this.mode.obstacles) return;
    const reserved = this.portals.flatMap((p) => [p.a, p.b]);
    const pieces = this.diff.obstaclePieces > 0 ? this.diff.obstaclePieces + Math.min(3, this.loop) : 0;
    this.obstacles = generateObstacles({
      spec: this.spec,
      pieces,
      shapes: this.zone.obstacleShapes,
      snake: this.snake,
      dir: this.dir,
      reserved,
      rng: this.rng,
    });
    for (const o of this.obstacles) this.blocked.set(o.x, o.y);

    if (this.diff.movingObstacles > 0) {
      const forbidden = buildForbiddenMask(this.spec, this.snake, this.dir, reserved);
      for (let i = 0; i < this.diff.movingObstacles; i++) {
        const c = randomFreeCell(
          this.spec,
          this.rng,
          (x, y) => !forbidden.get(x, y) && !this.blocked.get(x, y) && !this.moverAt(x, y) && !this.foodAt(x, y),
        );
        if (!c) break;
        this.movers.push({ pos: c, prev: { ...c }, dir: this.rng.int(4) as Dir });
      }
    }
  }

  private placePortals(): void {
    const pairs = this.mode.portalPairs;
    if (pairs <= 0) return;
    const forbidden = buildForbiddenMask(this.spec, this.snake, this.dir, []);
    const taken: Vec[] = [];
    const ok = (x: number, y: number) =>
      x >= 2 && y >= 2 && x < this.cols - 2 && y < this.rows - 2 && !forbidden.get(x, y) && taken.every((t) => chebyshev(t, { x, y }) >= 3);
    const minApart = Math.floor((this.cols + this.rows) / 3);
    for (let i = 0; i < pairs; i++) {
      const a = randomFreeCell(this.spec, this.rng, ok);
      if (!a) break;
      taken.push(a);
      const b = randomFreeCell(this.spec, this.rng, (x, y) => ok(x, y) && manhattan(a, { x, y }) >= minApart) ?? randomFreeCell(this.spec, this.rng, ok);
      if (!b) {
        taken.pop();
        break;
      }
      taken.push(b);
      this.portals.push({ a, b, color: PORTAL_COLORS[i % PORTAL_COLORS.length] });
    }
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
    const c = this.freeCell();
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

  private freeCell(): Vec | null {
    const snakeMask = new CellMask(this.cols, this.rows);
    for (const s of this.snake) snakeMask.set(s.x, s.y);
    const head = this.head;
    return randomFreeCell(
      this.spec,
      this.rng,
      (x, y) =>
        !snakeMask.get(x, y) &&
        !this.blocked.get(x, y) &&
        !this.isPortal(x, y) &&
        !this.foodAt(x, y) &&
        !this.moverAt(x, y) &&
        Math.max(Math.abs(x - head.x), Math.abs(y - head.y)) >= 2,
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
        if (this.blocked.get(tx, ty) || this.isPortal(tx, ty) || this.foodAt(tx, ty) || this.moverAt(tx, ty)) continue;
        if (this.snake.some((s) => s.x === tx && s.y === ty)) continue;
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
          !this.blocked.inside(tx, ty) ||
          this.blocked.get(tx, ty) ||
          this.isPortal(tx, ty) ||
          this.foodAt(tx, ty) ||
          this.movers.some((o) => o !== m && o.pos.x === tx && o.pos.y === ty) ||
          chebyshev({ x: tx, y: ty }, this.head) <= 1 ||
          this.snake.some((s) => s.x === tx && s.y === ty);
        if (!blocked) {
          m.pos = { x: tx, y: ty };
          break;
        }
        m.dir = ((m.dir + 2) % 4) as Dir;
      }
    }
  }

  // --------------------------------------------------------------- queries

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

export function createGame(
  cols: number,
  rows: number,
  modeId: keyof typeof MODES,
  difficulty: DifficultyConfig,
  seed?: number,
): Game {
  return new Game({ cols, rows, mode: MODES[modeId], difficulty, seed });
}
