export type ModeId = 'classic' | 'portal' | 'zen' | 'timeAttack';

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
}

export const MODES: Record<ModeId, ModeConfig> = {
  classic: { id: 'classic', zones: true, portalPairs: 0, noDeath: false, obstacles: true, timeLimitMs: 0 },
  portal: { id: 'portal', zones: true, portalPairs: 2, noDeath: false, obstacles: true, timeLimitMs: 0 },
  zen: { id: 'zen', zones: true, portalPairs: 0, noDeath: true, obstacles: false, timeLimitMs: 0 },
  timeAttack: { id: 'timeAttack', zones: true, portalPairs: 0, noDeath: false, obstacles: true, timeLimitMs: 60000 },
};

export const MODE_ORDER: ModeId[] = ['classic', 'portal', 'zen', 'timeAttack'];

export const PORTAL_COLORS = ['#ff9f1c', '#2ec4b6', '#ff5ccd', '#a3e635'];
