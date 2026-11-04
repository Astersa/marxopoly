import Phaser from 'phaser';
import type { GameEvent, PublicGameState } from '../../shared/types';
import type { BoardApi } from '../boardRef';
import { BoardScene } from './BoardScene';
import { CANVAS } from './layout';

/** Thin wrapper so React never touches the scene directly. */
export class BoardGame implements BoardApi {
  private game: Phaser.Game;
  private scene: BoardScene;
  private destroyed = false;
  private latest: PublicGameState | null = null;
  private selected: number | null = null;
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
    this.scene.onReady(() => {
      if (this.click) this.scene.setClick(this.click);
      this.scene.setSelected(this.selected);
      if (this.latest) this.scene.sync(this.latest);
    });
  }

  static async create(parent: HTMLElement): Promise<BoardGame> {
    try {
      await Promise.all([
        document.fonts.load('700 20px "Barlow Condensed"'),
        document.fonts.load('400 20px "Anton"'),
        document.fonts.load('400 20px "Barlow"'),
      ]);
    } catch { /* fonts are best effort */ }
    return new BoardGame(parent);
  }

  sync(state: PublicGameState) { this.latest = state; if (!this.destroyed) this.scene.sync(state); }
  play(events: GameEvent[], fast: boolean) { return this.destroyed ? Promise.resolve() : this.scene.play(events, fast); }
  onSpaceClick(cb: (id: number) => void) { this.click = cb; this.scene.setClick(cb); }
  setSelected(id: number | null) { this.selected = id; this.scene.setSelected(id); }
  destroy() { this.destroyed = true; this.game.destroy(true); }
}
