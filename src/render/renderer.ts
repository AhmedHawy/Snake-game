import type { Game } from '../core/state';
import type { Rect } from '../core/grid';

export interface BoardRect extends Rect {
  cell: number;
}

/** Minimal renderer (replaced by the full renderer in the next step). */
export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  dpr = 1;
  width = 0;
  height = 0;
  board: BoardRect = { x: 0, y: 0, w: 0, h: 0, cell: 1 };

  constructor(readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D not supported');
    this.ctx = ctx;
  }

  resize(width: number, height: number, dpr: number, board: BoardRect): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.board = board;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
  }

  draw(game: Game): void {
    const { ctx, board } = this;
    const c = board.cell;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = game.zone.palette.backdrop;
    ctx.fillRect(0, 0, this.width, this.height);
    for (let y = 0; y < game.rows; y++) {
      for (let x = 0; x < game.cols; x++) {
        ctx.fillStyle = (x + y) % 2 ? game.zone.palette.boardA : game.zone.palette.boardB;
        ctx.fillRect(board.x + x * c, board.y + y * c, c, c);
      }
    }
    const a = game.alpha;
    ctx.fillStyle = '#2fbf45';
    for (let i = game.snake.length - 1; i >= 0; i--) {
      const cur = game.snake[i];
      const prev = game.prevSnake[i] ?? cur;
      const far = Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y) > 1;
      const px = far ? cur.x : prev.x + (cur.x - prev.x) * a;
      const py = far ? cur.y : prev.y + (cur.y - prev.y) * a;
      ctx.fillRect(board.x + px * c + 1, board.y + py * c + 1, c - 2, c - 2);
    }
    ctx.fillStyle = '#ff3b3b';
    for (const f of game.foods) ctx.fillRect(board.x + f.pos.x * c + 3, board.y + f.pos.y * c + 3, c - 6, c - 6);
    ctx.fillStyle = '#666';
    for (const o of game.obstacles) ctx.fillRect(board.x + o.x * c, board.y + o.y * c, c, c);
  }
}
