// Overlay screens: main menu, mode, difficulty, skins, settings, high scores,
// pause and game over. Pure DOM; re-rendered on language change.
import { DIFFICULTY_ORDER, type DifficultyId } from '../config/difficulty';
import { t, type I18nKey, type Lang } from '../config/i18n';
import { MODE_ORDER, type ModeId } from '../config/modes';
import type { BoardSize } from '../core/grid';
import { SKINS, SKIN_ORDER, isUnlocked, type SkinId } from '../config/skins';
import { ZONES } from '../config/zones';
import { drawSkinPreview } from '../render/preview';
import { ABILITIES } from '../config/abilities';
import { LEVEL_XP, MAX_LEVEL, levelFor, nextLevelXp } from '../config/levels';
import type { Settings } from '../storage/storage';
import { ICONS, h } from './dom';

export interface GameOverStats {
  score: number;
  best: number;
  newBest: boolean;
  foods: number;
  longestCombo: number;
  zoneKey: I18nKey;
  loop: number;
  reason: 'crash' | 'timeUp' | 'ended';
  /** Rivals defeated (rival modes only). */
  rivalsKilled?: number;
  /** Rivals beaten by the ally. */
  allyKills?: number;
  /** The dragon reached a new level this run. */
  levelUp?: { skin: SkinId; level: number };
  /** Skins unlocked by this run's points. */
  unlocked: SkinId[];
}

export interface UiHost {
  readonly settings: Settings;
  play(): void;
  resume(): void;
  restart(): void;
  toMenu(): void;
  /** Ends the run on purpose, records the score and shows the summary. */
  endRun(): void;
  updateSettings(patch: Partial<Settings>): void;
  tap(): void;
  bestFor(mode: ModeId, diff: DifficultyId): number;
  /** Points collected over all runs (unlocks skins). */
  totalPoints(): number;
  /** A dragon's experience (its level makes its breath stronger). */
  dragonXp(id: SkinId): number;
  /** An exit button is only offered inside the installed Android app. */
  readonly canExit: boolean;
  exit(): void;
}

export type ScreenId = 'none' | 'main' | 'mode' | 'difficulty' | 'world' | 'skins' | 'settings' | 'scores' | 'pause' | 'over';

const MODE_ICONS: Record<ModeId, string> = { classic: '🐍', rivals: '⚔️', portal: '🌀', zen: '🧘', timeAttack: '⏱️' };
const ZONE_ICONS = ['🌳', '🌵', '🐠', '⛄', '🌋', '🏙️', '🪐'];
const DIFF_ICONS: Record<DifficultyId, string> = { easy: '🌱', normal: '⭐', hard: '🔥', extreme: '💀' };

export class Screens {
  current: ScreenId = 'none';
  /** Screen to return to from settings (main menu or pause). */
  private settingsReturn: ScreenId = 'main';
  private lastOver: GameOverStats | null = null;
  private previewRaf = 0;

  constructor(private readonly root: HTMLElement, private readonly host: UiHost) {}

  /** Back button: returns true when handled by the overlay. */
  back(): boolean {
    switch (this.current) {
      case 'mode':
      case 'difficulty':
      case 'world':
      case 'skins':
      case 'scores':
        this.tapThen(() => this.show('main'));
        return true;
      case 'settings':
        this.tapThen(() => this.show(this.settingsReturn));
        return true;
      case 'pause':
        this.host.resume();
        return true;
      case 'over':
        this.host.toMenu();
        return true;
      default:
        return false;
    }
  }

  refresh(): void {
    if (this.current !== 'none') this.show(this.current, this.lastOver ?? undefined);
  }

  hide(): void {
    this.current = 'none';
    cancelAnimationFrame(this.previewRaf);
    this.root.replaceChildren();
    this.root.className = '';
  }

  show(id: ScreenId, stats?: GameOverStats): void {
    cancelAnimationFrame(this.previewRaf);
    if (id === 'settings' && this.current !== 'settings') this.settingsReturn = this.current === 'pause' ? 'pause' : 'main';
    this.current = id;
    if (stats) this.lastOver = stats;
    let panel: HTMLElement;
    switch (id) {
      case 'main':
        panel = this.main();
        break;
      case 'mode':
        panel = this.modePicker();
        break;
      case 'difficulty':
        panel = this.difficultyPicker();
        break;
      case 'world':
        panel = this.worldPicker();
        break;
      case 'skins':
        panel = this.skinPicker();
        break;
      case 'settings':
        panel = this.settingsPanel();
        break;
      case 'scores':
        panel = this.scoresPanel();
        break;
      case 'pause':
        panel = this.pausePanel();
        break;
      case 'over':
        panel = this.overPanel(this.lastOver!);
        break;
      default:
        this.hide();
        return;
    }
    this.root.className = `show screen-${id}`;
    this.root.replaceChildren(panel);
  }

  private tapThen(fn: () => void): void {
    this.host.tap();
    fn();
  }

  private button(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
    return h('button', { class: `btn ${cls}`, text: label, onClick: () => this.tapThen(onClick) });
  }

  private header(titleKey: I18nKey, backTo: ScreenId): HTMLElement {
    return h(
      'div',
      { class: 'panel-head' },
      h('button', {
        class: 'icon-btn back-btn',
        html: ICONS.back,
        attrs: { 'aria-label': t('menu.back') },
        onClick: () => this.tapThen(() => this.show(backTo)),
      }),
      h('h2', { text: t(titleKey) }),
    );
  }

  private main(): HTMLElement {
    const s = this.host.settings;
    const chips = h(
      'div',
      { class: 'chips' },
      h('span', { class: 'chip', text: `${MODE_ICONS[s.mode]} ${t(`mode.${s.mode}` as I18nKey)}` }),
      h('span', { class: 'chip', text: `${DIFF_ICONS[s.difficulty]} ${t(`diff.${s.difficulty}` as I18nKey)}` }),
      h('span', { class: 'chip', text: this.worldLabel() }),
    );
    const best = this.host.bestFor(s.mode, s.difficulty);
    return h(
      'div',
      { class: 'panel menu' },
      h('h1', { class: 'logo', text: t('app.title') }),
      chips,
      best > 0 ? h('div', { class: 'menu-best', text: `🏆 ${t('hud.best')}: ${best}` }) : null,
      this.button(t('menu.play'), () => this.host.play(), 'btn-play'),
      h(
        'div',
        { class: 'grid2' },
        this.button(`${MODE_ICONS[s.mode]} ${t('menu.mode')}`, () => this.show('mode')),
        this.button(`${DIFF_ICONS[s.difficulty]} ${t('menu.difficulty')}`, () => this.show('difficulty')),
        this.button(`${s.world >= 0 ? ZONE_ICONS[s.world] : '🌍'} ${t('menu.world')}`, () => this.show('world')),
        this.button(`🎨 ${t('menu.skins')}`, () => this.show('skins')),
        this.button(`⚙️ ${t('menu.settings')}`, () => this.show('settings')),
        this.button(`🏆 ${t('menu.highScores')}`, () => this.show('scores')),
      ),
      this.host.canExit ? this.button(`🚪 ${t('menu.exit')}`, () => this.host.exit(), 'btn-exit') : null,
    );
  }

  private worldLabel(): string {
    const w = this.host.settings.world;
    return w >= 0 && ZONES[w] ? `${ZONE_ICONS[w]} ${t(ZONES[w].nameKey as I18nKey)}` : `🌍 ${t('world.journey')}`;
  }

  private worldPicker(): HTMLElement {
    const s = this.host.settings;
    const pick = (w: number) => {
      this.host.updateSettings({ world: w });
      this.show('main');
    };
    return h(
      'div',
      { class: 'panel' },
      this.header('menu.world', 'main'),
      h(
        'div',
        { class: 'cards' },
        this.card('🌍', t('world.journey'), t('world.journey.desc'), s.world < 0, () => pick(-1)),
        ...ZONES.map((z, i) => this.card(ZONE_ICONS[i], t(z.nameKey as I18nKey), t('world.only'), s.world === i, () => pick(i))),
      ),
    );
  }

  private card(icon: string, title: string, desc: string, selected: boolean, onClick: () => void): HTMLElement {
    return h(
      'button',
      { class: `card${selected ? ' selected' : ''}`, onClick: () => this.tapThen(onClick), attrs: { 'aria-pressed': String(selected) } },
      h('span', { class: 'card-icon', text: icon }),
      h('span', { class: 'card-text' }, h('strong', { text: title }), h('small', { text: desc })),
    );
  }

  private modePicker(): HTMLElement {
    const s = this.host.settings;
    return h(
      'div',
      { class: 'panel' },
      this.header('menu.mode', 'main'),
      h(
        'div',
        { class: 'cards' },
        ...MODE_ORDER.map((m) =>
          this.card(MODE_ICONS[m], t(`mode.${m}` as I18nKey), t(`mode.${m}.desc` as I18nKey), s.mode === m, () => {
            this.host.updateSettings({ mode: m });
            this.show('main');
          }),
        ),
      ),
    );
  }

  private difficultyPicker(): HTMLElement {
    const s = this.host.settings;
    return h(
      'div',
      { class: 'panel' },
      this.header('menu.difficulty', 'main'),
      h(
        'div',
        { class: 'cards' },
        ...DIFFICULTY_ORDER.map((d) =>
          this.card(DIFF_ICONS[d], t(`diff.${d}` as I18nKey), t(`diff.${d}.desc` as I18nKey), s.difficulty === d, () => {
            this.host.updateSettings({ difficulty: d });
            this.show('main');
          }),
        ),
      ),
    );
  }

  private skinPicker(): HTMLElement {
    // [canvas, skin, unlocked]: locked dragons stay still until they unlock.
    const canvases: [HTMLCanvasElement, SkinId, boolean][] = [];
    const grid = h('div', { class: 'skins' });
    const total = this.host.totalPoints();
    const render = () => {
      grid.replaceChildren(
        ...SKIN_ORDER.map((id) => {
          const cv = h('canvas', { class: 'skin-canvas' });
          const open = isUnlocked(id, total);
          canvases.push([cv, id, open]);
          const ab = ABILITIES[SKINS[id].ability];
          const need = SKINS[id].unlockAt ?? 0;
          return h(
            'button',
            {
              class: `skin${this.host.settings.skin === id ? ' selected' : ''}${open ? '' : ' locked'}`,
              attrs: open ? {} : { 'aria-disabled': 'true' },
              onClick: () =>
                this.tapThen(() => {
                  if (!open) return;
                  // Tapping the dragon that is already selected confirms it and goes back.
                  if (this.host.settings.skin === id) {
                    this.show('main');
                    return;
                  }
                  this.host.updateSettings({ skin: id });
                  canvases.length = 0;
                  render();
                }),
            },
            cv,
            h('span', { text: t(SKINS[id].nameKey as I18nKey) }),
            h('small', { class: 'ability', text: `${ab.icon} ${t(ab.nameKey as I18nKey)}` }),
            open ? this.levelBadge(id) : null,
            open ? null : h('small', { class: 'lock', text: t('skins.locked', { n: need }) }),
            open ? null : h('span', { class: 'lock-bar', style: { width: `${Math.min(100, (total / need) * 100)}%` } }),
          );
        }),
      );
    };
    render();
    const anim = (now: number) => {
      for (const [cv, id, open] of canvases) drawSkinPreview(cv, SKINS[id], open ? now : 0);
      this.previewRaf = requestAnimationFrame(anim);
    };
    this.previewRaf = requestAnimationFrame(anim);
    return h('div', { class: 'panel' }, this.header('menu.skins', 'main'), h('div', { class: 'total-points', text: `⭐ ${t('skins.total', { n: total })}` }), grid);
  }

  /** Level stars and progress to the next level. */
  private levelBadge(id: SkinId): HTMLElement {
    const xp = this.host.dragonXp(id);
    const level = levelFor(xp);
    const next = nextLevelXp(level);
    const prev = LEVEL_XP[level - 1];
    const frac = next === null ? 1 : (xp - prev) / (next - prev);
    return h(
      'small',
      { class: 'level' },
      h('span', { text: `${'★'.repeat(level)}${'☆'.repeat(MAX_LEVEL - level)} ${next === null ? t('level.max') : t('level.short', { n: level })}` }),
      h('span', { class: 'xp-bar' }, h('i', { style: { width: `${Math.round(frac * 100)}%` } })),
    );
  }

  private toggle(labelKey: I18nKey, value: boolean, onChange: (v: boolean) => void): HTMLElement {
    const btn = h('button', {
      class: `switch${value ? ' on' : ''}`,
      attrs: { role: 'switch', 'aria-checked': String(value), 'aria-label': t(labelKey) },
      onClick: () =>
        this.tapThen(() => {
          const v = !btn.classList.contains('on');
          btn.classList.toggle('on', v);
          btn.setAttribute('aria-checked', String(v));
          onChange(v);
        }),
    });
    return h('label', { class: 'row' }, h('span', { text: t(labelKey) }), btn);
  }

  private segmented<T extends string>(labelKey: I18nKey, options: [T, string][], value: T, onChange: (v: T) => void): HTMLElement {
    const seg = h('div', { class: 'seg' });
    const render = (cur: T) =>
      seg.replaceChildren(
        ...options.map(([v, label]) =>
          h('button', {
            class: v === cur ? 'on' : '',
            text: label,
            onClick: () =>
              this.tapThen(() => {
                render(v);
                onChange(v);
              }),
          }),
        ),
      );
    render(value);
    return h('div', { class: 'row' }, h('span', { text: t(labelKey) }), seg);
  }

  private settingsPanel(): HTMLElement {
    const s = this.host.settings;
    const volLabel = h('output', { class: 'vol-val', text: `${Math.round(s.volume * 100)}%` });
    const slider = h('input', {
      class: 'slider',
      attrs: { type: 'range', min: '0', max: '100', step: '1', value: String(Math.round(s.volume * 100)), 'aria-label': t('settings.volume') },
    });
    slider.addEventListener('input', () => {
      volLabel.textContent = `${slider.value}%`;
      this.host.updateSettings({ volume: Number(slider.value) / 100 });
    });
    slider.addEventListener('change', () => this.host.tap());
    return h(
      'div',
      { class: 'panel' },
      this.header('menu.settings', this.settingsReturn),
      h(
        'div',
        { class: 'settings' },
        this.segmented<Lang>('settings.language', [['ar', 'العربية'], ['en', 'English']], s.lang, (v) => this.host.updateSettings({ lang: v })),
        this.segmented<BoardSize>(
          'settings.boardSize',
          [['small', t('settings.size.small')], ['normal', t('settings.size.normal')], ['large', t('settings.size.large')]],
          s.boardSize,
          (v) => this.host.updateSettings({ boardSize: v }),
        ),
        h('div', { class: 'row col' }, h('span', { class: 'row-head' }, h('span', { text: t('settings.volume') }), volLabel), slider),
        // "Sound" on = not muted.
        this.toggle('settings.sound', !s.muted, (v) => this.host.updateSettings({ muted: !v })),
        this.toggle('settings.haptics', s.haptics, (v) => this.host.updateSettings({ haptics: v })),
        this.toggle('settings.dpad', s.dpad, (v) => this.host.updateSettings({ dpad: v })),
        this.toggle('settings.dpadOverlay', s.dpadOverlay, (v) => this.host.updateSettings({ dpadOverlay: v })),
        this.segmented<'left' | 'right'>(
          'settings.dpadSide',
          [['left', t('settings.left')], ['right', t('settings.right')]],
          s.dpadSide,
          (v) => this.host.updateSettings({ dpadSide: v }),
        ),
      ),
    );
  }

  private scoresPanel(): HTMLElement {
    const table = h('table', { class: 'scores' });
    table.append(
      h('tr', {}, h('th', {}), ...DIFFICULTY_ORDER.map((d) => h('th', { text: `${DIFF_ICONS[d]}`, attrs: { title: t(`diff.${d}` as I18nKey) } }))),
    );
    for (const m of MODE_ORDER) {
      table.append(
        h(
          'tr',
          {},
          h('th', { class: 'mode-cell', text: `${MODE_ICONS[m]} ${t(`mode.${m}` as I18nKey)}` }),
          ...DIFFICULTY_ORDER.map((d) => {
            const v = this.host.bestFor(m, d);
            return h('td', { text: v > 0 ? String(v) : t('scores.none') });
          }),
        ),
      );
    }
    const legend = h(
      'div',
      { class: 'legend' },
      ...DIFFICULTY_ORDER.map((d) => h('span', { text: `${DIFF_ICONS[d]} ${t(`diff.${d}` as I18nKey)}` })),
    );
    return h('div', { class: 'panel' }, this.header('scores.title', 'main'), h('div', { class: 'table-wrap' }, table), legend);
  }

  private pausePanel(): HTMLElement {
    return h(
      'div',
      { class: 'panel small' },
      h('h2', { class: 'center', text: t('pause.title') }),
      this.button(t('pause.resume'), () => this.host.resume(), 'btn-play'),
      this.button(t('pause.restart'), () => this.host.restart()),
      this.button(t('menu.settings'), () => this.show('settings')),
      this.button(`🏁 ${t('pause.end')}`, () => this.host.endRun(), 'btn-end'),
      this.button(t('pause.menu'), () => this.host.toMenu()),
    );
  }

  private overPanel(s: GameOverStats): HTMLElement {
    const stat = (key: I18nKey, value: string) => h('div', { class: 'stat' }, h('span', { text: t(key) }), h('strong', { text: value }));
    const zoneText = s.loop > 0 ? `${t(s.zoneKey)} · ${t('zone.loop', { n: s.loop + 1 })}` : t(s.zoneKey);
    return h(
      'div',
      { class: 'panel small over' },
      h('h2', { class: 'center over-title', text: t(s.reason === 'timeUp' ? 'over.timeUp' : s.reason === 'ended' ? 'over.ended' : 'over.title') }),
      h('div', { class: 'big-score', text: String(s.score) }),
      s.newBest ? h('div', { class: 'new-best', text: `🏆 ${t('over.newBest')}` }) : null,
      h(
        'div',
        { class: 'stats' },
        stat('over.best', String(s.best)),
        stat('over.foods', String(s.foods)),
        stat('over.combo', `×${s.longestCombo}`),
        stat('over.zone', zoneText),
        s.rivalsKilled !== undefined ? stat('over.rivals', `⚔️ ${s.rivalsKilled}`) : null,
        s.allyKills ? stat('over.allyKills', `🤝 ${s.allyKills}`) : null,
      ),
      s.levelUp ? h('div', { class: 'new-best unlocked', text: `⭐ ${t('over.levelUp', { name: t(SKINS[s.levelUp.skin].nameKey as I18nKey), n: s.levelUp.level })}` }) : null,
      ...s.unlocked.map((id) => h('div', { class: 'new-best unlocked', text: `🎉 ${t('over.unlocked', { name: t(SKINS[id].nameKey as I18nKey) })}` })),
      h('div', { class: 'grid2' }, this.button(t('over.retry'), () => this.host.restart(), 'btn-play'), this.button(t('over.menu'), () => this.host.toMenu())),
    );
  }
}
