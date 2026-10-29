import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, bestScore, loadSettings, saveSettings, submitScore, type KV } from '../src/storage/storage';

const memory = (): KV => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) };
};

describe('storage', () => {
  it('returns defaults when empty or corrupted', () => {
    const kv = memory();
    expect(loadSettings(kv)).toEqual(DEFAULT_SETTINGS);
    kv.setItem('snakerush.settings.v1', '{not json');
    expect(loadSettings(kv)).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips settings and ignores wrong types', () => {
    const kv = memory();
    saveSettings({ ...DEFAULT_SETTINGS, volume: 0.3, muted: true, lang: 'en', skin: 'neon' }, kv);
    const s = loadSettings(kv);
    expect(s.volume).toBe(0.3);
    expect(s.muted).toBe(true);
    expect(s.lang).toBe('en');
    expect(s.skin).toBe('neon');
    kv.setItem('snakerush.settings.v1', JSON.stringify({ volume: 'loud', haptics: 'yes' }));
    expect(loadSettings(kv).volume).toBe(DEFAULT_SETTINGS.volume);
    expect(loadSettings(kv).haptics).toBe(DEFAULT_SETTINGS.haptics);
  });

  it('keeps separate high scores per mode and difficulty', () => {
    const kv = memory();
    expect(submitScore('classic', 'easy', 100, kv)).toBe(true);
    expect(submitScore('classic', 'easy', 50, kv)).toBe(false);
    expect(submitScore('classic', 'hard', 30, kv)).toBe(true);
    expect(submitScore('zen', 'easy', 10, kv)).toBe(true);
    expect(bestScore('classic', 'easy', kv)).toBe(100);
    expect(bestScore('classic', 'hard', kv)).toBe(30);
    expect(bestScore('portal', 'easy', kv)).toBe(0);
  });
});
