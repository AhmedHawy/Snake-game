// Small wavy snake preview for the skin picker.
import type { SkinConfig } from '../config/skins';

export function drawSkinPreview(canvas: HTMLCanvasElement, skin: SkinConfig, timeMs: number): void {
  const dpr = Math.min(2.5, window.devicePixelRatio || 1);
  const w = canvas.clientWidth || 140;
  const hgt = canvas.clientHeight || 70;
  if (canvas.width !== Math.round(w * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(hgt * dpr);
  }
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, hgt);
  const n = 12;
  const seg = (w - hgt * 0.5) / n;
  const r = Math.min(hgt * 0.2, seg * 0.9);
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const x = w - hgt * 0.3 - i * seg;
    const y = hgt / 2 + Math.sin(i * 0.7 - timeMs / 300) * hgt * 0.18;
    pts.push([x, y]);
  }
  ctx.lineCap = 'round';
  for (const pass of [0, 1]) {
    for (let i = n - 1; i >= 1; i--) {
      const width = r * 2 * (1 - 0.35 * (i / n));
      ctx.lineWidth = pass === 0 ? width + 3 : width;
      ctx.strokeStyle = pass === 0 ? skin.outline : skin.body(i, n, timeMs);
      ctx.beginPath();
      ctx.moveTo(pts[i][0], pts[i][1]);
      ctx.lineTo(pts[i - 1][0], pts[i - 1][1]);
      ctx.stroke();
    }
  }
  const [hx, hy] = pts[0];
  ctx.fillStyle = skin.outline;
  ctx.beginPath();
  ctx.arc(hx, hy, r * 1.15 + 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = skin.head;
  ctx.beginPath();
  ctx.arc(hx, hy, r * 1.15, 0, Math.PI * 2);
  ctx.fill();
  for (const s of [-1, 1]) {
    ctx.fillStyle = skin.eyeWhite;
    ctx.beginPath();
    ctx.arc(hx + r * 0.35, hy + s * r * 0.45, r * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin.pupil;
    ctx.beginPath();
    ctx.arc(hx + r * 0.48, hy + s * r * 0.45, r * 0.17, 0, Math.PI * 2);
    ctx.fill();
  }
}
