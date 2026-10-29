// Responsive board layout: pick grid dimensions for a run and fit the board
// into the available screen space without stretching.

/** Cells along the short side of the board. */
export const PHONE_SHORT_CELLS = 17;
export const TABLET_SHORT_CELLS = 21;
/** Screens whose short side exceeds this (CSS px) are treated as tablets. */
export const TABLET_MIN_SHORT_SIDE = 600;

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface LayoutInput {
  /** Viewport size in CSS px. */
  width: number;
  height: number;
  safe: Insets;
  /** Height reserved for the HUD bar (CSS px, excluding safe area). */
  hudHeight: number;
  /** Space reserved for the on-screen D-pad, or null when disabled. */
  dpad: { side: 'left' | 'right'; size: number } | null;
  dpr: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BoardLayout {
  /** Area the board may occupy. */
  area: Rect;
  /** Where the D-pad goes (if enabled). */
  dpadRect: Rect | null;
  /** True when the D-pad sits beside the board (landscape) instead of below it. */
  dpadBeside: boolean;
}

const PADDING = 8;

export function isTablet(width: number, height: number): boolean {
  return Math.min(width, height) > TABLET_MIN_SHORT_SIDE;
}

/** Splits the screen into HUD, board area and D-pad area. */
export function computeLayout(input: LayoutInput): BoardLayout {
  const { width, height, safe, hudHeight, dpad } = input;
  let x = safe.left + PADDING;
  let y = safe.top + hudHeight + PADDING;
  let w = width - safe.left - safe.right - PADDING * 2;
  let h = height - y - safe.bottom - PADDING;
  let dpadRect: Rect | null = null;
  let dpadBeside = false;

  if (dpad) {
    const landscape = w > h;
    if (landscape) {
      dpadBeside = true;
      const dw = dpad.size + PADDING;
      if (dpad.side === 'left') {
        dpadRect = { x, y: y + h - dpad.size, w: dpad.size, h: dpad.size };
        x += dw;
      } else {
        dpadRect = { x: x + w - dpad.size, y: y + h - dpad.size, w: dpad.size, h: dpad.size };
      }
      w -= dw;
    } else {
      const dh = dpad.size + PADDING;
      h -= dh;
      const dx = dpad.side === 'left' ? x : x + w - dpad.size;
      dpadRect = { x: dx, y: y + h + PADDING, w: dpad.size, h: dpad.size };
    }
  }

  return { area: { x, y, w: Math.max(0, w), h: Math.max(0, h) }, dpadRect, dpadBeside };
}

/**
 * Chooses grid dimensions for a new run so that the short side has ~17 cells
 * on phones (~21 on tablets) and the long side gets as many square cells as fit.
 */
export function chooseGridDims(area: Rect, tablet: boolean): { cols: number; rows: number } {
  const shortCells = tablet ? TABLET_SHORT_CELLS : PHONE_SHORT_CELLS;
  const shortSide = Math.min(area.w, area.h);
  const longSide = Math.max(area.w, area.h);
  if (shortSide <= 0) return { cols: shortCells, rows: shortCells };
  const cell = shortSide / shortCells;
  const longCells = Math.max(shortCells, Math.floor(longSide / cell));
  return area.w >= area.h ? { cols: longCells, rows: shortCells } : { cols: shortCells, rows: longCells };
}

/**
 * Fits a cols x rows board into the area, centered, with square cells snapped
 * to whole device pixels so grid lines stay crisp.
 */
export function fitBoard(area: Rect, cols: number, rows: number, dpr: number): Rect & { cell: number } {
  const raw = Math.min(area.w / cols, area.h / rows);
  const cell = Math.max(4 / dpr, Math.floor(raw * dpr) / dpr);
  const w = cell * cols;
  const h = cell * rows;
  const x = Math.round((area.x + (area.w - w) / 2) * dpr) / dpr;
  const y = Math.round((area.y + (area.h - h) / 2) * dpr) / dpr;
  return { x, y, w, h, cell };
}
