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
  BASIC_TYPES,
  isBasic,
  type FoodType,
  type TimedEffect,
} from '../config/food';
import { MODES, PORTAL_COLORS, type ModeConfig } from '../config/modes';
import { FOODS_PER_ZONE, ZONES, type ZoneConfig } from '../config/zones';
import { Rng } from './rng';
import { CHUNK, ObstacleWorld, cellKey, randomCellNear } from './spawn';
import { SKINS, type SkinId } from '../config/skins';
import { ABILITIES, type AbilityConfig, type AbilityId, type HazardKind } from '../config/abilities';
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
  | { type: 'spawn'; food: FoodItem }
  | { type: 'rivalKilled'; rival: Rival; cells: Vec[]; byPlayer: boolean; points: number }
  | { type: 'breath'; ability: AbilityId; from: Vec; dir: Dir; cells: Vec[]; targets: Vec[]; strong: boolean }
  | { type: 'rivalHit'; rival: Rival; removed: Vec[]; points: number }
  | { type: 'smash'; cells: Vec[]; points: number }
  | { type: 'wave'; wave: number }
  | { type: 'waveCleared'; wave: number };

/** A patch of ground left by a breath that hurts rivals crossing it. */
export interface Hazard {
  x: number;
  y: number;
  kind: HazardKind;
  untilMs: number;
}

/** A computer-controlled rival snake. */
export interface Rival {
  id: number;
  snake: Vec[];
  prevSnake: Vec[];
  dir: Dir;
  pendingGrow: number;
  /** Fractional growth carried over (rivals grow slower on easy). */
  growCredit: number;
  moveTimer: number;
  skin: SkinId;
  alive: boolean;
  /** Killed for good (dead rivals never come back; a new wave brings new ones). */
  dead: boolean;
  /** Retry delay while no free spot was found to place it (ms). */
  respawnMs: number;
  /** Breath status effects (ms left). */
  burnMs: number;
  poisonMs: number;
  frozenMs: number;
  stunMs: number;
  confuseMs: number;
  fearMs: number;
  /** Accumulates time for burn / poison ticks (1 segment per second). */
  dotMs: number;
  /** Cell occupancy counts (fast collision checks). */
  cells: Map<number, number>;
  /** Always 'playing' (lets the renderer treat it like the player). */
  status: 'playing';
}

/** Skins rivals pick from (the player's own skin is skipped). */
const RIVAL_SKINS: SkinId[] = ['tiger', 'ocean', 'rainbow', 'classic', 'dragonSea', 'dragon', 'lava'];
/** Rival lengths relative to the player: some are prey, some are threats. */
const RIVAL_LENGTH_OFFSETS = [-3, 4, -1, 7, -4];
const RIVAL_POINTS_PER_SEGMENT = 5;
/** Pause between clearing a wave and the next one. */
export const WAVE_DELAY_MS = 5000;
const MAX_RIVALS = 8;
/** Swiping the way the dragon already goes: sprint. */
export const SPRINT_MS = 1500;
export const SPRINT_MAX_MS = 3000;
export const SPRINT_FACTOR = 1.4;
/** Points for each obstacle cell broken by a breath. */
const SMASH_POINTS = 5;

export interface GameOptions {
  mode: ModeConfig;
  difficulty: DifficultyConfig;
  seed?: number;
  zones?: ZoneConfig[];
  startLength?: number;
  /** Roughly half the number of cells visible on screen (spawn distances scale with it). */
  viewRadius?: number;
  /** The player's skin (rivals pick different ones). */
  playerSkin?: SkinId;
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
  rivals: Rival[] = [];
  rivalsKilled = 0;
  /** Rival wave number (Rivals mode). */
  wave = 1;
  /** Countdown to the next wave once every rival is dead (ms, 0 = not waiting). */
  waveTimerMs = 0;
  /** Sprint time left (ms). */
  sprintMs = 0;
  /** Rivals can't see the player (shadow breath). */
  invisibleMs = 0;
  hazards = new Map<number, Hazard>();
  /** Obstacle cells broken by breaths (counted for the stats). */
  smashed = 0;
  /** Player skin (rivals avoid wearing the same one). */
  playerSkin: SkinId = 'classic';
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

    this.playerSkin = opts.playerSkin ?? 'classic';
    this.placePortals();
    this.refreshWorld();
    this.ensureApple();
    if (this.mode.rivals !== 'none') for (let i = 0; i < this.diff.rivals; i++) this.rivals.push(this.newRival(i));
    this.events.length = 0;
  }

  get zone(): ZoneConfig {
    return this.zones[this.zoneIndex];
  }

  get head(): Vec {
    return this.snake[0];
  }

  /** Milliseconds per cell without power-ups. */
  get baseStepMs(): number {
    const base = Math.max(this.diff.minStepMs, this.diff.baseStepMs - this.diff.rampMsPerFood * this.foodsEaten);
    return base * Math.pow(this.diff.loopSpeedFactor, this.loop);
  }

  /** Rivals move a little slower than the player's base speed. */
  get rivalStepMs(): number {
    return this.baseStepMs * 1.15;
  }

  /** Milliseconds per cell right now. */
  get stepMs(): number {
    let ms = this.baseStepMs;
    if (this.effects.speed > 0) ms *= SPEED_BOOST_FACTOR;
    if (this.effects.slow > 0) ms *= SLOW_MO_FACTOR;
    if (this.sprintMs > 0) ms /= SPRINT_FACTOR;
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

  /**
   * Queue a turn. Steering the way the dragon already goes sprints; steering
   * backwards makes a U-turn into the next lane (`lean` picks the side,
   * otherwise the side with more room).
   */
  steer(d: Dir, lean?: Dir): boolean {
    if (this.status === 'dying' || this.status === 'over') return false;
    const last = this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
    if (this.status === 'ready') {
      if (isOpposite(d, this.dir)) return false;
      if (d !== this.dir) this.queue.push(d);
      this.begin();
      return true;
    }
    if (d === last) {
      if (this.queue.length > 0) return false;
      this.sprintMs = Math.min(SPRINT_MAX_MS, this.sprintMs + SPRINT_MS);
      return true;
    }
    if (isOpposite(d, last)) {
      if (this.queue.length > MAX_QUEUE - 2) return false;
      const side = lean !== undefined && !isOpposite(lean, last) && lean !== last ? lean : this.roomierSide(last);
      this.queue.push(side, d);
      return true;
    }
    if (this.queue.length >= MAX_QUEUE) return false;
    this.queue.push(d);
    return true;
  }

  /** The side (perpendicular to `dir`) with more free room around the head, for U-turns. */
  private roomierSide(dir: Dir): Dir {
    const a = ((dir + 1) % 4) as Dir;
    const b = ((dir + 3) % 4) as Dir;
    const room = (side: Dir) => {
      const h = this.head;
      const s1 = { x: h.x + DIRS[side].x, y: h.y + DIRS[side].y };
      const free = (x: number, y: number) => (this.effects.ghost > 0 || !this.isBlocked(x, y)) && !this.snakeCells.has(cellKey(x, y)) && !this.moverAt(x, y);
      if (!free(s1.x, s1.y)) return -1;
      // Count free cells in a small area on that side.
      let n = 0;
      for (let k = 1; k <= 4; k++) {
        for (let j = -3; j <= 3; j++) {
          const x = h.x + DIRS[side].x * k + DIRS[dir].x * j;
          const y = h.y + DIRS[side].y * k + DIRS[dir].y * j;
          if (free(x, y) && !this.rivalAt(x, y)) n++;
        }
      }
      return n;
    };
    const ra = room(a);
    const rb = room(b);
    return rb > ra ? b : a;
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
    if (this.sprintMs > 0) this.sprintMs = Math.max(0, this.sprintMs - dt);
    if (this.invisibleMs > 0) this.invisibleMs = Math.max(0, this.invisibleMs - dt);
    if (this.hazards.size) for (const [k, hz] of this.hazards) if (hz.untilMs <= this.timeMs) this.hazards.delete(k);

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
    this.updateRivals(dt);
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

    // Ghost lets the snake pass through obstacles and its own body.
    if (this.effects.ghost <= 0 && (this.isBlocked(nx, ny) || this.moverAt(nx, ny))) return this.crash({ x: nx, y: ny });

    // Rivals: the longer snake wins (ties go to the player); ghost passes through.
    const rival = this.mode.rivals === 'lethal' && this.effects.ghost <= 0 ? this.rivalAt(nx, ny) : undefined;
    if (rival) {
      if (this.snake.length >= rival.snake.length || rival.frozenMs > 0) this.killRival(rival, true);
      else return this.crash({ x: nx, y: ny });
    }

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
      this.breathe(food.type === 'golden');
      this.foodsEaten++;
      if (this.mode.zones && this.foodsEaten % FOODS_PER_ZONE === 0) this.advanceZone();
    }

    if (isBasic(food.type)) {
      this.ensureApple();
      this.maybeSpawnSpecials();
    }

    if (!cfg.harmful) {
      // Combo window: distance to the nearest apple plus some slack.
      const apple = this.foods.find((f) => isBasic(f.type));
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
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (this.rivalAt(x + dx, y + dy)) return true;
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

  // --------------------------------------------------------------- rivals

  /** Rivals only start eating after the player's first meal. */
  get rivalsCanEat(): boolean {
    return this.foodsEaten > 0;
  }

  rivalAt(x: number, y: number): Rival | undefined {
    const k = cellKey(x, y);
    for (const r of this.rivals) if (r.alive && r.cells.has(k)) return r;
    return undefined;
  }

  private newRival(index: number): Rival {
    const skins = RIVAL_SKINS.filter((s) => s !== this.playerSkin);
    const r: Rival = {
      id: this.nextId++,
      snake: [],
      prevSnake: [],
      dir: 0,
      pendingGrow: 0,
      growCredit: 0,
      moveTimer: this.rng.next() * 100,
      skin: skins[index % skins.length],
      alive: false,
      dead: false,
      respawnMs: 0,
      burnMs: 0,
      poisonMs: 0,
      frozenMs: 0,
      stunMs: 0,
      confuseMs: 0,
      fearMs: 0,
      dotMs: 0,
      cells: new Map(),
      status: 'playing',
    };
    this.placeRival(r, index);
    return r;
  }

  /** Puts a rival somewhere near (but not too near) the player, in a straight free line. */
  private placeRival(r: Rival, index: number): boolean {
    // Later waves bring longer rivals.
    const offset = RIVAL_LENGTH_OFFSETS[index % RIVAL_LENGTH_OFFSETS.length] + this.rng.int(3) - 1 + (this.wave - 1) * 2;
    const len = Math.max(3, Math.min(60, this.snake.length + offset));
    const near = this.viewRadius + 4;
    for (let attempt = 0; attempt < 40; attempt++) {
      const head = randomCellNear(this.head, near, near + 8, this.rng, (x, y) => this.isFree(x, y));
      if (!head) continue;
      const dir = this.rng.int(4) as Dir;
      const back = DIRS[(dir + 2) % 4];
      const body: Vec[] = [];
      let ok = true;
      for (let i = 0; i < len && ok; i++) {
        const c = { x: head.x + back.x * i, y: head.y + back.y * i };
        ok = this.isFree(c.x, c.y) && chebyshev(c, this.head) > 4;
        body.push(c);
      }
      if (!ok) continue;
      r.snake = body;
      r.prevSnake = body.map((c) => ({ ...c }));
      r.dir = dir;
      r.pendingGrow = 0;
      r.cells.clear();
      for (const c of body) addCount(r.cells, cellKey(c.x, c.y));
      r.alive = true;
      return true;
    }
    r.alive = false;
    r.respawnMs = 500;
    return false;
  }

  private killRival(r: Rival, byPlayer: boolean): void {
    const points = byPlayer ? r.snake.length * RIVAL_POINTS_PER_SEGMENT : 0;
    if (byPlayer) {
      this.score += points;
      this.pendingGrow += 2;
      this.rivalsKilled++;
    }
    this.events.push({ type: 'rivalKilled', rival: r, cells: r.snake.map((c) => ({ ...c })), byPlayer, points });
    r.alive = false;
    r.dead = true;
    r.cells.clear();
  }

  /** Removes `n` tail segments from a rival; it dies once shorter than 3. */
  private damageRival(r: Rival, n: number, bonus = 0): number {
    if (!r.alive || n <= 0) return 0;
    this.score += bonus;
    if (r.snake.length - n < MIN_LENGTH) {
      // Too weak to survive: the player defeats it (and gets its points).
      const len = r.snake.length;
      this.killRival(r, true);
      return len;
    }
    const removed = r.snake.splice(r.snake.length - n, n);
    for (const c of removed) subCount(r.cells, cellKey(c.x, c.y));
    r.prevSnake.length = Math.min(r.prevSnake.length, r.snake.length);
    r.pendingGrow = 0;
    const points = n * RIVAL_POINTS_PER_SEGMENT;
    this.score += points;
    this.events.push({ type: 'rivalHit', rival: r, removed, points: points + bonus });
    return n;
  }

  /** Knocks a rival back up to `n` cells (stops at anything in the way). */
  private pushRival(r: Rival, d: Vec, n: number): void {
    for (let k = 0; k < n; k++) {
      const moved = r.snake.map((c) => ({ x: c.x + d.x, y: c.y + d.y }));
      const ok = moved.every((c) => {
        if (this.isBlocked(c.x, c.y) || this.moverAt(c.x, c.y) || this.snakeCells.has(cellKey(c.x, c.y))) return false;
        const o = this.rivalAt(c.x, c.y);
        return !o || o === r;
      });
      if (!ok) return;
      r.snake = moved;
      r.prevSnake = moved.map((c) => ({ ...c }));
      r.cells.clear();
      for (const c of moved) addCount(r.cells, cellKey(c.x, c.y));
    }
  }

  // --------------------------------------------------------------- breath

  /** The player's breath ability (from the dragon skin). */
  get ability(): AbilityConfig {
    return ABILITIES[SKINS[this.playerSkin]?.ability ?? 'fire'];
  }

  /** Cells covered by a breath from the head (see BreathShape). */
  breathCells(ab: AbilityConfig, strong: boolean): Vec[] {
    const h = this.head;
    const d = DIRS[this.dir];
    const p = DIRS[(this.dir + 1) % 4];
    const range = strong ? ab.range * 2 : ab.range;
    const cells: Vec[] = [];
    const seen = new Set<number>();
    const add = (x: number, y: number) => {
      const k = cellKey(x, y);
      if (seen.has(k) || (x === h.x && y === h.y)) return;
      seen.add(k);
      cells.push({ x, y });
    };
    const ahead = (k: number, j = 0) => add(h.x + d.x * k + p.x * j, h.y + d.y * k + p.y * j);
    switch (ab.shape) {
      case 'line':
        for (let k = 1; k <= range; k++) ahead(k);
        break;
      case 'cone':
        for (let k = 1; k <= range; k++) {
          const w = Math.min(3, Math.floor(k / 2));
          for (let j = -w; j <= w; j++) ahead(k, j);
        }
        break;
      case 'wide':
        for (let k = 1; k <= range; k++) for (let j = -2; j <= 2; j++) ahead(k, j);
        break;
      case 'ring': {
        const r = strong ? Math.ceil(ab.range * 1.5) : ab.range;
        for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) add(h.x + x, h.y + y);
        break;
      }
      case 'fan':
        for (let k = 1; k <= range; k++) {
          ahead(k);
          ahead(k, k);
          ahead(k, -k);
        }
        break;
      case 'point': {
        const r = strong ? 3 : 2;
        const cx = h.x + d.x * ab.range;
        const cy = h.y + d.y * ab.range;
        for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) add(cx + x, cy + y);
        break;
      }
      case 'chain':
        for (let k = 1; k <= 4; k++) ahead(k);
        break;
    }
    return cells;
  }

  /** Dragon breath after every meal: breaks obstacles and (Rivals mode) weakens rivals. */
  private breathe(strong: boolean): void {
    const ab = this.ability;
    const h = this.head;
    const d = DIRS[this.dir];
    const cells = this.breathCells(ab, strong);

    // Smash obstacles and moving obstacles in the way.
    const smashed: Vec[] = [];
    for (const c of cells) {
      if (this.world.remove(c.x, c.y)) smashed.push(c);
      const m = this.movers.findIndex((mv) => mv.pos.x === c.x && mv.pos.y === c.y);
      if (m >= 0) {
        this.movers.splice(m, 1);
        smashed.push(c);
      }
    }

    // Rivals hit (only where rivals fight back).
    const hit: Rival[] = [];
    const targets: Vec[] = [];
    if (this.mode.rivals === 'lethal') {
      if (ab.shape === 'chain') {
        const reach = strong ? ab.range * 2 : ab.range;
        const near = this.rivals
          .filter((r) => r.alive)
          .map((r) => {
            let best = r.snake[0];
            for (const c of r.snake) if (manhattan(c, h) < manhattan(best, h)) best = c;
            return { r, c: best, dist: manhattan(best, h) };
          })
          .filter((o) => o.dist <= reach)
          .sort((a, b) => a.dist - b.dist)
          .slice(0, strong ? 5 : 3);
        for (const o of near) {
          hit.push(o.r);
          targets.push({ ...o.c });
        }
      }
      for (const c of cells) {
        const r = this.rivalAt(c.x, c.y);
        if (r && !hit.includes(r)) hit.push(r);
      }
    }

    this.events.push({ type: 'breath', ability: ab.id, from: { ...h }, dir: this.dir, cells, targets, strong });
    if (smashed.length) {
      const points = smashed.length * SMASH_POINTS;
      this.score += points;
      this.smashed += smashed.length;
      this.events.push({ type: 'smash', cells: smashed, points });
    }

    for (const r of hit) {
      if (ab.burnMs) r.burnMs = Math.max(r.burnMs, ab.burnMs);
      if (ab.poisonMs) r.poisonMs = Math.max(r.poisonMs, ab.poisonMs);
      if (ab.freezeMs) r.frozenMs = Math.max(r.frozenMs, ab.freezeMs);
      if (ab.stunMs) r.stunMs = Math.max(r.stunMs, ab.stunMs);
      if (ab.confuseMs) r.confuseMs = Math.max(r.confuseMs, ab.confuseMs);
      if (ab.fearMs) r.fearMs = Math.max(r.fearMs, ab.fearMs);
      if (ab.push) this.pushRival(r, d, ab.push);
      const taken = this.damageRival(r, ab.damage + (strong ? 1 : 0), ab.bonusPerHit ?? 0);
      if (ab.steal) this.pendingGrow += Math.min(taken, ab.damage + 1);
    }
    if (ab.stunAllMs && this.mode.rivals === 'lethal') {
      for (const r of this.rivals) if (r.alive && chebyshev(r.snake[0], h) <= this.viewRadius * 2) r.stunMs = Math.max(r.stunMs, ab.stunAllMs);
    }
    if (ab.invisibleMs) this.invisibleMs = Math.max(this.invisibleMs, ab.invisibleMs);
    if (ab.hazard && ab.hazardMs) {
      for (const c of cells) {
        if (this.isBlocked(c.x, c.y)) continue;
        this.hazards.set(cellKey(c.x, c.y), { x: c.x, y: c.y, kind: ab.hazard, untilMs: this.timeMs + ab.hazardMs });
      }
    }
    if (ab.pullFood) {
      // Everyday food nearby is sucked into the black hole.
      const cx = h.x + d.x * ab.range;
      const cy = h.y + d.y * ab.range;
      for (const f of this.foods) {
        if (!isBasic(f.type) || chebyshev(f.pos, { x: cx, y: cy }) > 10) continue;
        const spot = randomCellNear({ x: cx, y: cy }, 0, 1, this.rng, (x, y) => this.isFree(x, y));
        if (spot) f.pos = spot;
      }
    }
  }

  private updateRivals(dt: number): void {
    if (this.status !== 'playing') return;
    const step = this.rivalStepMs;
    this.rivals.forEach((r, i) => {
      if (this.status !== 'playing' || r.dead) return;
      if (!r.alive) {
        // Not placed yet (no free spot): keep trying.
        r.respawnMs -= dt;
        if (r.respawnMs <= 0) this.placeRival(r, i);
        return;
      }
      if (chebyshev(r.snake[0], this.head) > this.viewRadius * 4) {
        this.placeRival(r, i);
        return;
      }
      for (const key of ['burnMs', 'poisonMs', 'frozenMs', 'stunMs', 'confuseMs', 'fearMs'] as const) if (r[key] > 0) r[key] = Math.max(0, r[key] - dt);
      if (r.burnMs > 0 || r.poisonMs > 0) {
        r.dotMs += dt;
        if (r.dotMs >= 1000) {
          r.dotMs -= 1000;
          this.damageRival(r, 1);
          if (!r.alive) return;
        }
      } else r.dotMs = 0;
      if (r.frozenMs > 0 || r.stunMs > 0) return;
      r.moveTimer += dt;
      if (r.moveTimer >= step) {
        r.moveTimer -= step;
        if (r.moveTimer > step) r.moveTimer = 0;
        this.stepRival(r);
      }
    });
    this.updateWaves(dt);
  }

  /** Dead rivals stay dead; once all are gone a new, stronger wave comes after a short pause. */
  private updateWaves(dt: number): void {
    if (this.rivals.length === 0 || !this.rivals.every((r) => r.dead)) return;
    if (this.waveTimerMs === 0) {
      this.waveTimerMs = WAVE_DELAY_MS;
      if (this.mode.rivals === 'lethal') this.events.push({ type: 'waveCleared', wave: this.wave });
      return;
    }
    this.waveTimerMs -= dt;
    if (this.waveTimerMs > 0) return;
    this.waveTimerMs = 0;
    this.wave++;
    const count = Math.min(MAX_RIVALS, this.diff.rivals + this.wave - 1);
    this.rivals = [];
    for (let i = 0; i < count; i++) this.rivals.push(this.newRival(i));
    if (this.mode.rivals === 'lethal') this.events.push({ type: 'wave', wave: this.wave });
  }

  /** Can rival `r` move into (x, y)? */
  private rivalCanEnter(r: Rival, x: number, y: number, bigger: boolean): boolean {
    if (this.isBlocked(x, y) || this.moverAt(x, y) || this.isPortal(x, y)) return false;
    const k = cellKey(x, y);
    for (const o of this.rivals) {
      if (!o.alive || !o.cells.has(k)) continue;
      // Its own tail moves away this step unless it is growing.
      const tail = o.snake[o.snake.length - 1];
      if (o === r && r.pendingGrow === 0 && tail.x === x && tail.y === y && r.cells.get(k) === 1) continue;
      return false;
    }
    if (this.snakeCells.has(k)) {
      if (this.mode.rivals !== 'lethal' || this.effects.ghost > 0) return true;
      return bigger;
    }
    return true;
  }

  /** Free cells reachable from (x, y), up to `limit` (avoids dead ends). */
  private rivalSpace(r: Rival, x: number, y: number, bigger: boolean, limit: number): number {
    const seen = new Set<number>([cellKey(x, y)]);
    const queue: Vec[] = [{ x, y }];
    while (queue.length && seen.size < limit) {
      const c = queue.shift()!;
      for (const d of DIRS) {
        const nx = c.x + d.x;
        const ny = c.y + d.y;
        const k = cellKey(nx, ny);
        if (seen.has(k) || !this.rivalCanEnter(r, nx, ny, bigger)) continue;
        seen.add(k);
        queue.push({ x: nx, y: ny });
      }
    }
    return seen.size;
  }

  private chooseRivalDir(r: Rival): Dir {
    const head = r.snake[0];
    const lethal = this.mode.rivals === 'lethal' && this.effects.ghost <= 0 && this.invisibleMs <= 0;
    // Scared rivals act small (they run away instead of hunting).
    const bigger = r.snake.length > this.snake.length && r.fearMs <= 0;
    if (r.confuseMs > 0) {
      const options = ([0, 1, 2, 3] as Dir[]).filter((d) => !isOpposite(d, r.dir) && this.rivalCanEnter(r, head.x + DIRS[d].x, head.y + DIRS[d].y, false));
      if (options.length) return this.rng.pick(options);
    }
    // Target: nearest everyday food the rival is clearly closer to (so rivals
    // don't keep stealing the player's food), or the player when hunting.
    let target: Vec | null = null;
    let best = Infinity;
    for (const f of this.foods) {
      if (!this.rivalsCanEat || !isBasic(f.type)) continue;
      const d = manhattan(f.pos, head);
      if (d < best && d < 20 && d + 3 < manhattan(f.pos, this.head)) {
        best = d;
        target = f.pos;
      }
    }
    const playerDist = manhattan(head, this.head);
    if (lethal && bigger && playerDist < 10 && this.rng.chance(this.diff.rivalAggression)) {
      const pd = DIRS[this.dir];
      target = { x: this.head.x + pd.x * 2, y: this.head.y + pd.y * 2 };
    }
    let bestScore = -Infinity;
    let bestDir = r.dir;
    for (const d of [r.dir, ((r.dir + 1) % 4) as Dir, ((r.dir + 3) % 4) as Dir]) {
      const nx = head.x + DIRS[d].x;
      const ny = head.y + DIRS[d].y;
      if (!this.rivalCanEnter(r, nx, ny, bigger)) continue;
      let score = this.rng.next() * 0.6;
      if (target) score -= manhattan({ x: nx, y: ny }, target);
      else score += d === r.dir ? 1 : 0;
      if (lethal && !bigger && playerDist < (r.fearMs > 0 ? 12 : 6)) score += manhattan({ x: nx, y: ny }, this.head) * 1.5;
      if (this.rivalSpace(r, nx, ny, bigger, 30) < Math.min(30, r.snake.length + 2)) score -= 60;
      if (score > bestScore) {
        bestScore = score;
        bestDir = d;
      }
    }
    return bestDir;
  }

  private stepRival(r: Rival): void {
    r.dir = this.chooseRivalDir(r);
    const head = r.snake[0];
    const nx = head.x + DIRS[r.dir].x;
    const ny = head.y + DIRS[r.dir].y;
    const bigger = r.snake.length > this.snake.length;
    if (!this.rivalCanEnter(r, nx, ny, bigger) && !this.snakeCells.has(cellKey(nx, ny))) {
      this.killRival(r, false);
      return;
    }
    if (this.snakeCells.has(cellKey(nx, ny)) && this.mode.rivals === 'lethal' && this.effects.ghost <= 0) {
      if (bigger) {
        this.crash({ x: nx, y: ny });
        return;
      }
      // Ran into a bigger (or equal) player: the player eats it.
      this.killRival(r, true);
      return;
    }
    r.prevSnake = r.snake.map((c) => ({ x: c.x, y: c.y }));
    r.snake.unshift({ x: nx, y: ny });
    addCount(r.cells, cellKey(nx, ny));
    if (r.pendingGrow > 0) r.pendingGrow--;
    else {
      const t = r.snake.pop()!;
      subCount(r.cells, cellKey(t.x, t.y));
    }
    if (this.hazards.has(cellKey(nx, ny)) && this.mode.rivals === 'lethal') {
      this.damageRival(r, 1);
      if (!r.alive) return;
    }
    const food = this.foodAt(nx, ny);
    if (food && isBasic(food.type) && this.rivalsCanEat) {
      this.foods.splice(this.foods.indexOf(food), 1);
      r.growCredit += FOODS[food.type].grow * this.diff.rivalGrowth;
      const whole = Math.floor(r.growCredit);
      r.growCredit -= whole;
      r.pendingGrow += whole;
      this.ensureApple();
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
    const hasSpecial = this.foods.some((f) => !isBasic(f.type) && f.type !== 'poison');
    if (!hasSpecial && this.rng.chance(this.diff.specialChance)) {
      this.spawnFood(this.rng.weighted(SPECIAL_TYPES, (t) => FOODS[t].weight));
    }
    const hasPoison = this.foods.some((f) => f.type === 'poison');
    if (!hasPoison && !this.mode.noDeath && this.diff.poisonChance > 0 && this.rng.chance(this.diff.poisonChance)) {
      this.spawnFood('poison');
    }
  }

  private ensureApple(): void {
    // One everyday food is always on the board; its kind is picked at random.
    if (!this.foods.some((f) => isBasic(f.type))) this.spawnFood(this.rng.weighted(BASIC_TYPES, (t) => FOODS[t].basicWeight ?? 0));
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
    return (
      !this.snakeCells.has(cellKey(x, y)) &&
      !this.isBlocked(x, y) &&
      !this.isPortal(x, y) &&
      !this.foodAt(x, y) &&
      !this.moverAt(x, y) &&
      !this.rivalAt(x, y)
    );
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
    const reached: FoodItem[] = [];
    for (const f of [...this.foods]) {
      if (f.type === 'poison') continue;
      const d = chebyshev(f.pos, head);
      if (d > MAGNET_RADIUS) continue;
      if (d <= 1) {
        // Right next to the mouth (even diagonally): snapped in and eaten, no turn needed.
        f.pos = { ...head };
        reached.push(f);
        continue;
      }
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
        if (tx === head.x && ty === head.y) {
          // Pulled right into the mouth: eaten without having to turn.
          f.pos = { x: tx, y: ty };
          reached.push(f);
          break;
        }
        if (!this.isFree(tx, ty)) continue;
        f.pos = { x: tx, y: ty };
        break;
      }
    }
    for (const f of reached) if (this.foods.includes(f)) this.eat(f);
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

function addCount(m: Map<number, number>, k: number): void {
  m.set(k, (m.get(k) ?? 0) + 1);
}

function subCount(m: Map<number, number>, k: number): void {
  const n = (m.get(k) ?? 0) - 1;
  if (n <= 0) m.delete(k);
  else m.set(k, n);
}
