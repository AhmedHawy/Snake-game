import type { Vec } from '../core/types';

export type AmbientKind = 'leaves' | 'sand' | 'bubbles' | 'snow' | 'embers' | 'neon' | 'stars';
export type ObstacleStyle = 'rock' | 'cactus' | 'coral' | 'ice' | 'lava' | 'neon' | 'asteroid';
export type BoardPattern = 'grass' | 'dunes' | 'waves' | 'frost' | 'cracks' | 'grid' | 'starfield';

export interface ZonePalette {
  /** Screen color around the board. */
  backdrop: string;
  /** Checkerboard colors. */
  boardA: string;
  boardB: string;
  /** Color of the background pattern details. */
  pattern: string;
  /** Board border. */
  border: string;
  obstacle: string;
  obstacleLight: string;
  obstacleDark: string;
  /** Ambient particle colors. */
  ambient: string[];
  /** UI accent (banner, HUD highlights). */
  accent: string;
}

export interface ZoneConfig {
  id: string;
  /** i18n key for the zone name. */
  nameKey: string;
  palette: ZonePalette;
  pattern: BoardPattern;
  ambient: AmbientKind;
  /** Number of ambient particles at a 17x30 board (scaled with board area). */
  ambientCount: number;
  obstacleStyle: ObstacleStyle;
  /** Obstacle piece shapes as cell offsets (randomly rotated when placed). */
  obstacleShapes: Vec[][];
}

/** Foods (apples + golden apples) needed to advance to the next zone. */
export const FOODS_PER_ZONE = 10;

const SINGLE: Vec[] = [{ x: 0, y: 0 }];
const PAIR: Vec[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
const LINE3: Vec[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
const SQUARE: Vec[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }];
const ELL: Vec[] = [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }];
const TEE: Vec[] = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 1, y: 1 }];

export const ZONES: ZoneConfig[] = [
  {
    id: 'meadow',
    nameKey: 'zone.meadow',
    palette: {
      backdrop: '#0f3d1e', boardA: '#7ed957', boardB: '#72cf4c', pattern: '#5fb83c', border: '#2f7d2a',
      obstacle: '#8d99a6', obstacleLight: '#c3ccd6', obstacleDark: '#56606b',
      ambient: ['#4caf50', '#8bc34a', '#cddc39', '#2e7d32'], accent: '#b9f27c',
    },
    pattern: 'grass', ambient: 'leaves', ambientCount: 18,
    obstacleStyle: 'rock', obstacleShapes: [SINGLE, PAIR, SQUARE],
  },
  {
    id: 'desert',
    nameKey: 'zone.desert',
    palette: {
      backdrop: '#5c3a12', boardA: '#f4d58d', boardB: '#ecc977', pattern: '#dcb562', border: '#b9853a',
      obstacle: '#2f9e44', obstacleLight: '#69db7c', obstacleDark: '#1b6e2c',
      ambient: ['#e9c46a', '#f4a261', '#fff1c1'], accent: '#ffd166',
    },
    pattern: 'dunes', ambient: 'sand', ambientCount: 45,
    obstacleStyle: 'cactus', obstacleShapes: [SINGLE, PAIR, ELL],
  },
  {
    id: 'ocean',
    nameKey: 'zone.ocean',
    palette: {
      backdrop: '#021a33', boardA: '#0a4d6e', boardB: '#0b5577', pattern: '#1b7aa0', border: '#06324a',
      obstacle: '#ff6f91', obstacleLight: '#ffb3c6', obstacleDark: '#c2185b',
      ambient: ['#bdf3ff', '#7fdbff', '#e0fbff'], accent: '#5ee6ff',
    },
    pattern: 'waves', ambient: 'bubbles', ambientCount: 26,
    obstacleStyle: 'coral', obstacleShapes: [SINGLE, ELL, TEE],
  },
  {
    id: 'snow',
    nameKey: 'zone.snow',
    palette: {
      backdrop: '#9cc7e6', boardA: '#f4fbff', boardB: '#e5f3fc', pattern: '#cfe6f5', border: '#8fbadb',
      obstacle: '#8fd3ff', obstacleLight: '#e8f7ff', obstacleDark: '#4aa3d8',
      ambient: ['#ffffff', '#eaf6ff'], accent: '#ffffff',
    },
    pattern: 'frost', ambient: 'snow', ambientCount: 55,
    obstacleStyle: 'ice', obstacleShapes: [SINGLE, PAIR, SQUARE, LINE3],
  },
  {
    id: 'volcano',
    nameKey: 'zone.volcano',
    palette: {
      backdrop: '#1a0503', boardA: '#3b0f0a', boardB: '#43130c', pattern: '#ff5a1f', border: '#120302',
      obstacle: '#2b2522', obstacleLight: '#5a4a44', obstacleDark: '#0e0b0a',
      ambient: ['#ff7b00', '#ffb000', '#ff3d00'], accent: '#ff8a3d',
    },
    pattern: 'cracks', ambient: 'embers', ambientCount: 40,
    obstacleStyle: 'lava', obstacleShapes: [SINGLE, PAIR, ELL, SQUARE],
  },
  {
    id: 'neon',
    nameKey: 'zone.neon',
    palette: {
      backdrop: '#05010f', boardA: '#0d0721', boardB: '#110a29', pattern: '#00f0ff', border: '#ff2bd6',
      obstacle: '#1b0f33', obstacleLight: '#ff2bd6', obstacleDark: '#00f0ff',
      ambient: ['#ff2bd6', '#00f0ff', '#fff200'], accent: '#ff4fe0',
    },
    pattern: 'grid', ambient: 'neon', ambientCount: 14,
    obstacleStyle: 'neon', obstacleShapes: [PAIR, LINE3, ELL],
  },
  {
    id: 'space',
    nameKey: 'zone.space',
    palette: {
      backdrop: '#000004', boardA: '#0a0b1e', boardB: '#0c0d23', pattern: '#ffffff', border: '#2b2d6e',
      obstacle: '#8a7f73', obstacleLight: '#c9bfb2', obstacleDark: '#4a433c',
      ambient: ['#ffffff', '#cfd8ff', '#ffe9b3'], accent: '#a5b4ff',
    },
    pattern: 'starfield', ambient: 'stars', ambientCount: 60,
    obstacleStyle: 'asteroid', obstacleShapes: [SINGLE, SINGLE, SQUARE],
  },
];
