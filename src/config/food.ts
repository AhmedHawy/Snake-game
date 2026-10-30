// Food and power-up definitions. Every type has a unique shape AND color.
export type FoodType = 'apple' | 'egg' | 'ladybug' | 'mouse' | 'golden' | 'speed' | 'slow' | 'ghost' | 'shrink' | 'magnet' | 'poison';

export type FoodShape = 'apple' | 'egg' | 'ladybug' | 'mouse' | 'star' | 'bolt' | 'hourglass' | 'ghost' | 'hexMinus' | 'magnet' | 'skull';

/** Effects that stay active for a while after pickup. */
export type TimedEffect = 'speed' | 'slow' | 'ghost' | 'magnet';

export type LifetimeKind = 'none' | 'golden' | 'powerUp' | 'poison';

export interface FoodConfig {
  type: FoodType;
  shape: FoodShape;
  /** Main fill color. */
  color: string;
  /** Secondary detail color. */
  accent: string;
  /** Base points (before combo / speed multipliers). Negative = penalty. */
  points: number;
  /** Segments gained (positive) or removed immediately (negative). */
  grow: number;
  /** Timed effect granted on pickup. */
  effect?: TimedEffect;
  /** Base effect duration (scaled by difficulty). */
  effectMs: number;
  /** Relative spawn weight among special items (apple/poison are spawned separately). */
  weight: number;
  /** Which difficulty lifetime applies (none = stays until eaten). */
  lifetime: LifetimeKind;
  /** Counts toward the zone progress / "foods eaten" stat. */
  countsAsFood: boolean;
  /** Bad items do not extend combos. */
  harmful: boolean;
  /**
   * Everyday food: one of these is always on the board, picked at random by
   * `basicWeight` each time one is eaten.
   */
  basicWeight?: number;
}

export const FOODS: Record<FoodType, FoodConfig> = {
  apple: {
    type: 'apple', shape: 'apple', color: '#ff3b3b', accent: '#4caf50',
    points: 10, grow: 1, effectMs: 0, weight: 0, lifetime: 'none', countsAsFood: true, harmful: false, basicWeight: 50,
  },
  egg: {
    type: 'egg', shape: 'egg', color: '#fff4dc', accent: '#c9a26b',
    points: 15, grow: 1, effectMs: 0, weight: 0, lifetime: 'none', countsAsFood: true, harmful: false, basicWeight: 25,
  },
  ladybug: {
    type: 'ladybug', shape: 'ladybug', color: '#ff2d2d', accent: '#111111',
    points: 20, grow: 1, effectMs: 0, weight: 0, lifetime: 'none', countsAsFood: true, harmful: false, basicWeight: 15,
  },
  mouse: {
    type: 'mouse', shape: 'mouse', color: '#c9c3d6', accent: '#ff8fb1',
    points: 30, grow: 2, effectMs: 0, weight: 0, lifetime: 'none', countsAsFood: true, harmful: false, basicWeight: 10,
  },
  golden: {
    type: 'golden', shape: 'star', color: '#ffd23f', accent: '#fff6c2',
    points: 50, grow: 2, effectMs: 0, weight: 3, lifetime: 'golden', countsAsFood: true, harmful: false,
  },
  speed: {
    type: 'speed', shape: 'bolt', color: '#00e5ff', accent: '#e0fdff',
    points: 5, grow: 1, effect: 'speed', effectMs: 10000, weight: 2, lifetime: 'powerUp', countsAsFood: false, harmful: false,
  },
  slow: {
    type: 'slow', shape: 'hourglass', color: '#4d7cff', accent: '#dfe7ff',
    points: 5, grow: 1, effect: 'slow', effectMs: 10000, weight: 2, lifetime: 'powerUp', countsAsFood: false, harmful: false,
  },
  ghost: {
    type: 'ghost', shape: 'ghost', color: '#f2ecff', accent: '#6b4fa0',
    points: 5, grow: 1, effect: 'ghost', effectMs: 11000, weight: 2, lifetime: 'powerUp', countsAsFood: false, harmful: false,
  },
  shrink: {
    type: 'shrink', shape: 'hexMinus', color: '#ff5fa2', accent: '#ffffff',
    points: 5, grow: -3, effectMs: 0, weight: 1.5, lifetime: 'powerUp', countsAsFood: false, harmful: false,
  },
  magnet: {
    type: 'magnet', shape: 'magnet', color: '#ff8c1a', accent: '#d9d9d9',
    points: 5, grow: 1, effect: 'magnet', effectMs: 12000, weight: 2, lifetime: 'powerUp', countsAsFood: false, harmful: false,
  },
  poison: {
    type: 'poison', shape: 'skull', color: '#7b2cbf', accent: '#b6ff3b',
    points: -30, grow: -2, effectMs: 0, weight: 0, lifetime: 'poison', countsAsFood: false, harmful: true,
  },
};

export const SPECIAL_TYPES: FoodType[] = ['golden', 'speed', 'slow', 'ghost', 'shrink', 'magnet'];

/** Everyday foods (apple, egg, ladybug, mouse). */
export const BASIC_TYPES: FoodType[] = (Object.keys(FOODS) as FoodType[]).filter((t) => (FOODS[t].basicWeight ?? 0) > 0);

export const isBasic = (t: FoodType): boolean => (FOODS[t].basicWeight ?? 0) > 0;

/** Effect colors (glow, countdown ring, HUD chip). */
export const EFFECT_COLORS: Record<TimedEffect, string> = {
  speed: FOODS.speed.color,
  slow: FOODS.slow.color,
  ghost: '#c9b8ff',
  magnet: FOODS.magnet.color,
};

/** Step time multipliers for movement effects. */
export const SPEED_BOOST_FACTOR = 0.6;
export const SLOW_MO_FACTOR = 1.6;
/** Points multiplier while speed boost is active. */
export const SPEED_POINTS_MULT = 2;
/** Magnet pull radius in cells (Chebyshev). */
export const MAGNET_RADIUS = 6;
/** Minimum snake length after shrink / poison. */
export const MIN_LENGTH = 3;
/** Highest combo multiplier. */
export const MAX_COMBO = 8;
