import { DIFFICULTIES, type DifficultyId } from './config/difficulty';
import { MODES, type ModeId } from './config/modes';
import { SKINS, type SkinId } from './config/skins';
import { Sfx } from './audio/sfx';
import { Ambient } from './fx/ambient';
import { haptics } from './platform/haptics';
import { computeSnakePoints, snakePoint } from './render/snake';
import { Fx } from './fx/effects';
import { showZoneBanner } from './ui/banner';
import { chooseGridDims, computeLayout, fitBoard, isTablet, type BoardLayout } from './core/grid';
import { FixedLoop } from './core/loop';
import { Game } from './core/state';
import { bindKeyboard } from './input/keyboard';
import { SwipeInput } from './input/swipe';
import { readSafeArea } from './platform/safeArea';
import { Renderer } from './render/renderer';

const MAX_DPR = 2.5;
const ZONE_FADE_MS = 1400;
/** Crash: slow-mo + scattering pieces before the Game Over panel. */
const DEATH_SEQUENCE_MS = 1300;

export class App {
  private readonly canvas = document.getElementById('game') as HTMLCanvasElement;
  private readonly renderer = new Renderer(this.canvas);
  private game!: Game;
  private readonly fx = new Fx();
  private readonly sfx = new Sfx();
  private dyingMs = 0;
  private readonly params = new URLSearchParams(location.search);
  private layout!: BoardLayout;
  private ambient: Ambient | null = null;
  private zoneFade: { from: number; ambient: Ambient | null; t: number } | null = null;
  private readonly loop = new FixedLoop(
    (dt) => this.update(dt),
    () => this.render(),
  );

  start(): void {
    this.measure();
    this.newGame();
    new SwipeInput(this.canvas, {
      deadZone: () => Math.max(12, this.renderer.board.cell * 0.4),
      onDir: (d) => this.game.steer(d),
      onTap: () => this.game.begin(),
    });
    bindKeyboard({ onDir: (d) => this.game.steer(d), onPause: () => {}, onMute: () => {} });
    const unlock = () => this.sfx.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    window.addEventListener('resize', () => this.onResize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.onResize(), 150));
    this.loop.start();
  }

  private measure(): void {
    this.layout = computeLayout({
      width: window.innerWidth,
      height: window.innerHeight,
      safe: readSafeArea(),
      hudHeight: 56,
      dpad: null,
      dpr: this.dpr,
    });
  }

  private get dpr(): number {
    return Math.min(MAX_DPR, window.devicePixelRatio || 1);
  }

  private newGame(): void {
    const dims = chooseGridDims(this.layout.area, isTablet(window.innerWidth, window.innerHeight));
    this.game = new Game({
      ...dims,
      mode: MODES[(this.params.get('mode') as ModeId) || 'classic'] ?? MODES.classic,
      difficulty: DIFFICULTIES[(this.params.get('diff') as DifficultyId) || 'normal'] ?? DIFFICULTIES.normal,
    });
    this.fx.reset();
    this.ambient = new Ambient(this.game.zone, this.game.cols, this.game.rows);
    this.zoneFade = null;
    this.applyBoard();
  }

  private applyBoard(): void {
    const b = fitBoard(this.layout.area, this.game.cols, this.game.rows, this.dpr);
    this.renderer.resize(window.innerWidth, window.innerHeight, this.dpr, b);
  }

  private onResize(): void {
    this.measure();
    this.applyBoard();
  }

  private get geom() {
    const b = this.renderer.board;
    return { x: b.x, y: b.y, cell: b.cell };
  }

  private update(dt: number): void {
    const g = this.game;
    const scaled = dt * this.fx.timeScale;
    g.update(scaled);
    this.ambient?.update(scaled);
    if (this.zoneFade) {
      this.zoneFade.ambient?.update(scaled);
      this.zoneFade.t += dt / ZONE_FADE_MS;
      if (this.zoneFade.t >= 1) this.zoneFade = null;
    }
    this.handleEvents();
    const head = g.status === 'playing' ? (computeSnakePoints(g, this.geom.x, this.geom.y, this.geom.cell, g.alpha), snakePoint(0)) : null;
    this.fx.update(dt, g, this.geom, head);
    if (g.status === 'dying') {
      this.dyingMs += dt;
      if (this.dyingMs > DEATH_SEQUENCE_MS) {
        g.finishDying();
        this.onGameOver();
      }
    }
  }

  private handleEvents(): void {
    const g = this.game;
    const geom = this.geom;
    for (const e of g.events) {
      switch (e.type) {
        case 'eat': {
          this.fx.onEat(g, e.food, e.points, e.multiplier, geom);
          const t = e.food.type;
          if (t === 'golden') this.sfx.golden();
          else if (t === 'poison') this.sfx.poison();
          else if (t === 'shrink') this.sfx.shrink();
          else if (t === 'apple') this.sfx.eat();
          if (t === 'poison') haptics.bad();
          else haptics.eat();
          break;
        }
        case 'combo':
          this.fx.onCombo(e.multiplier, g.head, geom);
          this.sfx.combo(e.multiplier);
          break;
        case 'effect':
          this.fx.onEffect(e.effect, g.head, geom);
          this.sfx.powerUp();
          haptics.powerUp();
          break;
        case 'shrink':
          this.fx.onShrink(e.removed, e.poison, geom, this.skin);
          break;
        case 'zone':
          this.onZone();
          this.sfx.zone();
          break;
        case 'portal': {
          const p = g.portals.find((q) => (q.a.x === e.from.x && q.a.y === e.from.y) || (q.b.x === e.from.x && q.b.y === e.from.y));
          this.fx.onPortal(e.from, e.to, p?.color ?? '#fff', geom);
          this.sfx.portal();
          break;
        }
        case 'expire':
          this.fx.onExpire(e.food, geom);
          break;
        case 'crash': {
          const n = computeSnakePoints(g, geom.x, geom.y, geom.cell, 1);
          const pts = Array.from({ length: n }, (_, i) => snakePoint(i));
          const colors = pts.map((_, i) => (i === 0 ? this.skin.head : this.skin.body(i, n, performance.now())));
          this.fx.onCrash(pts, colors, e.at, geom);
          this.sfx.crash();
          haptics.crash();
          this.dyingMs = 0;
          break;
        }
        case 'timeUp':
          this.sfx.timeUp();
          this.onGameOver();
          break;
      }
    }
    g.events.length = 0;
  }

  private onGameOver(): void {
    this.newGame();
  }

  private get skin() {
    return SKINS[(this.params.get('skin') as SkinId) || 'classic'] ?? SKINS.classic;
  }

  private onZone(): void {
    const g = this.game;
    const from = (g.zoneIndex - 1 + g.zones.length) % g.zones.length;
    this.zoneFade = { from, ambient: this.ambient, t: 0 };
    this.ambient = new Ambient(g.zone, g.cols, g.rows);
    showZoneBanner(g.zone, g.loop);
  }

  private render(): void {
    this.renderer.draw({ game: this.game, timeMs: performance.now(), skin: this.skin, fx: this.fx, ambient: this.ambient, zoneFade: this.zoneFade });
  }
}
