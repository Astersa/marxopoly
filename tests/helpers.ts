import { applyAction, createGame } from '../src/shared/engine';
import { DEFAULT_SETTINGS, type Action, type GameSettings, type GameState, type Rng } from '../src/shared/types';

export function mulberry(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function scripted(...faces: number[]): Rng {
  const q = faces.map(f => (f - 0.5) / 6);
  return () => (q.length ? q.shift()! : 0.5);
}

export function newGame(n = 3, settings: Partial<GameSettings> = {}, seed = 1): GameState {
  const players = Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'P' + i, avatar: i, isBot: false }));
  return createGame(players, { ...DEFAULT_SETTINGS, ...settings }, mulberry(seed));
}

export function act(s: GameState, pid: string, a: Action, rng: Rng = mulberry(7)) {
  return applyAction(s, pid, a, rng);
}

export function roll(s: GameState, pid: string, a: number, b: number) {
  return applyAction(s, pid, { type: 'roll' }, scripted(a, b));
}

export function give(s: GameState, pid: string, ids: number[]) {
  for (const id of ids) s.props[id].owner = pid;
}
