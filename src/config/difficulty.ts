// Difficulty tuning. All times are in milliseconds of game time.
export type DifficultyId = 'easy' | 'normal' | 'hard' | 'extreme';

export interface DifficultyConfig {
  id: DifficultyId;
  /** Milliseconds per cell at the start of a run. */
  baseStepMs: number;
  /** Fastest the snake may ever move (before power-ups). */
  minStepMs: number;
  /** How much faster (ms per cell) each eaten food makes the snake. */
  rampMsPerFood: number;
  /** Step time multiplier applied for every completed loop through all zones. */
  loopSpeedFactor: number;
  /** Walls wrap around instead of killing. */
  wrapWalls: boolean;
  /** Number of static obstacle pieces per zone. */
  obstaclePieces: number;
  /** Number of moving (patrolling) single-cell obstacles. */
  movingObstacles: number;
  /** Chance (0..1) after eating an apple that a special item appears. */
  specialChance: number;
  /** Chance (0..1) after eating an apple that a poison item appears (0 = never). */
  poisonChance: number;
  goldenLifetimeMs: number;
  powerUpLifetimeMs: number;
  poisonLifetimeMs: number;
  /** Multiplier for power-up effect durations. */
  powerUpDurationFactor: number;
  /**
   * Combo window slack: the player has (distance to next apple + slack) steps
   * to keep the combo, where slack = (cols + rows) * comboSlackFactor.
   */
  comboSlackFactor: number;
}

export const DIFFICULTIES: Record<DifficultyId, DifficultyConfig> = {
  easy: {
    id: 'easy',
    baseStepMs: 190,
    minStepMs: 115,
    rampMsPerFood: 0.8,
    loopSpeedFactor: 0.93,
    wrapWalls: true,
    obstaclePieces: 0,
    movingObstacles: 0,
    specialChance: 0.35,
    poisonChance: 0,
    goldenLifetimeMs: 9000,
    powerUpLifetimeMs: 12000,
    poisonLifetimeMs: 0,
    powerUpDurationFactor: 1.2,
    comboSlackFactor: 0.5,
  },
  normal: {
    id: 'normal',
    baseStepMs: 150,
    minStepMs: 85,
    rampMsPerFood: 1.3,
    loopSpeedFactor: 0.9,
    wrapWalls: false,
    obstaclePieces: 4,
    movingObstacles: 0,
    specialChance: 0.3,
    poisonChance: 0,
    goldenLifetimeMs: 7000,
    powerUpLifetimeMs: 10000,
    poisonLifetimeMs: 0,
    powerUpDurationFactor: 1,
    comboSlackFactor: 0.35,
  },
  hard: {
    id: 'hard',
    baseStepMs: 115,
    minStepMs: 65,
    rampMsPerFood: 1.8,
    loopSpeedFactor: 0.88,
    wrapWalls: false,
    obstaclePieces: 7,
    movingObstacles: 0,
    specialChance: 0.3,
    poisonChance: 0.2,
    goldenLifetimeMs: 3500,
    powerUpLifetimeMs: 7000,
    poisonLifetimeMs: 9000,
    powerUpDurationFactor: 0.9,
    comboSlackFactor: 0.25,
  },
  extreme: {
    id: 'extreme',
    baseStepMs: 90,
    minStepMs: 50,
    rampMsPerFood: 2.2,
    loopSpeedFactor: 0.86,
    wrapWalls: false,
    obstaclePieces: 6,
    movingObstacles: 4,
    specialChance: 0.3,
    poisonChance: 0.35,
    goldenLifetimeMs: 2500,
    powerUpLifetimeMs: 5000,
    poisonLifetimeMs: 12000,
    powerUpDurationFactor: 0.75,
    comboSlackFactor: 0.15,
  },
};

export const DIFFICULTY_ORDER: DifficultyId[] = ['easy', 'normal', 'hard', 'extreme'];
