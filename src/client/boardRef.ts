import type { GameEvent, PublicGameState } from '../shared/types';

export interface BoardApi {
  sync(state: PublicGameState): void;
  play(events: GameEvent[], fast: boolean): Promise<void>;
  onSpaceClick(cb: (id: number) => void): void;
  setSelected(id: number | null): void;
  destroy(): void;
}

export const boardRef: { current: BoardApi | null } = { current: null };
