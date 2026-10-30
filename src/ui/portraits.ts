// Rivals mode roster at the top of the board: round dragon-head portraits
// with each snake's length. Rivals top-left, the player top-centre, the ally
// top-right. Dead snakes disappear. DOM is rebuilt only when something changes.
import { SKINS, type SkinConfig, type SkinId } from '../config/skins';
import type { Game } from '../core/state';
import { h } from './dom';

const iconCache = new Map<SkinId, string>();

/** A small front view of the dragon's head (drawn once per skin, cached as a data URL). */
function headIcon(id: SkinId): string {
  let url = iconCache.get(id);
  if (url) return url;
  const skin: SkinConfig = SKINS[id];
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const ctx = c.getContext('2d')!;
  const d = skin.dragon;
  // Horns.
  ctx.fillStyle = d.horn;
  const hs = d.hornSize ?? 1;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(48 + s * 14, 34);
    ctx.lineTo(48 + s * (22 + 10 * hs), 30 - 22 * hs);
    ctx.lineTo(48 + s * 26, 40);
    ctx.fill();
  }
  // Whiskers.
  if (d.whiskers) {
    ctx.strokeStyle = d.whiskers;
    ctx.lineWidth = 3;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(48 + s * 12, 66);
      ctx.quadraticCurveTo(48 + s * 40, 70, 48 + s * 44, 88);
      ctx.stroke();
    }
  }
  // Head.
  ctx.fillStyle = skin.outline;
  ctx.beginPath();
  ctx.ellipse(48, 54, 30, 28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = skin.head;
  ctx.beginPath();
  ctx.ellipse(48, 54, 27, 25, 0, 0, Math.PI * 2);
  ctx.fill();
  // Snout.
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.ellipse(48, 66, 15, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(48 + s * 5, 66, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // Eyes.
  for (const s of [-1, 1]) {
    ctx.fillStyle = skin.eyeWhite;
    ctx.beginPath();
    ctx.arc(48 + s * 12, 47, 7.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin.pupil;
    ctx.beginPath();
    ctx.arc(48 + s * 12, 48, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  url = c.toDataURL();
  iconCache.set(id, url);
  return url;
}

type Kind = 'player' | 'ally' | 'prey' | 'threat' | 'edible';

interface Entry {
  skin: SkinId;
  len: number;
  kind: Kind;
}

export class Portraits {
  private readonly left: HTMLElement;
  private readonly center: HTMLElement;
  private readonly right: HTMLElement;
  private last = '';

  constructor(root: HTMLElement) {
    this.left = h('div', { class: 'portraits portraits-left hidden' });
    this.center = h('div', { class: 'portraits portraits-center hidden' });
    this.right = h('div', { class: 'portraits portraits-right hidden' });
    root.append(this.left, this.center, this.right);
  }

  place(board: { x: number; y: number; w: number; h: number }): void {
    const top = `${board.y + 8}px`;
    Object.assign(this.left.style, { top, left: `${board.x + 8}px`, maxWidth: `${board.w * 0.4}px` });
    Object.assign(this.center.style, { top, left: `${board.x + board.w / 2}px` });
    Object.assign(this.right.style, { top, left: `${board.x + board.w - 8}px` });
  }

  hide(): void {
    if (this.last === '') return;
    for (const el of [this.left, this.center, this.right]) el.classList.add('hidden');
    this.last = '';
  }

  update(game: Game): void {
    const enemies: Entry[] = [];
    let ally: Entry | null = null;
    for (const r of game.rivals) {
      if (!r.alive) continue;
      const len = r.snake.length;
      if (r.ally) ally = { skin: r.skin, len, kind: 'ally' };
      else enemies.push({ skin: r.skin, len, kind: game.isEdible(r) ? 'edible' : len <= game.snake.length ? 'prey' : 'threat' });
    }
    const me: Entry = { skin: game.playerSkin, len: game.snake.length, kind: 'player' };
    const key = JSON.stringify([enemies, ally, me]);
    if (key === this.last) return;
    this.last = key;
    this.left.replaceChildren(...enemies.map((e) => this.portrait(e)));
    this.center.replaceChildren(this.portrait(me));
    this.right.replaceChildren(...(ally ? [this.portrait(ally)] : []));
    this.left.classList.toggle('hidden', enemies.length === 0);
    this.center.classList.remove('hidden');
    this.right.classList.toggle('hidden', !ally);
  }

  private portrait(e: Entry): HTMLElement {
    return h(
      'div',
      { class: `portrait ${e.kind}` },
      h('span', { class: 'portrait-ring' }, h('img', { attrs: { src: headIcon(e.skin), alt: '' } })),
      h('b', { text: String(e.len) }),
    );
  }
}
