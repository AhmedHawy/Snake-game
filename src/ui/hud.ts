// In-game HUD bar (above the board, never over it). DOM writes only happen
// when a value actually changes.
import { EFFECT_COLORS, type TimedEffect } from '../config/food';
import { t } from '../config/i18n';
import { TIMED_EFFECTS, type Game } from '../core/state';
import { ICONS, h } from './dom';

const EFFECT_ICONS: Record<TimedEffect, string> = { speed: '⚡', slow: '⏳', ghost: '👻', magnet: '🧲' };

export interface HudHandlers {
  onPause: () => void;
  onMute: () => void;
}

export class Hud {
  private readonly scoreEl: HTMLElement;
  private readonly subEl: HTMLElement;
  private readonly lengthEl: HTMLElement;
  private readonly floatEl: HTMLElement;
  private readonly effectsEl: HTMLElement;
  private readonly comboEl: HTMLElement;
  private readonly comboBar: HTMLElement;
  private readonly comboText: HTMLElement;
  private readonly muteBtn: HTMLButtonElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly chips = new Map<TimedEffect, HTMLElement>();
  private last: Record<string, string | number | boolean> = {};

  constructor(private readonly root: HTMLElement, handlers: HudHandlers) {
    this.pauseBtn = h('button', { class: 'icon-btn', html: ICONS.pause, onClick: handlers.onPause });
    this.muteBtn = h('button', { class: 'icon-btn', html: ICONS.soundOn, onClick: handlers.onMute });
    this.scoreEl = h('div', { class: 'hud-score', text: '0' });
    this.subEl = h('div', { class: 'hud-sub' });
    this.lengthEl = h('div', { class: 'hud-len' });
    this.effectsEl = h('div', { class: 'hud-effects' });
    this.comboText = h('span', { class: 'combo-text' });
    this.comboBar = h('span', { class: 'combo-bar' });
    this.comboEl = h('div', { class: 'combo hidden' }, this.comboText, this.comboBar);
    for (const e of TIMED_EFFECTS) {
      const chip = h('div', { class: 'fx-chip hidden', text: EFFECT_ICONS[e] });
      chip.style.setProperty('--c', EFFECT_COLORS[e]);
      this.chips.set(e, chip);
      this.effectsEl.append(chip);
    }
    root.replaceChildren(
      h(
        'div',
        { class: 'hud-row' },
        h('div', { class: 'hud-side' }, this.pauseBtn, this.muteBtn),
        h('div', { class: 'hud-center' }, this.scoreEl, this.subEl),
        h('div', { class: 'hud-side hud-end' }, this.lengthEl),
      ),
    );
    // Combo and power-up chips float at the bottom of the board (no second HUD row).
    this.floatEl = h('div', { class: 'hud-float hidden' }, this.comboEl, this.effectsEl);
    root.parentElement?.append(this.floatEl);
    this.refreshLabels();
  }

  show(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
    this.floatEl.classList.toggle('hidden', !visible);
  }

  refreshLabels(): void {
    this.pauseBtn.setAttribute('aria-label', t('pause.title'));
    this.last = {};
  }

  setMuted(muted: boolean): void {
    this.muteBtn.innerHTML = muted ? ICONS.soundOff : ICONS.soundOn;
    this.muteBtn.classList.toggle('muted', muted);
    this.muteBtn.setAttribute('aria-label', t('settings.sound'));
  }

  private set(key: string, value: string | number | boolean, apply: () => void): void {
    if (this.last[key] === value) return;
    this.last[key] = value;
    apply();
  }

  update(game: Game, best: number): void {
    this.set('score', game.score, () => {
      this.scoreEl.textContent = String(game.score);
      this.scoreEl.classList.remove('bump');
      void this.scoreEl.offsetWidth;
      this.scoreEl.classList.add('bump');
    });
    if (game.mode.timeLimitMs > 0) {
      const s = Math.ceil(game.timeLeftMs / 1000);
      this.set('sub', `t${s}`, () => {
        this.subEl.textContent = `⏱ ${s}`;
        this.subEl.classList.toggle('urgent', s <= 10);
      });
    } else {
      const b = Math.max(best, game.score);
      this.set('sub', `b${b}`, () => {
        this.subEl.textContent = `${t('hud.best')} ${b}`;
        this.subEl.classList.remove('urgent');
      });
    }
    this.set('len', game.snake.length, () => (this.lengthEl.textContent = `${t('hud.length')} ${game.snake.length}`));

    for (const e of TIMED_EFFECTS) {
      const left = game.effects[e];
      const chip = this.chips.get(e)!;
      const on = left > 0;
      this.set(`fx-${e}`, on, () => chip.classList.toggle('hidden', !on));
      if (on) {
        const pct = Math.round((left / game.effectTotals[e]) * 100);
        this.set(`fxp-${e}`, pct, () => chip.style.setProperty('--p', `${pct}%`));
      }
    }

    const comboOn = game.comboMult > 1 && game.comboStepsLeft > 0;
    this.set('combo', comboOn, () => this.comboEl.classList.toggle('hidden', !comboOn));
    if (comboOn) {
      this.set('comboMult', game.comboMult, () => {
        this.comboText.textContent = `×${game.comboMult}`;
        this.comboEl.classList.remove('pop');
        void this.comboEl.offsetWidth;
        this.comboEl.classList.add('pop');
      });
      const frac = Math.round((game.comboStepsLeft / game.comboWindow) * 100);
      this.set('comboFrac', frac, () => this.comboBar.style.setProperty('--p', `${frac}%`));
    }
  }
}
