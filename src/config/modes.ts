export type ModeId = 'classic' | 'portal' | 'zen' | 'timeAttack' | 'rivals';

export interface ModeConfig {
  id: ModeId;
  /** Environments change as the player progresses. */
  zones: boolean;
  /** Linked portal pairs on the board. */
  portalPairs: number;
  /** No death from walls or own body (walls wrap). */
  noDeath: boolean;
  /** Static/moving obstacles are used. */
  obstacles: boolean;
  /** Run length limit, 0 = unlimited. */
  timeLimitMs: number;
  /**
   * Rival snakes: 'lethal' = the longer snake wins a collision,
   * 'harmless' = they pass through each other.
   */
  rivals: 'none' | 'lethal' | 'harmless';
}

export const MODES: Record<ModeId, ModeConfig> = {
  classic: { id: 'classic', zones: true, portalPairs: 0, noDeath: false, obstacles: true, timeLimitMs: 0, rivals: 'none' },
  rivals: { id: 'rivals', zones: true, portalPairs: 0, noDeath: false, obstacles: true, timeLimitMs: 0, rivals: 'lethal' },
  portal: { id: 'portal', zones: true, portalPairs: 2, noDeath: false, obstacles: true, timeLimitMs: 0, rivals: 'none' },
  zen: { id: 'zen', zones: true, portalPairs: 0, noDeath: true, obstacles: false, timeLimitMs: 0, rivals: 'harmless' },
  timeAttack: { id: 'timeAttack', zones: true, portalPairs: 0, noDeath: false, obstacles: true, timeLimitMs: 60000, rivals: 'none' },
};

export const MODE_ORDER: ModeId[] = ['classic', 'rivals', 'portal', 'zen', 'timeAttack'];

export const PORTAL_COLORS = ['#ff9f1c', '#2ec4b6', '#ff5ccd', '#a3e635'];
