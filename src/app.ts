import { DIFFICULTIES } from './config/difficulty';
import { MODES } from './config/modes';
import { chooseGridDims, computeLayout, fitBoard, isTablet, type BoardLayout } from './core/grid';
import { FixedLoop } from './core/loop';
import { Game } from './core/state';
import { bindKeyboard } from './input/keyboard';
import { SwipeInput } from './input/swipe';
import { readSafeArea } from './platform/safeArea';
import { Renderer } from './render/renderer';

const MAX_DPR = 2.5;

export class App {
  private readonly canvas = document.getElementById('game') as HTMLCanvasElement;
  private readonly renderer = new Renderer(this.canvas);
  private game!: Game;
  private layout!: BoardLayout;
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
    this.game = new Game({ ...dims, mode: MODES.classic, difficulty: DIFFICULTIES.normal });
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

  private update(dt: number): void {
    this.game.update(dt);
    if (this.game.status === 'dying') this.game.finishDying();
    if (this.game.status === 'over') this.newGame();
    this.game.events.length = 0;
  }

  private render(): void {
    this.renderer.draw(this.game);
  }
}
