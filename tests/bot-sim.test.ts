import { describe, expect, it } from 'vitest';
import { botAction } from '../src/shared/bot';
import { applyAction, createGame, currentActor } from '../src/shared/engine';
import { DEFAULT_SETTINGS, type GameSettings, type GameState } from '../src/shared/types';
import { SPACES } from '../src/shared/board';
import { mulberry } from './helpers';

function checkInvariants(s: GameState) {
  for (const p of s.players) {
    expect(p.cash).toBeGreaterThanOrEqual(0);
    for (const v of Object.values(p.indices)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100); }
    if (p.bankrupt) expect(Object.values(s.props).some(pr => pr.owner === p.id)).toBe(false);
  }
  for (const [id, pr] of Object.entries(s.props)) {
    if (pr.owner) {
      const o = s.players.find(p => p.id === pr.owner)!;
      expect(o.bankrupt).toBe(false);
    } else { expect(pr.level).toBe(0); expect(pr.mortgaged).toBe(false); }
    if (pr.mortgaged) expect(pr.level).toBe(0);
    expect(SPACES[Number(id)].price).toBeTruthy();
  }
  if (s.phase !== 'finished') {
    const a = currentActor(s);
    expect(a).toBeTruthy();
    expect(s.players.find(p => p.id === a)!.bankrupt).toBe(false);
  }
}

function simulate(seed: number, settings: GameSettings, n = 4) {
  const rng = mulberry(seed);
  const players = Array.from({ length: n }, (_, i) => ({ id: 'b' + i, name: 'Bot' + i, avatar: i, isBot: true }));
  let s = createGame(players, settings, rng);
  let steps = 0;
  while (s.phase !== 'finished' && steps++ < 20000) {
    const actor = currentActor(s)!;
    const a = botAction(s, actor);
    if (!a) throw new Error('bot has no action in phase ' + s.phase);
    s = applyAction(s, actor, a, rng).state;
    if (steps % 25 === 0) checkInvariants(s);
  }
  checkInvariants(s);
  return { s, steps };
}

describe('bot simulation', () => {
  it('capitalist games finish with consistent state across seeds', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { s, steps } = simulate(seed, { ...DEFAULT_SETTINGS, roundLimit: 40 }, 2 + (seed % 3));
      expect(steps).toBeLessThan(20000);
      expect(s.phase).toBe('finished');
      expect(s.result).toBeTruthy();
      expect(s.round).toBeLessThanOrEqual(40);
    }
  });
  it('sustainable games end by round 30', () => {
    for (let seed = 100; seed < 110; seed++) {
      const { s } = simulate(seed, { ...DEFAULT_SETTINGS, mode: 'sustainable' });
      expect(s.phase).toBe('finished');
      expect(s.round).toBeLessThanOrEqual(30);
      const alive = s.players.filter(p => !p.bankrupt).length;
      if (alive > 1) { expect(s.round).toBe(30); expect(s.result!.reason).toBe('round_limit'); }
      expect(s.result!.standings).toHaveLength(4);
    }
  });
});
