// Dragon breath abilities. After every meal the dragon breathes: the breath
// breaks obstacles in its path and (in Rivals mode) weakens rival snakes.
// A rival's length is its health: hits shrink it, and below 3 it dies.
export type AbilityId =
  | 'fire' | 'water' | 'poison' | 'prism' | 'roar' | 'tsunami' | 'leaves'
  | 'lava' | 'ice' | 'blackHole' | 'lightning' | 'shadow' | 'crystal' | 'royal';

/**
 * Area hit by the breath, from the head looking forward:
 * - line: straight jet `range` cells long
 * - cone: widens with distance (1, 3, 3, 5... cells wide)
 * - wide: a 5-cell-wide wave `range` cells deep
 * - ring: every cell within `range` around the head
 * - fan: three jets (forward and both forward diagonals)
 * - point: a burst of radius 2 centred `range` cells ahead
 * - chain: jumps to the nearest rivals within `range` (plus a short jet ahead)
 */
export type BreathShape = 'line' | 'cone' | 'wide' | 'ring' | 'fan' | 'point' | 'chain';

export type HazardKind = 'lava' | 'spikes';

export interface AbilityConfig {
  id: AbilityId;
  nameKey: string;
  icon: string;
  shape: BreathShape;
  range: number;
  /** Segments removed from each rival hit. */
  damage: number;
  /** Lose 1 segment per second while burning / poisoned. */
  burnMs?: number;
  poisonMs?: number;
  /** Frozen rivals can't move and can be eaten whatever their size. */
  freezeMs?: number;
  /** Stunned rivals can't move. */
  stunMs?: number;
  /** Confused rivals wander at random. */
  confuseMs?: number;
  /** Scared rivals run away from the player. */
  fearMs?: number;
  /** Knocks the rival back this many cells. */
  push?: number;
  /** Damage dealt is added to the player's length. */
  steal?: boolean;
  /** Leaves a hazard on the breath cells that hurts rivals crossing it. */
  hazard?: HazardKind;
  hazardMs?: number;
  /** Player can't be seen (rivals stop hunting) for this long. */
  invisibleMs?: number;
  /** Extra points per rival hit. */
  bonusPerHit?: number;
  /** Stuns every rival on screen. */
  stunAllMs?: number;
  /** Pulls everyday food into the burst. */
  pullFood?: boolean;
  /** Particle colors (first = main). */
  colors: string[];
}

export const ABILITIES: Record<AbilityId, AbilityConfig> = {
  fire: { id: 'fire', nameKey: 'ability.fire', icon: '🔥', shape: 'cone', range: 4, damage: 2, burnMs: 2000, colors: ['#ff6a00', '#ffd23f', '#ff2d00', '#fff3c4'] },
  water: { id: 'water', nameKey: 'ability.water', icon: '💧', shape: 'line', range: 6, damage: 2, push: 2, colors: ['#38c7ff', '#e0f7ff', '#1b6fd8'] },
  poison: { id: 'poison', nameKey: 'ability.poison', icon: '☠️', shape: 'cone', range: 3, damage: 1, poisonMs: 3000, colors: ['#7dff3b', '#2fbf45', '#d4ff8a'] },
  prism: { id: 'prism', nameKey: 'ability.prism', icon: '🌈', shape: 'line', range: 7, damage: 1, confuseMs: 3000, bonusPerHit: 15, colors: ['#ff3b3b', '#ffd23f', '#3bff6a', '#3bc8ff', '#b03bff'] },
  roar: { id: 'roar', nameKey: 'ability.roar', icon: '🐯', shape: 'cone', range: 4, damage: 1, stunMs: 2000, fearMs: 4000, colors: ['#ffffff', '#ffb347', '#ff9a1f'] },
  tsunami: { id: 'tsunami', nameKey: 'ability.tsunami', icon: '🌊', shape: 'wide', range: 3, damage: 1, push: 3, colors: ['#00a6ff', '#5ee6ff', '#ffffff'] },
  leaves: { id: 'leaves', nameKey: 'ability.leaves', icon: '🍃', shape: 'cone', range: 4, damage: 2, steal: true, colors: ['#2ee59d', '#ffd23f', '#16a085'] },
  lava: { id: 'lava', nameKey: 'ability.lava', icon: '🌋', shape: 'line', range: 5, damage: 1, hazard: 'lava', hazardMs: 3000, colors: ['#ff5a1f', '#ffdd55', '#3a1a12'] },
  ice: { id: 'ice', nameKey: 'ability.ice', icon: '❄️', shape: 'cone', range: 4, damage: 1, freezeMs: 3000, colors: ['#e0fbff', '#9fdcff', '#ffffff'] },
  blackHole: { id: 'blackHole', nameKey: 'ability.blackHole', icon: '🌀', shape: 'point', range: 4, damage: 2, stunMs: 1500, pullFood: true, colors: ['#c04cff', '#7a5cff', '#0b0b3a', '#ffffff'] },
  lightning: { id: 'lightning', nameKey: 'ability.lightning', icon: '⚡', shape: 'chain', range: 7, damage: 2, bonusPerHit: 10, colors: ['#fff59d', '#ffd23f', '#ffffff'] },
  shadow: { id: 'shadow', nameKey: 'ability.shadow', icon: '🌑', shape: 'ring', range: 3, damage: 3, invisibleMs: 3000, colors: ['#6a1b9a', '#d500f9', '#120022'] },
  crystal: { id: 'crystal', nameKey: 'ability.crystal', icon: '💎', shape: 'fan', range: 5, damage: 2, hazard: 'spikes', hazardMs: 4000, colors: ['#9ff3ff', '#ffd6f5', '#ffffff'] },
  royal: { id: 'royal', nameKey: 'ability.royal', icon: '👑', shape: 'ring', range: 5, damage: 4, burnMs: 2000, stunAllMs: 2000, colors: ['#ffd23f', '#ff1f1f', '#ffffff', '#ff8c1a'] },
};
