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
  if (skin.dragon?.scales) {
    // Scale plates along the body.
    ctx.fillStyle = skin.dragon.scales;
    for (let i = 1; i < n; i++) {
      const [x, y] = pts[i];
      const rr = r * (1 - 0.35 * (i / n));
      ctx.beginPath();
      ctx.ellipse(x, y + rr * 0.35, rr * 0.38, rr * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (skin.dragon) {
    // Back spines.
    ctx.fillStyle = skin.dragon.spine;
    for (let i = 2; i < n; i += 2) {
      const [x, y] = pts[i];
      const rr = r * (1 - 0.35 * (i / n));
      ctx.beginPath();
      ctx.moveTo(x - rr * 0.5, y - rr * 0.7);
      ctx.lineTo(x, y - rr * 1.6);
      ctx.lineTo(x + rr * 0.5, y - rr * 0.7);
      ctx.fill();
    }
  }
  const [hx, hy] = pts[0];
  const hs = skin.dragon?.headSize ?? 1;
  if (skin.dragon?.whiskers) {
    ctx.strokeStyle = skin.dragon.whiskers;
    ctx.lineWidth = 1.6;
    for (const s of [-1, 1]) {
      const sway = Math.sin(timeMs / 260 + s) * r * 0.3;
      ctx.beginPath();
      ctx.moveTo(hx + r * 0.9, hy + s * r * 0.3);
      ctx.quadraticCurveTo(hx + r * 0.6, hy + s * r * 2 + sway, hx - r * 1.2, hy + s * r * 1.7 + sway);
      ctx.stroke();
    }
  }
  ctx.fillStyle = skin.outline;
  ctx.beginPath();
  ctx.arc(hx, hy, r * 1.15 * hs + 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = skin.head;
  ctx.beginPath();
  ctx.arc(hx, hy, r * 1.15 * hs, 0, Math.PI * 2);
  ctx.fill();
  if (skin.dragon) {
    // Horns.
    ctx.fillStyle = skin.dragon.horn;
    const hz = skin.dragon.hornSize ?? 1;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(hx - r * 0.2, hy + s * r * 0.7);
      ctx.lineTo(hx - r * (0.2 + 1.3 * hz), hy + s * r * (0.7 + 0.75 * hz));
      ctx.lineTo(hx + r * 0.2, hy + s * r * 1.0);
      ctx.fill();
    }
  }
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
