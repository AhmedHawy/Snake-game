// Snake skins. `body` returns the fill color of segment i (0 = head) of n.
export type SkinId = 'classic' | 'rainbow' | 'tiger' | 'neon' | 'candy' | 'ocean' | 'dragon';

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
  /** Dragon extras: horns and spines along the back. */
  dragon?: { horn: string; spine: string };
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
};

export const SKIN_ORDER: SkinId[] = ['classic', 'dragon', 'rainbow', 'tiger', 'neon', 'candy', 'ocean'];
