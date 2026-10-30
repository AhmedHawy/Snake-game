// Application controller: wires game logic, rendering, effects, audio,
// input, UI and persistence together.
import { Sfx } from './audio/sfx';
import { DIFFICULTIES, type DifficultyId } from './config/difficulty';
import { isBasic } from './config/food';
import { setLang, t, type I18nKey } from './config/i18n';
import { MODES, type ModeId } from './config/modes';
import { SKIN_ORDER, SKINS, isUnlocked, type SkinId } from './config/skins';
import { ZONES } from './config/zones';
import { computeLayout, isTablet, visibleShortCells, type BoardLayout } from './core/grid';
import { FixedLoop } from './core/loop';
import { Game } from './core/state';
import type { Dir } from './core/types';
import { Fx } from './fx/effects';
import { DPad } from './input/dpad';
import { bindKeyboard } from './input/keyboard';
import { SwipeInput } from './input/swipe';
import { haptics, setHapticsEnabled } from './platform/haptics';
import { bindLifecycle, exitApp } from './platform/lifecycle';
import { readSafeArea } from './platform/safeArea';
import { Capacitor } from '@capacitor/core';
import { Renderer3D } from './render3d/scene';
import { addDragonXp, dragonXp, addPoints, bestScore, loadSettings, saveSettings, submitScore, totalPoints, type Settings } from './storage/storage';
import { hideZoneBanner, showBanner, showZoneBanner } from './ui/banner';
import type { AbilityId } from './config/abilities';
import { Hud } from './ui/hud';
import { AbilityButton } from './ui/abilityButton';
import { Portraits } from './ui/portraits';
import { levelFor } from './config/levels';
import { Screens, type UiHost } from './ui/screens';
import { showToast } from './ui/toast';

/** Pixel ratio cap: WebGL fill rate matters on mid-range phones. */
const MAX_DPR = 1.75;
const ZONE_FADE_MS = 1400;
/** Crash: slow-mo + scattering pieces before the Game Over panel. */
const DEATH_SEQUENCE_MS = 1300;
const BACK_EXIT_WINDOW_MS = 2000;
const DOUBLE_TAP_MS = 320;

const $ = (id: string) => document.getElementById(id)!;

export class App implements UiHost {
  settings: Settings = loadSettings();
  private readonly canvas = $('game') as HTMLCanvasElement;
  private readonly renderer = new Renderer3D(this.canvas, $('app'));
  private readonly fx = new Fx();
  private readonly sfx = new Sfx();
  private readonly hud = new Hud($('hud'), { onPause: () => this.togglePause(), onMute: () => this.toggleMute() });
  private readonly screens = new Screens($('overlay'), this);
  private readonly dpad = new DPad($('dpad'), (d) => this.steer(d, true));
  private readonly hint = $('hint');
  private readonly abilityBtn = new AbilityButton($('app'), () => this.fire());
  private readonly portraits = new Portraits($('app'));
  private lastTapMs = 0;
  private game!: Game;
  private layout!: BoardLayout;
  private zoneFade: { from: number; t: number } | null = null;
  private lastFrameMs = 16;
  private inGame = false;
  private paused = false;
  private dyingMs = 0;
  private overShown = false;
  private best = 0;
  /** Points collected over all runs (cached; unlocks skins). */
  private total = totalPoints();
  private lastBackMs = 0;
  /** Optional FPS meter for checking performance on a real device: add ?fps=1 to the URL. */
  private readonly fpsEl = new URLSearchParams(location.search).has('fps') ? document.createElement('div') : null;
  private fpsFrames = 0;
  private fpsLast = 0;
  private fpsWorst = 0;
  private readonly loop = new FixedLoop(
    (dt) => this.update(dt),
    (_left, frameMs, now) => {
      this.lastFrameMs = frameMs;
      this.render();
      if (this.fpsEl) this.trackFps(frameMs, now);
    },
  );

  start(): void {
    this.applyLang();
    this.applyAudio();
    setHapticsEnabled(this.settings.haptics);
    this.hud.setMuted(this.settings.muted);
    this.measure();
    this.newGame();
    this.screens.show('main');

    new SwipeInput(this.canvas, {
      deadZone: () => 16,
      onDir: (d, dx, dy) => this.steer(d, false, leanOf(d, dx, dy)),
      onTap: () => {
        if (!this.canPlay) return;
        // Double tap fires the dragon's breath.
        const now = performance.now();
        if (this.game.status === 'playing' && now - this.lastTapMs < DOUBLE_TAP_MS) {
          this.lastTapMs = 0;
          this.fire();
          return;
        }
        this.lastTapMs = now;
        this.game.begin();
      },
    });
    bindKeyboard({
      onDir: (d) => this.steer(d, false),
      onPause: () => (this.inGame ? this.togglePause() : this.screens.back()),
      onMute: () => this.toggleMute(),
      onFire: () => this.fire(),
    });
    // Unlock audio on the first user gesture (autoplay policy).
    const unlock = () => this.sfx.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.onResize(), 200));
    // No context menu on long-press.
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    bindLifecycle({
      onHide: () => {
        this.pause();
        this.sfx.suspend();
        this.loop.stop();
      },
      onShow: () => {
        this.sfx.resume();
        this.loop.start();
      },
      onBack: () => this.onBack(),
    });
    if (this.fpsEl) {
      this.fpsEl.className = 'fps';
      document.body.append(this.fpsEl);
    }
    this.loop.start();
  }

  private trackFps(frameMs: number, now: number): void {
    this.fpsFrames++;
    this.fpsWorst = Math.max(this.fpsWorst, frameMs);
    if (now - this.fpsLast >= 1000) {
      const fps = Math.round((this.fpsFrames * 1000) / (now - this.fpsLast));
      this.fpsEl!.textContent = `${fps} fps · worst ${Math.round(this.fpsWorst)}ms · ${this.fx.particles.count} p`;
      this.fpsFrames = 0;
      this.fpsWorst = 0;
      this.fpsLast = now;
    }
  }

  // ------------------------------------------------------------- UiHost

  play(): void {
    this.restart();
  }

  restart(): void {
    this.inGame = true;
    this.paused = false;
    this.screens.hide();
    hideZoneBanner();
    this.newGame();
    this.hud.show(true);
    this.syncDpad();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.screens.hide();
  }

  /** Ends the current run on purpose (e.g. Zen mode never ends by itself): records the score and shows the summary. */
  endRun(): void {
    if (!this.inGame || this.overShown) return;
    this.paused = false;
    this.onGameOver('ended');
  }

  toMenu(): void {
    // Leaving a run from the pause menu still records its score.
    if (this.inGame && !this.overShown && this.game.score > 0) {
      submitScore(this.settings.mode, this.settings.difficulty, this.game.score);
      this.total = addPoints(this.game.score);
      addDragonXp(this.game.playerSkin, this.game.score);
    }
    this.inGame = false;
    this.paused = false;
    this.hud.show(false);
    hideZoneBanner();
    this.newGame();
    this.syncDpad();
    this.screens.show('main');
  }

  readonly canExit = Capacitor.isNativePlatform();

  exit(): void {
    exitApp();
  }

  tap(): void {
    this.sfx.tap();
    haptics.tap();
  }

  totalPoints(): number {
    return this.total;
  }

  dragonXp(id: SkinId): number {
    return dragonXp(id);
  }

  bestFor(mode: ModeId, diff: DifficultyId): number {
    return bestScore(mode, diff);
  }

  updateSettings(patch: Partial<Settings>): void {
    const prev = this.settings;
    this.settings = { ...prev, ...patch };
    saveSettings(this.settings);
    if (patch.lang !== undefined && patch.lang !== prev.lang) {
      this.applyLang();
      this.hud.refreshLabels();
      this.screens.refresh();
    }
    if (patch.volume !== undefined || patch.muted !== undefined) {
      this.applyAudio();
      this.hud.setMuted(this.settings.muted);
    }
    if (patch.haptics !== undefined) setHapticsEnabled(this.settings.haptics);
    if (patch.dpad !== undefined || patch.dpadSide !== undefined || patch.boardSize !== undefined) this.onResize();
    if ((patch.mode !== undefined || patch.difficulty !== undefined) && !this.inGame) this.newGame();
  }

  // ------------------------------------------------------------- state

  private get canPlay(): boolean {
    return this.inGame && !this.paused && this.screens.current === 'none';
  }

  private steer(d: Dir, fromDpad: boolean, lean?: Dir): void {
    if (!this.canPlay) return;
    if (this.game.steer(d, lean) && fromDpad) haptics.tap();
  }

  /** Fires a stored breath (ability button, double tap, F / Enter). */
  private fire(): void {
    if (!this.canPlay || this.game.status !== 'playing') return;
    if (this.game.fireBreath()) haptics.powerUp();
    else {
      this.abilityBtn.denied();
      haptics.tap();
    }
  }

  private pause(): void {
    if (!this.inGame || this.paused) return;
    if (this.game.status !== 'playing' && this.game.status !== 'ready') return;
    this.paused = true;
    this.screens.show('pause');
  }

  private togglePause(): void {
    if (this.paused) {
      if (this.screens.current === 'pause') this.resume();
    } else this.pause();
  }

  private toggleMute(): void {
    this.sfx.unlock();
    this.updateSettings({ muted: !this.settings.muted });
    if (!this.settings.muted) this.sfx.tap();
  }

  private onBack(): void {
    if (this.screens.back()) return;
    if (this.inGame && !this.paused) {
      this.pause();
      return;
    }
    const now = performance.now();
    if (now - this.lastBackMs < BACK_EXIT_WINDOW_MS) exitApp();
    else {
      this.lastBackMs = now;
      showToast(t('toast.backAgain'));
    }
  }

  private applyLang(): void {
    const lang = this.settings.lang;
    setLang(lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.title = t('app.title');
  }

  private applyAudio(): void {
    this.sfx.setVolume(this.settings.volume);
    this.sfx.setMuted(this.settings.muted);
  }

  private get skin() {
    const id = this.settings.skin;
    // A locked skin (e.g. after clearing progress) falls back to the classic look.
    return SKINS[id] && isUnlocked(id, this.total) ? SKINS[id] : SKINS.classic;
  }

  // ------------------------------------------------------------- layout

  private get dpr(): number {
    return Math.min(MAX_DPR, window.devicePixelRatio || 1);
  }

  private measure(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const tablet = isTablet(w, h);
    // Short landscape phones get a single-row HUD so the board keeps its height.
    const hudH = h < 500 ? 52 : tablet ? 92 : 84;
    const dpadSize = Math.round(Math.min(tablet ? 200 : 156, Math.min(w, h) * 0.42));
    this.layout = computeLayout({
      width: w,
      height: h,
      safe: readSafeArea(),
      hudHeight: hudH,
      dpad: this.settings.dpad ? { side: this.settings.dpadSide, size: dpadSize } : null,
      dpr: this.dpr,
    });
    document.documentElement.style.setProperty('--hud-h', `${hudH}px`);
  }

  /** Cells visible across the short side of the view (zoom setting). */
  private get shortCells(): number {
    return visibleShortCells(this.settings.boardSize, isTablet(window.innerWidth, window.innerHeight));
  }

  private applyBoard(): void {
    const a = this.layout.area;
    this.renderer.resize(a, this.dpr);
    this.renderer.setZoom(this.shortCells);
    const root = document.documentElement.style;
    root.setProperty('--board-x', `${a.x}px`);
    root.setProperty('--board-w', `${a.w}px`);
    root.setProperty('--board-cy', `${a.y + a.h / 2}px`);
  }

  private syncDpad(): void {
    this.dpad.place(this.layout.dpadRect, this.inGame && this.settings.dpad);
    // The ability button sits in the board corner away from the D-pad.
    this.abilityBtn.place(this.layout.area, this.settings.dpad && this.settings.dpadSide === 'right' ? 'left' : 'right');
    this.abilityBtn.show(this.inGame);
    this.portraits.place(this.layout.area);
  }

  private onResize(): void {
    this.measure();
    this.applyBoard();
    this.syncDpad();
  }

  private newGame(): void {
    const s = this.settings;
    this.game = new Game({
      mode: MODES[s.mode] ?? MODES.classic,
      difficulty: DIFFICULTIES[s.difficulty] ?? DIFFICULTIES.normal,
      viewRadius: Math.ceil(this.shortCells / 2) + 1,
      zones: s.world >= 0 && ZONES[s.world] ? [ZONES[s.world]] : undefined,
      playerSkin: this.skin.id,
      abilityLevel: levelFor(dragonXp(this.skin.id)),
    });
    this.best = bestScore(s.mode, s.difficulty);
    this.fx.reset();
    this.renderer.reset();
    this.zoneFade = null;
    this.dyingMs = 0;
    this.overShown = false;
    this.applyBoard();
    this.setThemeColor(this.game.zone.palette.backdrop);
  }

  private setThemeColor(color: string): void {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
    document.body.style.background = color;
  }

  // ------------------------------------------------------------- frame

  private update(dt: number): void {
    if (this.paused) return;
    const g = this.game;
    const scaled = dt * this.fx.timeScale;
    if (this.inGame) g.update(scaled);
    if (this.zoneFade) {
      this.zoneFade.t += dt / ZONE_FADE_MS;
      if (this.zoneFade.t >= 1) this.zoneFade = null;
    }
    this.handleEvents();
    this.fx.update(dt, g, g.status === 'playing' ? this.renderer.head : null);
    if (g.status === 'dying') {
      this.dyingMs += dt;
      if (this.dyingMs > DEATH_SEQUENCE_MS) {
        g.finishDying();
        this.onGameOver('crash');
      }
    }
  }

  private handleEvents(): void {
    const g = this.game;
    const head = this.renderer.head;
    for (const e of g.events) {
      switch (e.type) {
        case 'eat': {
          this.fx.onEat(g, e.food, e.points, e.multiplier);
          const ty = e.food.type;
          if (ty === 'golden') this.sfx.golden();
          else if (ty === 'poison') this.sfx.poison();
          else if (ty === 'shrink') this.sfx.shrink();
          else if (isBasic(ty)) this.sfx.eat();
          if (ty === 'poison') haptics.bad();
          else haptics.eat();
          if (ty === 'shrink' || ty === 'poison') {
            this.fx.popup(
              e.food.pos.x,
              0.4,
              e.food.pos.y + 0.6,
              t(ty === 'shrink' ? 'food.shrink' : 'food.poison'),
              ty === 'shrink' ? '#ff5fa2' : '#c77dff',
              20,
            );
          }
          break;
        }
        case 'combo':
          this.fx.onCombo(e.multiplier, head);
          this.sfx.combo(e.multiplier);
          break;
        case 'effect':
          this.fx.onEffect(e.effect, head);
          this.sfx.powerUp();
          haptics.powerUp();
          break;
        case 'shrink':
          this.fx.onShrink(e.removed, e.poison, this.skin);
          break;
        case 'zone':
          this.onZone();
          this.sfx.zone();
          break;
        case 'portal': {
          const p = g.portals.find((q) => (q.a.x === e.from.x && q.a.y === e.from.y) || (q.b.x === e.from.x && q.b.y === e.from.y));
          this.fx.onPortal(e.from, e.to, p?.color ?? '#fff');
          this.sfx.portal();
          break;
        }
        case 'expire':
          this.fx.onExpire(e.food);
          break;
        case 'crash': {
          const pts = this.renderer.segmentPoints(g);
          const now = performance.now();
          const colors = pts.map((_, i) => (i === 0 ? this.skin.head : this.skin.body(i, pts.length, now)));
          this.fx.onCrash(pts, colors, e.at);
          this.sfx.crash();
          haptics.crash();
          this.dyingMs = 0;
          break;
        }
        case 'rivalKilled': {
          const rs = SKINS[e.rival.skin];
          const now = performance.now();
          const colors = e.cells.map((_, i) => (i === 0 ? rs.head : rs.body(i, e.cells.length, now)));
          this.fx.onRivalKilled(e.cells, colors, e.byPlayer || e.byAlly ? e.points : 0);
          if (e.rival.ally) {
            // The ally fell: tell the player.
            showBanner('💀', t('ally.died'), '#ff5c5c');
            this.sfx.crash();
            haptics.bad();
          } else if (e.byPlayer) {
            this.sfx.golden();
            haptics.powerUp();
          } else if (e.byAlly) {
            this.fx.popup(e.cells[0].x, 1.7, e.cells[0].y, `🤝 ${t('ally.kill')}`, '#6bc8ff', 22);
            this.sfx.combo(3);
          }
          break;
        }
        case 'breath':
          this.fx.onBreath(e.ability, e.from, e.dir, e.cells, e.targets, e.strong, e.real, e.source);
          if (e.real) this.sfx.breath(BREATH_SOUND[e.ability]);
          break;
        case 'rivalHit': {
          const rs = SKINS[e.rival.skin];
          this.fx.onRivalHit(e.removed, [rs.body(0, 2, 0), rs.head], e.points);
          haptics.tap();
          break;
        }
        case 'smash':
          this.fx.onSmash(e.cells, g.zone.palette.accent);
          this.sfx.smash();
          break;
        case 'waveCleared':
          showBanner(t('wave.cleared'), `⚔️ ${t('wave.title', { n: e.wave + 1 })}`, '#7dff6b');
          this.sfx.golden();
          haptics.powerUp();
          break;
        case 'wave':
          if (e.boss) showBanner(t('wave.title', { n: e.wave }), `👹 ${t('boss.comes')}`, '#ff3b1f');
          else showBanner('⚔️', t('wave.title', { n: e.wave }), '#ff5c5c');
          this.sfx.zone();
          if (e.boss) haptics.crash();
          break;
        case 'playerBurned':
          this.fx.onBurned();
          this.fx.popup(head.x, 1.2, head.z, e.removed > 0 ? `🔥 -${e.removed}` : '🔥', '#ff6a00', 26);
          haptics.bad();
          break;
        case 'bossDefeated':
          showBanner(`+${e.points}`, `👹 ${t('boss.defeated')}`, '#ffd23f');
          this.sfx.golden();
          haptics.powerUp();
          break;
        case 'timeUp':
          this.sfx.timeUp();
          this.onGameOver('timeUp');
          break;
        default:
          break;
      }
    }
    g.events.length = 0;
  }

  private onZone(): void {
    const g = this.game;
    const from = (g.zoneIndex - 1 + g.zones.length) % g.zones.length;
    this.zoneFade = { from, t: 0 };
    showZoneBanner(g.zone, g.loop, g.zones.length === 1);
    this.setThemeColor(g.zone.palette.backdrop);
  }

  private onGameOver(reason: 'crash' | 'timeUp' | 'ended'): void {
    if (this.overShown || !this.inGame) return;
    this.overShown = true;
    const g = this.game;
    const s = this.settings;
    const newBest = submitScore(s.mode, s.difficulty, g.score);
    const before = this.total;
    const after = (this.total = addPoints(g.score));
    const unlocked = SKIN_ORDER.filter((id: SkinId) => !isUnlocked(id, before) && isUnlocked(id, after));
    // The dragon that played gains this run's score as experience.
    const levelBefore = g.abilityLevel;
    const levelAfter = levelFor(addDragonXp(g.playerSkin, g.score));
    this.best = bestScore(s.mode, s.difficulty);
    this.screens.show('over', {
      score: g.score,
      best: this.best,
      newBest,
      foods: g.foodsEaten,
      longestCombo: g.longestCombo,
      zoneKey: g.zone.nameKey as I18nKey,
      loop: g.loop,
      reason,
      rivalsKilled: g.mode.rivals === 'lethal' ? g.rivalsKilled : undefined,
      allyKills: g.mode.rivals === 'lethal' ? g.allyKills : undefined,
      unlocked,
      levelUp: levelAfter > levelBefore ? { skin: g.playerSkin, level: levelAfter } : undefined,
    });
  }

  private render(): void {
    const g = this.game;
    this.renderer.draw({
      game: g,
      timeMs: performance.now(),
      dtMs: this.lastFrameMs,
      skin: this.skin,
      fx: this.fx,
      zoneFade: this.zoneFade,
      showArrow: this.inGame && !this.paused && g.status === 'playing',
    });
    if (this.inGame) {
      this.hud.update(g, this.best);
      const ab = g.ability;
      this.abilityBtn.update(ab.icon, ab.colors[0], g.charges, g.strongCharge);
    }
    if (this.inGame && g.mode.rivals === 'lethal' && g.status !== 'over') this.portraits.update(g);
    else this.portraits.hide();
    const showHint = this.inGame && !this.paused && g.status === 'ready' && this.screens.current === 'none';
    if (showHint === this.hint.classList.contains('hidden')) {
      this.hint.textContent = t(matchMedia('(pointer: fine)').matches ? 'hud.swipeDesktop' : 'hud.swipe');
      this.hint.classList.toggle('hidden', !showHint);
    }
  }
}

/** Which way a backwards swipe leans (picks the U-turn side), if clearly sideways. */
function leanOf(d: Dir, dx: number, dy: number): Dir | undefined {
  if (d === 1 || d === 3) return Math.abs(dy) > Math.abs(dx) * 0.3 ? (dy > 0 ? 2 : 0) : undefined;
  return Math.abs(dx) > Math.abs(dy) * 0.3 ? (dx > 0 ? 1 : 3) : undefined;
}

const BREATH_SOUND: Record<AbilityId, 'hot' | 'cold' | 'magic' | 'storm'> = {
  fire: 'hot', lava: 'hot', royal: 'storm', lightning: 'storm', roar: 'storm', shadow: 'storm',
  water: 'cold', tsunami: 'cold', ice: 'cold', crystal: 'cold',
  poison: 'magic', prism: 'magic', leaves: 'magic', blackHole: 'magic',
};
