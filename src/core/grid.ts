// Responsive layout: splits the screen into HUD, play area and D-pad area,
// and maps the zoom setting to how many cells are visible.

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

export type BoardSize = 'small' | 'normal' | 'large';

/**
 * Cells visible across the short side of the view for the zoom setting.
 * "large" means big cells (closest camera); tablets show a few more cells.
 */
export function visibleShortCells(size: BoardSize, tablet: boolean): number {
  const phone = { large: 11, normal: 15, small: 19 }[size] ?? 11;
  return tablet ? phone + 4 : phone;
}
