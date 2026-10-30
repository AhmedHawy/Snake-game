// Dragon levels: every run adds its score as experience to the dragon that
// played it. Higher levels make that dragon's breath stronger.
import type { AbilityConfig } from './abilities';

/** Experience needed for levels 1..5. */
export const LEVEL_XP = [0, 500, 1500, 3500, 7000];
export const MAX_LEVEL = LEVEL_XP.length;

export function levelFor(xp: number): number {
  let level = 1;
  for (let i = 1; i < LEVEL_XP.length; i++) if (xp >= LEVEL_XP[i]) level = i + 1;
  return level;
}

/** Experience needed for the next level (null at the top level). */
export function nextLevelXp(level: number): number | null {
  return level < MAX_LEVEL ? LEVEL_XP[level] : null;
}

/**
 * The breath at a given level: +1 range at levels 2 and 4, +1 damage at
 * levels 3 and 5, and every status effect lasts 10% longer per level.
 */
export function boostAbility(ab: AbilityConfig, level: number): AbilityConfig {
  if (level <= 1) return ab;
  const time = 1 + 0.1 * (level - 1);
  const ms = (v?: number) => (v ? Math.round(v * time) : v);
  return {
    ...ab,
    range: ab.range + (level >= 2 ? 1 : 0) + (level >= 4 ? 1 : 0),
    damage: ab.damage + (level >= 3 ? 1 : 0) + (level >= 5 ? 1 : 0),
    burnMs: ms(ab.burnMs),
    poisonMs: ms(ab.poisonMs),
    freezeMs: ms(ab.freezeMs),
    stunMs: ms(ab.stunMs),
    confuseMs: ms(ab.confuseMs),
    fearMs: ms(ab.fearMs),
    hazardMs: ms(ab.hazardMs),
    invisibleMs: ms(ab.invisibleMs),
    stunAllMs: ms(ab.stunAllMs),
    markMs: ms(ab.markMs),
  };
}
