// Visual effect state driven by game events (independent from game logic).
import type { Game } from '../core/state';

export class Fx {
  /** 1 right after eating, decays to 0. */
  headPop = 0;
  /** Step counts at which food was eaten (bulges travel down the body). */
  private bulgeSteps: number[] = [];
  private bulgeOut: number[] = [];

  reset(): void {
    this.headPop = 0;
    this.bulgeSteps.length = 0;
  }

  onEat(game: Game): void {
    this.headPop = 1;
    this.bulgeSteps.push(game.stepCount);
  }

  update(dtMs: number): void {
    this.headPop = Math.max(0, this.headPop - dtMs / 220);
  }

  get headScale(): number {
    const p = this.headPop;
    return 1 + 0.32 * p * p;
  }

  /** Current bulge positions as fractional segment indices. */
  bulges(game: Game, alpha: number): number[] {
    const out = this.bulgeOut;
    out.length = 0;
    const len = game.snake.length;
    for (let i = this.bulgeSteps.length - 1; i >= 0; i--) {
      const pos = game.stepCount - this.bulgeSteps[i] + alpha - 1;
      if (pos > len + 1) this.bulgeSteps.splice(i, 1);
      else out.push(Math.max(0, pos));
    }
    return out;
  }
}
