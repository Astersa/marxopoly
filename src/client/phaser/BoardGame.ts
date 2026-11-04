import Phaser from 'phaser';
import type { GameEvent, PublicGameState } from '../../shared/types';
import type { Lang } from '../../shared/i18n';
import { useStore } from '../store';
import type { BoardApi } from '../boardRef';
import { BoardScene } from './BoardScene';
import { CANVAS } from './layout';

/** Thin wrapper so React never touches the scene directly. */
export class BoardGame implements BoardApi {
  private game: Phaser.Game;
  private scene: BoardScene;
  private destroyed = false;
  private ro: ResizeObserver | null = null;
  private latest: PublicGameState | null = null;
  private selected: number | null = null;
  private lang: Lang = useStore.getState().lang;
  private click: ((id: number) => void) | null = null;

  private constructor(parent: HTMLElement) {
    this.scene = new BoardScene();
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      parent,
      width: CANVAS,
      height: CANVAS,
      backgroundColor: '#16130f',
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      scene: this.scene,
      input: { mouse: { preventDefaultWheel: false }, touch: { capture: false } },
      banner: false,
      fps: { target: 60 },
    });
    this.ro = new ResizeObserver(() => { if (!this.destroyed) this.game.scale.refresh(); });
    this.ro.observe(parent);
    this.scene.onReady(() => {
      this.scene.setLang(this.lang);
      if (this.click) this.scene.setClick(this.click);
      this.scene.setSelected(this.selected);
      if (this.latest) this.scene.sync(this.latest);
    });
  }

  static async create(parent: HTMLElement): Promise<BoardGame> {
    try {
      await Promise.all([
        // Canvas does not pull unicode-range subsets by itself: ask for Vietnamese glyphs explicitly.
        document.fonts.load('700 20px "Barlow Condensed"', 'Ệ ầ ơ ư'),
        document.fonts.load('700 20px "Barlow Condensed"', 'AB'),
        document.fonts.load('400 20px "Anton"', 'Ệ ầ ơ ư'),
        document.fonts.load('400 20px "Anton"', 'AB'),
        document.fonts.load('400 20px "Barlow"', 'Ệ ầ ơ ư'),
      ]);
    } catch { /* fonts are best effort */ }
    return new BoardGame(parent);
  }

  sync(state: PublicGameState) { this.latest = state; if (!this.destroyed) this.scene.sync(state); }
  play(events: GameEvent[], fast: boolean) { return this.destroyed ? Promise.resolve() : this.scene.play(events, fast); }
  onSpaceClick(cb: (id: number) => void) { this.click = cb; this.scene.setClick(cb); }
  setSelected(id: number | null) { this.selected = id; this.scene.setSelected(id); }
  setLang(lang: Lang) { this.lang = lang; this.scene.setLang(lang); }
  destroy() { this.destroyed = true; this.ro?.disconnect(); this.game.destroy(true); }
}
