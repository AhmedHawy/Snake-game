// "New Zone" banner shown during zone transitions.
import { t } from '../config/i18n';
import type { ZoneConfig } from '../config/zones';

const el = () => document.getElementById('banner')!;

/** `single`: one fixed world is played, so the banner announces a speed-up instead of a new zone. */
export function showZoneBanner(zone: ZoneConfig, loop: number, single = false): void {
  const b = el();
  b.innerHTML = '';
  const small = document.createElement('div');
  small.className = 'banner-small';
  small.textContent = t(single ? 'zone.speedUp' : 'zone.new');
  const big = document.createElement('div');
  big.className = 'banner-big';
  big.textContent = t(zone.nameKey as Parameters<typeof t>[0]);
  big.style.color = zone.palette.accent;
  b.append(small, big);
  if (loop > 0) {
    const tier = document.createElement('div');
    tier.className = 'banner-small';
    tier.textContent = t('zone.loop', { n: loop + 1 });
    b.append(tier);
  }
  b.classList.remove('show');
  void b.offsetWidth; // restart the CSS animation
  b.classList.add('show');
}

/** Generic two-line banner (e.g. rival waves). */
export function showBanner(small: string, big: string, color: string): void {
  const b = el();
  const top = document.createElement('div');
  top.className = 'banner-small';
  top.textContent = small;
  const main = document.createElement('div');
  main.className = 'banner-big';
  main.textContent = big;
  main.style.color = color;
  b.replaceChildren(top, main);
  b.classList.remove('show');
  void b.offsetWidth; // restart the CSS animation
  b.classList.add('show');
}

export function hideZoneBanner(): void {
  el().classList.remove('show');
}
