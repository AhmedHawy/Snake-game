// Sound effects synthesized with the Web Audio API. No audio files and no
// music: every sound is a short one-shot built from oscillators and noise.

type Wave = OscillatorType;

interface ToneOpts {
  type?: Wave;
  /** Frequency at the end of the tone (glide). */
  to?: number;
  gain?: number;
  delay?: number;
  attack?: number;
}

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private volume = 0.8;
  private muted = false;

  /** Must be called from a user gesture (Android/Chrome autoplay policy). */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor({ latencyHint: 'interactive' });
        this.master = this.ctx.createGain();
        // Gentle limiter so stacked sounds never clip.
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = -10;
        comp.ratio.value = 6;
        this.master.connect(comp).connect(this.ctx.destination);
        this.applyGain();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  /** Suspend the audio thread while the app is in the background. */
  suspend(): void {
    if (this.ctx?.state === 'running') void this.ctx.suspend();
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v));
    this.applyGain();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    this.applyGain();
  }

  private applyGain(): void {
    if (!this.ctx || !this.master) return;
    // Perceptual curve: slider position squared.
    const g = this.muted ? 0 : this.volume * this.volume * 0.9;
    this.master.gain.setTargetAtTime(g, this.ctx.currentTime, 0.015);
  }

  private get ready(): boolean {
    return !!this.ctx && !!this.master && !this.muted && this.volume > 0 && this.ctx.state === 'running';
  }

  private tone(freq: number, dur: number, o: ToneOpts = {}): void {
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
    const peak = o.gain ?? 0.3;
    const atk = o.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master!);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, filterFreq: number, gain: number, delay = 0, to?: number): void {
    const ctx = this.ctx!;
    if (!this.noiseBuf) {
      const len = ctx.sampleRate;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(filterFreq, t0);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master!);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  eat(): void {
    if (!this.ready) return;
    const base = 520 + Math.random() * 60;
    this.tone(base, 0.09, { type: 'triangle', to: base * 1.9, gain: 0.32 });
  }

  golden(): void {
    if (!this.ready) return;
    [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.16, { type: 'triangle', gain: 0.24, delay: i * 0.055 }));
    this.tone(2093, 0.3, { type: 'sine', gain: 0.1, delay: 0.22 });
  }

  powerUp(): void {
    if (!this.ready) return;
    this.tone(300, 0.32, { type: 'square', to: 1200, gain: 0.1 });
    this.tone(450, 0.32, { type: 'triangle', to: 1800, gain: 0.18, delay: 0.03 });
  }

  combo(level: number): void {
    if (!this.ready) return;
    const f = 440 * Math.pow(2, Math.min(level, 8) / 6);
    this.tone(f, 0.08, { type: 'square', gain: 0.1 });
    this.tone(f * 1.5, 0.12, { type: 'square', gain: 0.1, delay: 0.06 });
  }

  zone(): void {
    if (!this.ready) return;
    // Bright rising chord swell.
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.7, { type: 'sine', gain: 0.16, delay: i * 0.08, attack: 0.06 }));
    this.noise(0.6, 6000, 0.05, 0, 800);
  }

  crash(): void {
    if (!this.ready) return;
    this.noise(0.45, 2200, 0.5, 0, 120);
    this.tone(180, 0.45, { type: 'sawtooth', to: 40, gain: 0.3 });
    this.tone(90, 0.5, { type: 'sine', to: 30, gain: 0.45 });
  }

  poison(): void {
    if (!this.ready) return;
    this.tone(400, 0.3, { type: 'sawtooth', to: 120, gain: 0.14 });
    this.tone(410, 0.3, { type: 'sawtooth', to: 115, gain: 0.1, delay: 0.02 });
  }

  shrink(): void {
    if (!this.ready) return;
    this.tone(900, 0.18, { type: 'triangle', to: 300, gain: 0.22 });
  }

  portal(): void {
    if (!this.ready) return;
    this.tone(220, 0.22, { type: 'sine', to: 880, gain: 0.2 });
    this.noise(0.2, 3000, 0.06, 0, 500);
  }

  /** Dragon breath: a whoosh, tinted by the ability. */
  breath(kind: 'hot' | 'cold' | 'magic' | 'storm'): void {
    if (!this.ready) return;
    if (kind === 'hot') {
      this.noise(0.5, 1800, 0.35, 0, 300);
      this.tone(140, 0.4, { type: 'sawtooth', to: 70, gain: 0.12 });
    } else if (kind === 'cold') {
      this.noise(0.45, 7000, 0.18, 0, 2500);
      [1568, 2093, 2637].forEach((f, i) => this.tone(f, 0.25, { type: 'sine', gain: 0.06, delay: 0.05 + i * 0.05 }));
    } else if (kind === 'storm') {
      this.noise(0.6, 2500, 0.45, 0, 150);
      this.tone(90, 0.6, { type: 'sawtooth', to: 40, gain: 0.25 });
      this.tone(600, 0.3, { type: 'square', to: 1400, gain: 0.06, delay: 0.05 });
    } else {
      this.noise(0.35, 4000, 0.15, 0, 900);
      this.tone(660, 0.3, { type: 'triangle', to: 1320, gain: 0.12 });
    }
  }

  /** Obstacles shattering. */
  smash(): void {
    if (!this.ready) return;
    this.noise(0.3, 3500, 0.35, 0, 200);
    this.tone(120, 0.2, { type: 'square', to: 60, gain: 0.12 });
  }

  tap(): void {
    if (!this.ready) return;
    this.tone(880, 0.04, { type: 'triangle', to: 660, gain: 0.18 });
  }

  timeUp(): void {
    if (!this.ready) return;
    [880, 660, 440].forEach((f, i) => this.tone(f, 0.18, { type: 'square', gain: 0.1, delay: i * 0.15 }));
  }
}
