// localStorage persistence for settings and high scores. Every access is
// wrapped so the game still works when storage is unavailable.
import type { DifficultyId } from '../config/difficulty';
import type { BoardSize } from '../core/grid';
import type { Lang } from '../config/i18n';
import type { ModeId } from '../config/modes';
import { isSkinId, type SkinId } from '../config/skins';

export interface Settings {
  /** 0..1 */
  volume: number;
  muted: boolean;
  haptics: boolean;
  skin: SkinId;
  lang: Lang;
  dpad: boolean;
  dpadSide: 'left' | 'right';
  mode: ModeId;
  difficulty: DifficultyId;
  /** Zoom: how big cells look on screen. */
  boardSize: BoardSize;
  /** -1 = journey through all worlds, otherwise the index of the only world to play in. */
  world: number;
}

export const DEFAULT_SETTINGS: Settings = {
  volume: 0.8,
  muted: false,
  haptics: true,
  skin: 'dragon',
  lang: 'ar',
  dpad: false,
  dpadSide: 'right',
  mode: 'classic',
  difficulty: 'normal',
  boardSize: 'large',
  world: -1,
};

const SETTINGS_KEY = 'snakerush.settings.v1';
const SCORES_KEY = 'snakerush.scores.v1';

/** Minimal storage interface (lets tests inject a fake). */
export interface KV {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultKV(): KV | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function readJson<T>(kv: KV | null, key: string): Partial<T> | null {
  try {
    const raw = kv?.getItem(key);
    if (!raw) return null;
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as Partial<T>) : null;
  } catch {
    return null;
  }
}

function writeJson(kv: KV | null, key: string, value: unknown): void {
  try {
    kv?.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

export function loadSettings(kv: KV | null = defaultKV()): Settings {
  const saved = readJson<Settings>(kv, SETTINGS_KEY) ?? {};
  const s: Settings = { ...DEFAULT_SETTINGS };
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const v = saved[k];
    if (v !== undefined && typeof v === typeof DEFAULT_SETTINGS[k]) (s as unknown as Record<string, unknown>)[k] = v;
  }
  s.volume = Math.min(1, Math.max(0, Number(s.volume) || 0));
  // Skins that no longer exist fall back to the red dragon.
  if (!isSkinId(s.skin)) s.skin = DEFAULT_SETTINGS.skin;
  return s;
}

export function saveSettings(s: Settings, kv: KV | null = defaultKV()): void {
  writeJson(kv, SETTINGS_KEY, s);
}

export const scoreKey = (mode: ModeId, diff: DifficultyId): string => `${mode}:${diff}`;

export function loadScores(kv: KV | null = defaultKV()): Record<string, number> {
  const raw = readJson<Record<string, number>>(kv, SCORES_KEY) ?? {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  return out;
}

/** Records a score; returns true when it is a new best for that mode + difficulty. */
export function submitScore(mode: ModeId, diff: DifficultyId, score: number, kv: KV | null = defaultKV()): boolean {
  const scores = loadScores(kv);
  const key = scoreKey(mode, diff);
  if (score <= (scores[key] ?? 0)) return false;
  scores[key] = score;
  writeJson(kv, SCORES_KEY, scores);
  return true;
}

const PROGRESS_KEY = 'snakerush.progress.v1';

/** Points collected over all runs (unlocks skins). */
export function totalPoints(kv: KV | null = defaultKV()): number {
  const v = readJson<{ total: number }>(kv, PROGRESS_KEY)?.total;
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0;
}

/** Adds a run's score to the total; returns the new total. */
export function addPoints(points: number, kv: KV | null = defaultKV()): number {
  const total = totalPoints(kv) + Math.max(0, Math.round(points));
  writeJson(kv, PROGRESS_KEY, { total });
  return total;
}

export function bestScore(mode: ModeId, diff: DifficultyId, kv: KV | null = defaultKV()): number {
  return loadScores(kv)[scoreKey(mode, diff)] ?? 0;
}

const DRAGONS_KEY = 'snakerush.dragons.v1';

/** Experience of every dragon (the score of each run played with it). */
export function loadDragonXp(kv: KV | null = defaultKV()): Record<string, number> {
  const raw = readJson<Record<string, number>>(kv, DRAGONS_KEY) ?? {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = v;
  return out;
}

export function dragonXp(skin: SkinId, kv: KV | null = defaultKV()): number {
  return loadDragonXp(kv)[skin] ?? 0;
}

/** Adds a run's score to that dragon's experience; returns the new total. */
export function addDragonXp(skin: SkinId, points: number, kv: KV | null = defaultKV()): number {
  const all = loadDragonXp(kv);
  all[skin] = (all[skin] ?? 0) + Math.max(0, Math.round(points));
  writeJson(kv, DRAGONS_KEY, all);
  return all[skin];
}
