// Snake skins. `body` returns the fill color of segment i (0 = head) of n.
export type SkinId =
  | 'classic' | 'rainbow' | 'tiger' | 'neon' | 'candy' | 'ocean'
  | 'zebra' | 'lava' | 'galaxy' | 'cobra'
  | 'dragon' | 'dragonSea' | 'dragonJade' | 'dragonFrost' | 'dragonGold' | 'dragonShadow' | 'dragonCrystal' | 'dragonEmperor';

export interface SkinConfig {
  id: SkinId;
  nameKey: string;
  body: (i: number, n: number, timeMs: number) => string;
  head: string;
  outline: string;
  /** Optional soft glow drawn under the body. */
  glow?: string;
  eyeWhite: string;
  pupil: string;
  /** Self-glow strength (0..1) for the 3D body. */
  emissive?: number;
  /** Dragon extras (horns, spines, whiskers, scales...). */
  dragon?: DragonStyle;
  /** Total points (over all runs) needed to unlock; 0 / undefined = available from the start. */
  unlockAt?: number;
}

export interface DragonStyle {
  horn: string;
  spine: string;
  /** Horn length multiplier (1 = default). */
  hornSize?: number;
  /** Head size multiplier (1 = default). */
  headSize?: number;
  /** Long flowing whiskers from the snout (color), like an eastern dragon. */
  whiskers?: string;
  /** Scale plates along both sides of the body (color). */
  scales?: string;
  /** Fin-like frills on the sides of the head (default on). */
  frills?: boolean;
}

type RGB = [number, number, number];

const hex = (h: string): RGB => {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

/** Precomputed gradient lookup so per-frame color picks don't allocate new strings. */
function gradient(stops: string[], steps = 64): string[] {
  const rgb = stops.map(hex);
  const out: string[] = [];
  for (let s = 0; s < steps; s++) {
    const t = s / (steps - 1);
    const f = t * (rgb.length - 1);
    const k = Math.min(rgb.length - 2, Math.floor(f));
    const u = f - k;
    const a = rgb[k];
    const b = rgb[k + 1];
    out.push(
      `rgb(${Math.round(a[0] + (b[0] - a[0]) * u)},${Math.round(a[1] + (b[1] - a[1]) * u)},${Math.round(a[2] + (b[2] - a[2]) * u)})`,
    );
  }
  return out;
}

const pick = (lut: string[], t: number): string => lut[Math.min(lut.length - 1, Math.max(0, Math.round(t * (lut.length - 1))))];
const along = (i: number, n: number): number => (n <= 1 ? 0 : i / (n - 1));

const CLASSIC = gradient(['#5ef06a', '#2fbf45', '#1a8a33']);
const RAINBOW: string[] = Array.from({ length: 72 }, (_, k) => `hsl(${k * 5},95%,58%)`);
const TIGER = gradient(['#ffb347', '#ff9a1f', '#f07800']);
const NEON = gradient(['#00f0ff', '#7a5cff', '#ff2bd6']);
const CANDY = ['#ff6fb5', '#fff0f7', '#7ee8c7', '#fff0f7'];
const OCEAN = gradient(['#5ee6ff', '#00a6ff', '#0050a8']);
const DRAGON = gradient(['#ff3b1f', '#c8102e', '#8b0000', '#ff6a00']);
const JADE = gradient(['#2ee59d', '#16a085', '#0e6655', '#1abc9c']);
const FROST = gradient(['#f0fbff', '#9fdcff', '#4aa3d8', '#d6f1ff']);
const GOLD = gradient(['#fff59d', '#ffd23f', '#f39c12', '#ffe082']);
const SHADOW = gradient(['#5e2a9c', '#2d0a4e', '#120022', '#3d1470']);
const SEA = gradient(['#48e5d0', '#1b9fc4', '#0a5f8a', '#38c7e0']);
const LAVA = gradient(['#3a1a12', '#2a0f0a', '#4a1c10']);
const LAVA_GLOW = gradient(['#ffdd55', '#ff7a1a', '#ff3b1f']);
const GALAXY = gradient(['#7a5cff', '#2b1a6e', '#0b0b3a', '#3d1a6e', '#c04cff']);
const COBRA = gradient(['#6b7a2a', '#4a5d23', '#2f3d14']);
const CRYSTAL = gradient(['#ffd6f5', '#c9b8ff', '#9ff3ff', '#ffc4e8']);
const EMPEROR = gradient(['#2b2b2b', '#111111', '#3a2a10']);

export const SKINS: Record<SkinId, SkinConfig> = {
  classic: {
    id: 'classic', nameKey: 'skin.classic',
    body: (i, n) => pick(CLASSIC, along(i, n)),
    head: '#5ef06a', outline: '#0d5c1f', eyeWhite: '#ffffff', pupil: '#102010',
  },
  rainbow: {
    id: 'rainbow', nameKey: 'skin.rainbow',
    body: (i, _n, t) => RAINBOW[Math.floor(i * 3 + t / 40) % RAINBOW.length],
    head: '#ffffff', outline: '#3a1f5c', eyeWhite: '#ffffff', pupil: '#1d1033',
  },
  tiger: {
    id: 'tiger', nameKey: 'skin.tiger',
    body: (i, n) => (i % 4 === 2 ? '#2b1a0e' : pick(TIGER, along(i, n))),
    head: '#ffb347', outline: '#4a2606', eyeWhite: '#fff7d6', pupil: '#2b1a0e',
  },
  neon: {
    id: 'neon', nameKey: 'skin.neon',
    body: (i, n) => pick(NEON, along(i, n)),
    head: '#00f0ff', outline: '#14002e', glow: 'rgba(255,43,214,0.35)', eyeWhite: '#ffffff', pupil: '#14002e', emissive: 0.45,
  },
  candy: {
    id: 'candy', nameKey: 'skin.candy',
    body: (i) => CANDY[i % CANDY.length],
    head: '#ff6fb5', outline: '#9c2a64', eyeWhite: '#ffffff', pupil: '#4a0f2c',
  },
  ocean: {
    id: 'ocean', nameKey: 'skin.ocean',
    body: (i, n) => pick(OCEAN, along(i, n)),
    head: '#5ee6ff', outline: '#00274f', eyeWhite: '#ffffff', pupil: '#00142b',
  },
  dragon: {
    id: 'dragon', nameKey: 'skin.dragon',
    // Deep reds with darker scale bands, fading to fiery orange at the tail.
    body: (i, n) => (i % 3 === 1 ? '#a3121a' : pick(DRAGON, along(i, n))),
    head: '#d7261e', outline: '#3a0505', eyeWhite: '#ffd23f', pupil: '#2a0000',
    dragon: { horn: '#f5deb3', spine: '#ff8c1a' },
  },
  dragonSea: {
    id: 'dragonSea', nameKey: 'skin.dragonSea',
    // Free sea dragon: turquoise body, silver whiskers and scales, fin frills.
    body: (i, n) => (i % 3 === 1 ? '#0e4f74' : pick(SEA, along(i, n))),
    head: '#2ec4d6', outline: '#06324a', eyeWhite: '#fff6b0', pupil: '#002030',
    dragon: { horn: '#e0f7ff', spine: '#7ff0ff', hornSize: 0.9, whiskers: '#e0f7ff', scales: '#c8f4ff' },
  },
  zebra: {
    id: 'zebra', nameKey: 'skin.zebra', unlockAt: 300,
    body: (i) => (i % 2 === 0 ? '#f5f5f5' : '#1b1b1b'),
    head: '#f5f5f5', outline: '#000000', eyeWhite: '#ffffff', pupil: '#000000',
  },
  lava: {
    id: 'lava', nameKey: 'skin.lava', unlockAt: 1500,
    // Dark rock with glowing cracks that slowly flow down the body.
    body: (i, n, t) => ((i + Math.floor(t / 180)) % 4 === 0 ? pick(LAVA_GLOW, along(i, n)) : pick(LAVA, along(i, n))),
    head: '#ff7a1a', outline: '#1a0500', eyeWhite: '#ffdd55', pupil: '#3a0000', emissive: 0.25,
  },
  galaxy: {
    id: 'galaxy', nameKey: 'skin.galaxy', unlockAt: 3500,
    // Deep space colors with twinkling stars.
    body: (i, n, t) => ((i * 7 + Math.floor(t / 220)) % 9 === 0 ? '#ffffff' : pick(GALAXY, along(i, n))),
    head: '#7a5cff', outline: '#05021a', eyeWhite: '#ffffff', pupil: '#05021a', emissive: 0.2,
  },
  cobra: {
    id: 'cobra', nameKey: 'skin.cobra', unlockAt: 6500,
    body: (i, n) => (i % 5 === 0 ? '#f1c40f' : pick(COBRA, along(i, n))),
    head: '#6b7a2a', outline: '#1a2208', eyeWhite: '#ffe066', pupil: '#000000',
  },
  dragonJade: {
    id: 'dragonJade', nameKey: 'skin.dragonJade', unlockAt: 1000,
    // Eastern dragon: green-jade body, golden whiskers and scales, red mane.
    body: (i, n) => (i % 3 === 1 ? '#0b5345' : pick(JADE, along(i, n))),
    head: '#27ae60', outline: '#08382c', eyeWhite: '#ffd23f', pupil: '#1a1000',
    dragon: { horn: '#ffd23f', spine: '#ff5733', hornSize: 0.8, whiskers: '#ffd23f', scales: '#f1c40f', frills: false },
  },
  dragonFrost: {
    id: 'dragonFrost', nameKey: 'skin.dragonFrost', unlockAt: 2500,
    body: (i, n) => (i % 3 === 1 ? '#bfe9ff' : pick(FROST, along(i, n))),
    head: '#d6f1ff', outline: '#1c5f8a', eyeWhite: '#5ee6ff', pupil: '#00224a', emissive: 0.15,
    dragon: { horn: '#ffffff', spine: '#7cc8f5', hornSize: 1.45, scales: '#ffffff' },
  },
  dragonGold: {
    id: 'dragonGold', nameKey: 'skin.dragonGold', unlockAt: 5000,
    body: (i, n) => (i % 3 === 1 ? '#e67e22' : pick(GOLD, along(i, n))),
    head: '#ffd23f', outline: '#7a4a00', eyeWhite: '#ffffff', pupil: '#7a0000',
    dragon: { horn: '#8b4513', spine: '#ff3b3b', hornSize: 1.2, headSize: 1.15, whiskers: '#ff3b3b', scales: '#fff3c4' },
  },
  dragonShadow: {
    id: 'dragonShadow', nameKey: 'skin.dragonShadow', unlockAt: 9000,
    body: (i, n) => (i % 3 === 1 ? '#7b1fa2' : pick(SHADOW, along(i, n))),
    head: '#2d0a4e', outline: '#000000', eyeWhite: '#ff1744', pupil: '#2a0000', emissive: 0.2,
    dragon: { horn: '#b388ff', spine: '#d500f9', hornSize: 1.5, headSize: 1.2, whiskers: '#d500f9', scales: '#6a1b9a' },
  },
  dragonCrystal: {
    id: 'dragonCrystal', nameKey: 'skin.dragonCrystal', unlockAt: 12000,
    body: (i, n, t) => (i % 3 === 1 ? '#ffffff' : pick(CRYSTAL, (along(i, n) + t / 6000) % 1)),
    head: '#ffd6f5', outline: '#6a4c9c', eyeWhite: '#9ff3ff', pupil: '#2a0a4e', emissive: 0.3,
    dragon: { horn: '#9ff3ff', spine: '#ff9ff3', hornSize: 1.7, headSize: 1.1, whiskers: '#ffffff', scales: '#e0fbff' },
  },
  dragonEmperor: {
    id: 'dragonEmperor', nameKey: 'skin.dragonEmperor', unlockAt: 20000,
    body: (i, n) => (i % 3 === 1 ? '#d4a017' : pick(EMPEROR, along(i, n))),
    head: '#1a1a1a', outline: '#000000', eyeWhite: '#ffd23f', pupil: '#8b0000',
    dragon: { horn: '#ffd23f', spine: '#ff1f1f', hornSize: 1.9, headSize: 1.3, whiskers: '#ff1f1f', scales: '#ffd23f' },
  },
};

export const SKIN_ORDER: SkinId[] = [
  'classic', 'dragon', 'dragonSea', 'rainbow', 'tiger', 'neon', 'candy', 'ocean',
  // Unlocked by total points, cheapest first.
  'zebra', 'dragonJade', 'lava', 'dragonFrost', 'galaxy', 'dragonGold', 'cobra', 'dragonShadow', 'dragonCrystal', 'dragonEmperor',
];

/** Skins the player can pick with this many total points. */
export const isUnlocked = (id: SkinId, totalPoints: number): boolean => totalPoints >= (SKINS[id].unlockAt ?? 0);
