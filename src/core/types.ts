export interface Vec {
  x: number;
  y: number;
}

/** 0 = up, 1 = right, 2 = down, 3 = left */
export type Dir = 0 | 1 | 2 | 3;

export const DIRS: readonly Vec[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

export const isOpposite = (a: Dir, b: Dir): boolean => (a + 2) % 4 === b;

export const sameCell = (a: Vec, b: Vec): boolean => a.x === b.x && a.y === b.y;

export const chebyshev = (a: Vec, b: Vec): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export const manhattan = (a: Vec, b: Vec): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
