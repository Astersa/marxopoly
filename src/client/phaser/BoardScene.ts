import Phaser from 'phaser';
import { GROUPS, SPACES, type Space } from '../../shared/board';
import { localizedSpace, t as tr, tm, type Lang } from '../../shared/i18n';
import type { GameEvent, PublicGameState } from '../../shared/types';
import { PLAYER_COLORS, avatarSvg, svgDataUri } from '../avatars';
import { CANVAS, CORNER, CELL, center, tileRect } from './layout';

const C = {
  coal: 0x16130f, coal2: 0x201b15, coal3: 0x2c261d, paper: 0xefe3c6, paper2: 0xe3d4ae, ink: 0x1d1a14, red: 0xd63a1f, brass: 0xc9962b,
};
const HEX = { paper: '#efe3c6', ink: '#1d1a14', red: '#d63a1f', brass: '#c9962b' };
const COND = '"Barlow Condensed", "Arial Narrow", sans-serif';
const BAND = 34;

const SLOTS = [[-24, -22], [24, -22], [-24, 24], [24, 24]];

export class BoardScene extends Phaser.Scene {
  private state: PublicGameState | null = null;
  private compact = false;
  private lang: Lang = 'en';
  private T(key: Parameters<typeof tr>[1], p?: Record<string, string | number>) { return tr(this.lang, key, p); }
  private tileLayer!: Phaser.GameObjects.Container;
  private dynGfx!: Phaser.GameObjects.Graphics;
  private selGfx!: Phaser.GameObjects.Graphics;
  private centerTexts: Record<string, Phaser.GameObjects.Text> = {};
  private statTexts: Phaser.GameObjects.GameObject[] = [];
  private tokens = new Map<string, { c: Phaser.GameObjects.Container; img: Phaser.GameObjects.Image | null; disc: Phaser.GameObjects.Arc; key: string }>();
  private shown = new Map<string, number>();
  private diceGfx!: Phaser.GameObjects.Graphics;
  private diceVals: [number, number] = [1, 1];
  private selected: number | null = null;
  private clickCb: ((id: number) => void) | null = null;
  private busy = false;
  private pendingSync: PublicGameState | null = null;
  private readyCb: (() => void) | null = null;
  private madeKeys = new Set<string>();

  constructor() { super('board'); }

  onReady(cb: () => void) { if (this.sys?.isActive?.() && this.tileLayer) cb(); else this.readyCb = cb; }
  setClick(cb: (id: number) => void) { this.clickCb = cb; }

  /** Relabel everything in place. Tokens and running tweens are separate objects and are not touched. */
  setLang(lang: Lang) {
    if (lang === this.lang) return;
    this.lang = lang;
    if (!this.tileLayer) return;
    this.rebuildTiles();
    this.drawCenter();
    if (this.state) { this.updateCenter(); }
  }

  create() {
    this.cameras.main.setBackgroundColor('#16130f');
    this.drawBackground();
    this.tileLayer = this.add.container(0, 0);
    this.rebuildTiles();
    this.dynGfx = this.add.graphics();
    this.selGfx = this.add.graphics();
    this.diceGfx = this.add.graphics();
    this.drawCenter();
    this.drawDice();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const id = this.hit(p.worldX, p.worldY);
      if (id != null) this.clickCb?.(id);
    });
    this.scale.on('resize', () => this.checkCompact());
    this.checkCompact();
    this.tweens.add({ targets: this.selGfx, alpha: { from: 1, to: 0.55 }, duration: 700, yoyo: true, repeat: -1 });
    this.readyCb?.();
    if (this.pendingSync) { const s = this.pendingSync; this.pendingSync = null; this.sync(s); }
  }

  private checkCompact() {
    const w = this.scale.parentSize?.width || this.scale.displaySize?.width || CANVAS;
    const c = w < 640;
    if (c !== this.compact) {
      this.compact = c;
      this.rebuildTiles();
      this.drawCenter();
      if (this.state) this.sync(this.state);
    }
  }

  private hit(x: number, y: number): number | null {
    for (let i = 0; i < 40; i++) {
      const r = tileRect(i);
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
    }
    return null;
  }

  // ---------- static drawing ----------
  private drawBackground() {
    const g = this.add.graphics();
    g.fillStyle(C.coal, 1).fillRect(0, 0, CANVAS, CANVAS);
    g.fillStyle(C.coal2, 1).fillRect(CORNER, CORNER, CANVAS - 2 * CORNER, CANVAS - 2 * CORNER);
    // constructivist diagonal blocks in the middle
    g.fillStyle(C.red, 1).fillPoints([{ x: CORNER, y: 1150 }, { x: CORNER, y: 1010 }, { x: 1010, y: CORNER }, { x: 1150, y: CORNER }, { x: 1150, y: 310 }, { x: 310, y: 1150 }], true);
    g.fillStyle(C.coal, 1).fillPoints([{ x: CORNER, y: CANVAS - CORNER }, { x: CORNER + 330, y: CANVAS - CORNER }, { x: CORNER, y: CANVAS - CORNER - 330 }], true);
    g.fillStyle(C.coal3, 1).fillPoints([{ x: CANVAS - CORNER, y: CANVAS - CORNER }, { x: CANVAS - CORNER - 420, y: CANVAS - CORNER }, { x: CANVAS - CORNER, y: CANVAS - CORNER - 420 }], true);
    // gear
    const gear: Phaser.Types.Math.Vector2Like[] = [];
    const teeth = 14, cx = 1010, cy = 520;
    for (let i = 0; i < teeth; i++) {
      const a0 = (i / teeth) * Math.PI * 2, st = (Math.PI * 2) / teeth;
      for (const [d, r] of [[0, 150], [0.18, 178], [0.5, 178], [0.68, 150]] as const) gear.push({ x: cx + Math.cos(a0 + d * st) * r, y: cy + Math.sin(a0 + d * st) * r });
    }
    g.fillStyle(C.paper, 0.1).fillPoints(gear, true);
    g.fillStyle(C.coal2, 1).fillCircle(cx, cy, 70);
    g.lineStyle(6, C.paper, 0.25).strokeCircle(cx, cy, 70);
    g.lineStyle(3, C.paper, 0.12);
    for (let i = 0; i < 9; i++) g.lineBetween(CORNER, CORNER + 130 * i + 40, CORNER + 130 * i + 40, CORNER);
  }

  private txt(x: number, y: number, s: string, size: number, color = HEX.ink, family = COND, style = 'bold', origin: [number, number] = [0.5, 0.5], wrap?: number, align = 'center') {
    const t = this.add.text(x, y, s, {
      fontFamily: family, fontSize: `${size}px`, fontStyle: style, color, align,
      ...(wrap ? { wordWrap: { width: wrap, useAdvancedWrap: false } } : {}),
    });
    t.setOrigin(origin[0], origin[1]);
    t.setPadding({ top: 6, bottom: 3, left: 1, right: 1 });
    t.setResolution(2);
    return t;
  }

  private rebuildTiles() {
    this.tileLayer.removeAll(true);
    for (const sp of SPACES) this.drawTile(sp);
  }

  private fitText(t: Phaser.GameObjects.Text, maxH: number, min = 9, maxW = Infinity) {
    let size = parseInt(String(t.style.fontSize), 10);
    while ((t.height > maxH || t.width > maxW) && size > min) { size -= 1; t.setFontSize(size); }
  }

  private drawTile(sp: Space) {
    const r = tileRect(sp.id);
    const g = this.add.graphics();
    const L = this.tileLayer;
    L.add(g);
    if (r.side === 'corner') { this.drawCorner(sp, r, g); return; }
    g.fillStyle(C.paper, 1).fillRect(r.x, r.y, r.w, r.h);
    g.lineStyle(2, C.ink, 1).strokeRect(r.x, r.y, r.w, r.h);

    // outer band geometry (the side facing away from the centre)
    const vertical = r.side === 'left' || r.side === 'right';
    let band = { x: r.x, y: r.y, w: r.w, h: r.h };
    let content = { x: r.x, y: r.y, w: r.w, h: r.h };
    if (sp.group) {
      if (r.side === 'top') { band = { x: r.x, y: r.y, w: r.w, h: BAND }; content = { x: r.x, y: r.y + BAND, w: r.w, h: r.h - BAND }; }
      if (r.side === 'bottom') { band = { x: r.x, y: r.y + r.h - BAND, w: r.w, h: BAND }; content = { x: r.x, y: r.y, w: r.w, h: r.h - BAND }; }
      if (r.side === 'left') { band = { x: r.x, y: r.y, w: BAND, h: r.h }; content = { x: r.x + BAND, y: r.y, w: r.w - BAND, h: r.h }; }
      if (r.side === 'right') { band = { x: r.x + r.w - BAND, y: r.y, w: BAND, h: r.h }; content = { x: r.x, y: r.y, w: r.w - BAND, h: r.h }; }
      const col = Phaser.Display.Color.HexStringToColor(GROUPS[sp.group].color).color;
      g.fillStyle(col, 1).fillRect(band.x, band.y, band.w, band.h);
      g.lineStyle(2, C.ink, 1).strokeRect(band.x, band.y, band.w, band.h);
      // diagonal hatch
      g.lineStyle(2, C.ink, 0.18);
      const n = Math.ceil((band.w + band.h) / 10);
      for (let i = 0; i < n; i++) {
        const o = i * 10;
        const x1 = band.x + Math.min(o, band.w), y1 = band.y + Math.max(0, o - band.w);
        const x2 = band.x + Math.max(0, o - band.h), y2 = band.y + Math.min(o, band.h);
        g.lineBetween(x1, y1, x2, y2);
      }
    }
    const cx = content.x + content.w / 2;
    const price = sp.price != null ? `${sp.price} cr` : '';

    if (this.compact) {
      this.drawGlyph(sp, cx, content.y + content.h * 0.36, 1.4);
      if (price) L.add(this.txt(cx, content.y + content.h * 0.76, String(sp.price), 36, HEX.ink, COND));
      else if (sp.kind === 'tax') L.add(this.txt(cx, content.y + content.h * 0.76, sp.id === 4 ? '100' : '10%', 34));
      return;
    }
    const pad = 6;
    const nameY = content.y + (vertical ? 8 : 10);
    const nameH = content.h - (price || sp.kind === 'tax' ? 52 : 20) - (sp.group ? 0 : 36);
    if (!sp.group) this.drawGlyph(sp, cx, content.y + (vertical ? 28 : 34), 1);
    const nameTop = sp.group ? nameY : nameY + 36;
    const name = this.txt(cx, nameTop, localizedSpace(this.lang, sp.id).shortName.toUpperCase(), vertical ? 21 : 19, HEX.ink, COND, 'bold', [0.5, 0], content.w - pad * 2);
    this.fitText(name, Math.max(30, nameH), 9, content.w - pad * 2);
    L.add(name);
    const lower = sp.kind === 'tax' ? (sp.id === 4 ? '100 cr' : this.T('board.tax_nw')) : price;
    if (lower) L.add(this.txt(cx, content.y + content.h - 22, lower, 22, HEX.ink, COND, 'bold'));
    if (!lower && sp.kind === 'event') L.add(this.txt(cx, content.y + content.h - 22, this.T('board.draw'), 17, HEX.red, COND, 'bold'));
    if (!lower && sp.kind === 'policy') L.add(this.txt(cx, content.y + content.h - 22, this.T('board.draw'), 17, HEX.red, COND, 'bold'));
  }

  private drawGlyph(sp: Space, x: number, y: number, k: number) {
    const g = this.add.graphics();
    this.tileLayer.add(g);
    const s = 14 * k;
    switch (sp.kind) {
      case 'event':
        g.fillStyle(C.red, 1).fillPoints([{ x, y: y - s * 1.3 }, { x: x + s * 1.3, y }, { x, y: y + s * 1.3 }, { x: x - s * 1.3, y }], true);
        this.tileLayer.add(this.txt(x, y + 1, '?', Math.round(26 * k), HEX.paper, 'Anton, Impact, sans-serif', 'normal'));
        break;
      case 'policy':
        g.fillStyle(C.ink, 1).fillRect(x - s * 1.1, y - s * 1.1, s * 2.2, s * 2.2);
        g.fillStyle(C.paper, 1).fillRect(x - s * 0.65, y - s * 0.7, s * 1.3, s * 0.28).fillRect(x - s * 0.65, y - s * 0.15, s * 1.3, s * 0.28).fillRect(x - s * 0.65, y + s * 0.4, s * 0.8, s * 0.28);
        break;
      case 'tax':
        g.fillStyle(C.brass, 1).fillCircle(x, y, s * 1.2);
        g.lineStyle(2, C.ink, 1).strokeCircle(x, y, s * 1.2);
        this.tileLayer.add(this.txt(x, y + 1, '%', Math.round(24 * k), HEX.ink, 'Anton, Impact, sans-serif', 'normal'));
        break;
      case 'station':
        g.lineStyle(4, C.ink, 1).lineBetween(x - s * 1.4, y + s * 0.6, x + s * 1.4, y + s * 0.6).lineBetween(x - s * 1.2, y + s * 0.15, x + s * 1.2, y + s * 0.15);
        for (let i = -2; i <= 2; i++) g.lineBetween(x + i * s * 0.6, y - s * 0.3, x + i * s * 0.6, y + s * 0.95);
        g.fillStyle(C.red, 1).fillRect(x - s * 0.9, y - s * 1.2, s * 1.8, s * 0.9);
        break;
      case 'utility':
        g.fillStyle(C.brass, 1).fillPoints([{ x: x + s * 0.3, y: y - s * 1.4 }, { x: x - s * 0.9, y: y + s * 0.2 }, { x: x - s * 0.05, y: y + s * 0.2 }, { x: x - s * 0.3, y: y + s * 1.4 }, { x: x + s * 0.9, y: y - s * 0.3 }, { x: x + s * 0.05, y: y - s * 0.3 }], true);
        g.lineStyle(2, C.ink, 1).strokePoints([{ x: x + s * 0.3, y: y - s * 1.4 }, { x: x - s * 0.9, y: y + s * 0.2 }, { x: x - s * 0.05, y: y + s * 0.2 }, { x: x - s * 0.3, y: y + s * 1.4 }, { x: x + s * 0.9, y: y - s * 0.3 }, { x: x + s * 0.05, y: y - s * 0.3 }], true);
        break;
      default: break;
    }
  }

  private drawCorner(sp: Space, r: ReturnType<typeof tileRect>, g: Phaser.GameObjects.Graphics) {
    const L = this.tileLayer;
    const { x, y, w, h } = r;
    const big = this.compact;
    if (sp.id === 0) {
      g.fillStyle(C.red, 1).fillRect(x, y, w, h);
      g.fillStyle(C.ink, 1).fillPoints([{ x, y: y + h }, { x: x + w, y: y + h }, { x: x + w, y: y + h - 62 }], true);
      g.lineStyle(10, C.paper, 1).lineBetween(x + 24, y + 28, x + 112, y + 28);
      g.fillStyle(C.paper, 1).fillPoints([{ x: x + 108, y: y + 10 }, { x: x + 144, y: y + 28 }, { x: x + 108, y: y + 46 }], true);
      L.add(this.txt(x + 28, y + 110, 'GO', big ? 76 : 70, HEX.paper, 'Anton, Impact, sans-serif', 'normal', [0, 0.5]));
      if (!big) L.add(this.txt(x + 10, y + 138, this.T('board.go_cap'), 11, HEX.paper, COND, 'bold', [0, 0], 90, 'left'));
    } else if (sp.id === 10) {
      g.fillStyle(C.coal3, 1).fillRect(x, y, w, h);
      g.fillStyle(C.brass, 1).fillRect(x + 40, y + 36, 100, 100);
      g.fillStyle(C.coal, 1).fillRect(x + 48, y + 44, 84, 84);
      g.lineStyle(6, C.brass, 1);
      for (let i = 0; i < 4; i++) g.lineBetween(x + 62 + i * 18, y + 44, x + 62 + i * 18, y + 128);
      L.add(this.txt(x + w / 2, y + 150, big ? this.T('board.strike_short') : this.T('board.strike'), big ? 22 : 24, HEX.paper, COND));
      if (!big) L.add(this.txt(x + w / 2, y + 22, this.T('board.just_visiting'), 15, HEX.brass, COND));
    } else if (sp.id === 20) {
      g.fillStyle(C.paper, 1).fillRect(x, y, w, h);
      g.lineStyle(10, C.red, 1).strokeCircle(x + w / 2, y + 72, 40);
      g.lineStyle(10, C.ink, 1).lineBetween(x + w / 2 - 28, y + 100, x + w / 2 + 28, y + 44);
      L.add(this.txt(x + w / 2, y + 134, big ? this.T('board.free_short') : this.T('board.free1'), big ? 19 : 19, HEX.ink, COND));
      if (!big) L.add(this.txt(x + w / 2, y + 152, this.T('board.free2'), 19, HEX.ink, COND));
    } else {
      g.fillStyle(C.ink, 1).fillRect(x, y, w, h);
      g.fillStyle(C.red, 1).fillPoints([{ x, y }, { x: x + 86, y }, { x, y: y + 86 }], true).fillPoints([{ x: x + w, y: y + h }, { x: x + w - 86, y: y + h }, { x: x + w, y: y + h - 86 }], true);
      g.fillStyle(C.paper, 1).fillCircle(x + w / 2, y + 74, 38);
      g.fillStyle(C.ink, 1).fillCircle(x + w / 2, y + 74, 28);
      g.fillStyle(C.paper, 1).fillCircle(x + w / 2, y + 74, 12);
      L.add(this.txt(x + w / 2, y + 138, this.T('board.anti'), big ? 18 : 20, HEX.paper, COND));
      L.add(this.txt(x + w / 2, y + 157, this.T('board.anti2'), big ? 15 : 15, HEX.brass, COND));
    }
    g.lineStyle(3, C.ink, 1).strokeRect(x, y, w, h);
  }

  private drawCenter() {
    for (const t of Object.values(this.centerTexts)) t.destroy();
    this.centerTexts = {};
    this.statTexts.forEach(t => t.destroy());
    this.statTexts = [];
    const cx = CANVAS / 2;
    const A = 'Anton, Impact, sans-serif';
    const c = this.compact;
    const plaque = this.add.graphics();
    plaque.fillStyle(C.coal, 0.92).fillRect(cx - 330, c ? 316 : 344, 660, 28);
    this.statTexts.push(plaque);
    this.centerTexts.shadow = this.txt(cx + 5, c ? 258 : 288, 'MARXOPOLY', c ? 108 : 112, HEX.red, A, 'normal');
    this.centerTexts.logo = this.txt(cx, c ? 252 : 282, 'MARXOPOLY', c ? 108 : 112, HEX.paper, A, 'normal');
    this.centerTexts.sub = this.txt(cx, c ? 330 : 358, this.T('board.subtitle'), c ? 28 : 26, HEX.brass, COND);
    this.centerTexts.round = this.txt(cx, c ? 440 : 450, '', c ? 64 : 46, HEX.paper, A, 'normal');
    this.centerTexts.turn = this.txt(cx, c ? 530 : 515, '', c ? 52 : 40, HEX.paper, COND);
    this.centerTexts.msg = this.txt(cx, c ? 1030 : 1010, '', c ? 34 : 28, HEX.paper, COND, 'bold', [0.5, 0], 780);
    this.centerTexts.mode = this.txt(cx, c ? 392 : 402, '', c ? 28 : 24, HEX.paper, COND);
    this.diceGfx?.setDepth(5);
  }

  // ---------- dice ----------
  private drawDice() {
    const g = this.diceGfx;
    g.clear();
    const size = this.compact ? 130 : 110;
    const y = this.compact ? 700 : 690;
    [[CANVAS / 2 - size * 0.8, 0], [CANVAS / 2 + size * 0.8, 1]].forEach(([cx, i]) => {
      const x = cx - size / 2, y0 = y - size / 2;
      g.fillStyle(0x000000, 0.45).fillRoundedRect(x + 7, y0 + 8, size, size, 14);
      g.fillStyle(C.paper, 1).fillRoundedRect(x, y0, size, size, 14);
      g.lineStyle(4, C.ink, 1).strokeRoundedRect(x, y0, size, size, 14);
      const v = this.diceVals[i];
      const pips: Record<number, number[][]> = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
      g.fillStyle(v === 1 ? C.red : C.ink, 1);
      for (const [dx, dy] of pips[v]) g.fillCircle(cx + dx * size * 0.27, y + dy * size * 0.27, size * 0.085);
    });
  }

  private animateDice(final: [number, number], fast: boolean): Promise<void> {
    return new Promise(resolve => {
      const total = fast ? 250 : 750;
      const start = this.time.now;
      const ev = this.time.addEvent({
        delay: 70, loop: true, callback: () => {
          if (this.time.now - start >= total) { ev.remove(); this.diceVals = final; this.drawDice(); resolve(); return; }
          this.diceVals = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
          this.drawDice();
        },
      });
    });
  }

  // ---------- tokens ----------
  /** Tokens sit on the inner edge of the tile so they never hide its text. */
  private slotPos(tile: number, order: number) {
    const c = center(tile);
    const r = tileRect(tile);
    let n: [number, number];
    let dist: number;
    if (r.side === 'corner') {
      const s = Math.SQRT1_2;
      n = tile === 0 ? [s, s] : tile === 10 ? [-s, s] : tile === 20 ? [-s, -s] : [s, -s];
      dist = 66;
    } else {
      n = r.side === 'top' ? [0, 1] : r.side === 'bottom' ? [0, -1] : r.side === 'left' ? [1, 0] : [-1, 0];
      dist = 85 + 14;
    }
    const a: [number, number] = [-n[1], n[0]];
    const col = order % 2 === 0 ? -1 : 1;
    const row = Math.floor(order / 2);
    const along = r.side === 'corner' ? 28 : 25;
    const depth = dist + row * 44;
    void SLOTS;
    return { x: c.x + n[0] * depth + a[0] * col * along, y: c.y + n[1] * depth + a[1] * col * along };
  }

  private async ensureTexture(key: string, svg: string) {
    if (this.madeKeys.has(key) || this.textures.exists(key)) return;
    this.madeKeys.add(key);
    await new Promise<void>(res => {
      const img = new Image();
      img.onload = () => { if (!this.textures.exists(key)) this.textures.addImage(key, img); res(); };
      img.onerror = () => res();
      img.src = svgDataUri(svg);
    });
  }

  private tokenFor(pl: PublicGameState['players'][number], idx: number) {
    let t = this.tokens.get(pl.id);
    if (t) return t;
    const color = Phaser.Display.Color.HexStringToColor(PLAYER_COLORS[idx % 4]).color;
    const c = this.add.container(0, 0).setDepth(10);
    const shadow = this.add.circle(3, 4, 27, 0x000000, 0.4);
    const disc = this.add.circle(0, 0, 27, color, 1).setStrokeStyle(4, C.ink, 1);
    c.add([shadow, disc]);
    const key = `tok-${pl.avatar}-${idx % 4}`;
    t = { c, img: null, disc, key };
    this.tokens.set(pl.id, t);
    void this.ensureTexture(key, avatarSvg(pl.avatar, '#16130f', PLAYER_COLORS[idx % 4])).then(() => {
      const cur = this.tokens.get(pl.id);
      if (cur && !cur.img && this.textures.exists(key)) { cur.img = this.add.image(0, 0, key).setDisplaySize(50, 50); cur.c.add(cur.img); }
    });
    return t;
  }

  // ---------- sync & animation ----------
  sync(state: PublicGameState) {
    this.state = state;
    if (!this.tileLayer) { this.pendingSync = state; return; }
    this.drawDynamic();
    this.updateCenter();
    if (!this.busy) this.placeTokens();
  }

  private drawDynamic() {
    const s = this.state!;
    const g = this.dynGfx;
    g.clear();
    const colorOf = (pid: string) => Phaser.Display.Color.HexStringToColor(PLAYER_COLORS[s.players.findIndex(p => p.id === pid) % 4]).color;
    for (const [idStr, pr] of Object.entries(s.props)) {
      const id = Number(idStr);
      const r = tileRect(id);
      if (!pr.owner) continue;
      const col = colorOf(pr.owner);
      g.lineStyle(7, col, 1).strokeRect(r.x + 4, r.y + 4, r.w - 8, r.h - 8);
      // corner flag
      const f = 26;
      const fx = r.side === 'right' || r.side === 'bottom' ? r.x + r.w - 4 : r.x + 4;
      const fy = r.side === 'bottom' ? r.y + r.h - 4 : r.y + 4;
      const sx = fx > r.x + r.w / 2 ? -1 : 1, sy = fy > r.y + r.h / 2 ? -1 : 1;
      g.fillStyle(col, 1).fillPoints([{ x: fx, y: fy }, { x: fx + sx * f, y: fy }, { x: fx, y: fy + sy * f }], true);
      // development pips on the band
      const sp = SPACES[id];
      if (sp.group && pr.level > 0) {
        const vertical = r.side === 'left' || r.side === 'right';
        const bandCx = r.side === 'left' ? r.x + BAND / 2 : r.side === 'right' ? r.x + r.w - BAND / 2 : r.x + r.w / 2;
        const bandCy = r.side === 'top' ? r.y + BAND / 2 : r.side === 'bottom' ? r.y + r.h - BAND / 2 : r.y + r.h / 2;
        if (pr.level === 5) {
          const pts: Phaser.Types.Math.Vector2Like[] = [];
          for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const rad = i % 2 ? 7 : 15; pts.push({ x: bandCx + Math.cos(a) * rad, y: bandCy + Math.sin(a) * rad }); }
          g.fillStyle(C.paper, 1).fillPoints(pts, true);
          g.lineStyle(2, C.ink, 1).strokePoints(pts, true);
        } else {
          const n = pr.level, size = 14, gap = 4;
          const total = n * size + (n - 1) * gap;
          for (let i = 0; i < n; i++) {
            const px = vertical ? bandCx - size / 2 : bandCx - total / 2 + i * (size + gap);
            const py = vertical ? bandCy - total / 2 + i * (size + gap) : bandCy - size / 2;
            g.fillStyle(C.paper, 1).fillRect(px, py, size, size);
            g.lineStyle(2, C.ink, 1).strokeRect(px, py, size, size);
          }
        }
      }
      if (pr.mortgaged) {
        g.fillStyle(C.coal, 0.5).fillRect(r.x, r.y, r.w, r.h);
        g.lineStyle(6, C.red, 1).lineBetween(r.x + 8, r.y + 8, r.x + r.w - 8, r.y + r.h - 8).lineBetween(r.x + r.w - 8, r.y + 8, r.x + 8, r.y + r.h - 8);
      }
    }
    this.drawSelection();
  }

  setSelected(id: number | null) { this.selected = id; if (this.selGfx) this.drawSelection(); }

  private drawSelection() {
    const g = this.selGfx;
    g.clear();
    if (this.selected == null) return;
    const r = tileRect(this.selected);
    g.lineStyle(8, C.brass, 1).strokeRect(r.x - 1, r.y - 1, r.w + 2, r.h + 2);
  }

  private updateCenter() {
    const s = this.state!;
    const t = this.centerTexts;
    if (!t.round) return;
    const limit = s.settings.mode === 'sustainable' ? 30 : s.settings.roundLimit;
    t.round.setText(limit ? this.T('board.round_of', { n: s.round, limit }) : this.T('board.round', { n: s.round }));
    t.mode.setText(this.T(`mode.${s.settings.mode}` as const).toUpperCase());
    const actor = s.players.find(p => p.id === s.actorId) ?? s.players[s.turn];
    t.turn.setText(s.phase === 'finished' ? this.T('board.game_over') : this.T('board.to_act', { name: actor ? actor.name.toUpperCase() : '' }));
    const last = s.log[s.log.length - 1];
    t.msg.setText(last ? tm(this.lang, { key: last.key, params: last.params }) : '');
    this.fitText(t.msg, this.compact ? 140 : 110, 16);
    this.diceVals = s.dice;
    this.drawDice();
    // stat lines
    this.statTexts.forEach(x => x.destroy());
    this.statTexts = [];
    if (!this.compact) {
      s.players.forEach((p, i) => {
        const y = 830 + i * 38;
        const col = PLAYER_COLORS[i % 4];
        const line = this.add.graphics();
        line.fillStyle(Phaser.Display.Color.HexStringToColor(col).color, 1).fillRect(300, y - 13, 12, 26);
        const name = this.txt(324, y, `${p.name.toUpperCase()}${p.bankrupt ? '  ' + this.T('board.bankrupt') : ''}`, 26, p.bankrupt ? '#8a7f6a' : HEX.paper, COND, 'bold', [0, 0.5]);
        const cash = this.txt(1020, y, p.bankrupt ? '' : `${p.cash} cr`, 28, HEX.brass, COND, 'bold', [1, 0.5]);
        this.statTexts.push(name, cash);
        this.statTexts.push(line);
      });
    }
  }

  private placeTokens() {
    const s = this.state!;
    const byTile = new Map<number, string[]>();
    s.players.forEach(p => { if (!p.bankrupt) byTile.set(p.position, [...(byTile.get(p.position) ?? []), p.id]); });
    for (const t of this.tokens.values()) t.c.setVisible(false);
    s.players.forEach((p, i) => {
      const tok = this.tokenFor(p, i);
      if (p.bankrupt) { tok.c.setVisible(false); return; }
      const order = byTile.get(p.position)!.indexOf(p.id);
      const pos = this.slotPos(p.position, order);
      tok.c.setPosition(pos.x, pos.y).setVisible(true).setScale(this.compact ? 0.7 : 0.85);
      this.shown.set(p.id, p.position);
    });
  }

  async play(events: GameEvent[], fast: boolean): Promise<void> {
    if (!this.tileLayer) return;
    this.busy = true;
    try {
      for (const e of events) {
        if (e.type === 'dice') await this.animateDice(e.dice, fast);
        else if (e.type === 'move') await this.animateMove(e.playerId, e.from, e.to, e.steps, e.direct, fast);
      }
    } finally {
      this.busy = false;
    }
  }

  private animateMove(pid: string, from: number, to: number, steps: number, direct: boolean, fast: boolean): Promise<void> {
    const s = this.state;
    const idx = s ? s.players.findIndex(p => p.id === pid) : -1;
    if (!s || idx < 0) return Promise.resolve();
    const tok = this.tokenFor(s.players[idx], idx);
    tok.c.setVisible(true);
    const path: number[] = [];
    if (!direct && steps > 0) { for (let i = 1; i <= steps; i++) path.push((from + i) % 40); } else path.push(to);
    const per = direct || steps <= 0 ? 380 : Math.min(fast ? 60 : 140, 1500 / Math.max(1, path.length));
    const start = center(from);
    tok.c.setPosition(start.x, start.y);
    return new Promise(resolve => {
      const next = (i: number) => {
        if (i >= path.length) { resolve(); return; }
        const dest = i === path.length - 1 ? this.slotPos(path[i], 0) : center(path[i]);
        this.tweens.add({
          targets: tok.c, x: dest.x, y: dest.y, duration: per, ease: 'Sine.easeInOut',
          onComplete: () => next(i + 1),
        });
        this.tweens.add({ targets: tok.c, scale: { from: 0.85, to: 1.1 }, duration: per / 2, yoyo: true });
      };
      next(0);
    });
  }
}
