// Fixed-timestep simulation with a decoupled render callback.
// Logic always advances in TICK_MS slices; rendering runs once per display
// frame and receives the leftover fraction so it can interpolate smoothly.

export const TICK_MS = 1000 / 120;
/** Clamp for long frames (tab switch, GC pause) to avoid a spiral of death. */
const MAX_FRAME_MS = 250;

export class FixedLoop {
  private acc = 0;
  private last = 0;
  private raf = 0;
  private running = false;

  constructor(
    private readonly update: (dtMs: number) => void,
    private readonly render: (leftoverMs: number, frameMs: number, now: number) => void,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private frame = (now: number): void => {
    if (!this.running) return;
    let frameMs = now - this.last;
    this.last = now;
    if (frameMs > MAX_FRAME_MS) frameMs = MAX_FRAME_MS;
    if (frameMs < 0) frameMs = 0;
    this.acc += frameMs;
    while (this.acc >= TICK_MS) {
      this.update(TICK_MS);
      this.acc -= TICK_MS;
    }
    this.render(this.acc, frameMs, now);
    this.raf = requestAnimationFrame(this.frame);
  };
}
