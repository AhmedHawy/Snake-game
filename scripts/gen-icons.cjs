// Rasterizes assets/icon.svg into PWA icons and Android launcher icons.
// Usage: node scripts/gen-icons.cjs   (requires Playwright + Chromium)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const svg = fs.readFileSync(path.join(root, 'assets/icon.svg'), 'utf8');

const targets = [
  ['public/icons/icon-192.png', 192, 0, 0],
  ['public/icons/icon-512.png', 512, 0, 0],
  ['public/icons/maskable-512.png', 512, 0.1, 0],
  ['public/icons/apple-touch-icon.png', 180, 0, 0],
  ['public/favicon.png', 64, 0, 0],
];
// Android legacy launcher icons (square + round) and adaptive foreground.
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, f] of Object.entries(densities)) {
  const res = `android/app/src/main/res/mipmap-${d}`;
  targets.push([`${res}/ic_launcher.png`, Math.round(48 * f), 0, 0.18]);
  targets.push([`${res}/ic_launcher_round.png`, Math.round(48 * f), 0, 0.5]);
  // Adaptive icon foreground: 108dp canvas, the visible area is the inner 72dp.
  targets.push([`${res}/ic_launcher_foreground.png`, Math.round(108 * f), 0.1666, 0]);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [out, size, pad, radius] of targets) {
    const file = path.join(root, out);
    if (out.startsWith('android/') && !fs.existsSync(path.dirname(file))) continue;
    const inner = Math.round(size * (1 - pad * 2));
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">
        <div style="width:${size}px;height:${size}px;display:grid;place-items:center;background:${pad ? '#1f9d3a' : 'transparent'}">
          <div style="width:${inner}px;height:${inner}px;border-radius:${radius * 100}%;overflow:hidden">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div>
        </div></body></html>`,
    );
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    console.log('wrote', out, size);
  }
  await browser.close();
})();
