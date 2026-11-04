import { describe, expect, it } from 'vitest';
import { computeScores, rankPlayers, roundLimitOf } from '../src/shared/scoring';
import { applyAction } from '../src/shared/engine';
import { give, newGame, mulberry } from './helpers';

describe('scoring', () => {
  it('computes the weighted sustainable score', () => {
    const s = newGame(2, { mode: 'sustainable' });
    s.players[0].indices = { technology: 40, laborRelations: 60, socialContribution: 30, sustainability: 80 };
    s.players[1].indices = { technology: 10, laborRelations: 50, socialContribution: 10, sustainability: 50 };
    s.players[1].cash = 750;
    const sc = computeScores(s);
    expect(sc.p0.financial).toBe(100);
    expect(sc.p1.financial).toBeCloseTo(50);
    expect(sc.p0.social).toBeCloseTo(0.7 * 30 + 0.3 * 60);
    expect(sc.p0.total).toBeCloseTo(0.35 * 100 + 0.25 * 39 + 0.2 * 40 + 0.2 * 80);
    expect(rankPlayers(s)[0].playerId).toBe('p0');
  });
  it('ties break on net worth; bankrupt rank last', () => {
    const s = newGame(3, { mode: 'sustainable' });
    s.players[1].cash = 2000;
    s.players[2].bankrupt = true; s.players[2].cash = 0;
    const r = rankPlayers(s);
    expect(r[r.length - 1].playerId).toBe('p2');
    expect(r[r.length - 1].bankrupt).toBe(true);
  });
  it('sustainable mode ends after round 30; capitalist limit uses net worth', () => {
    const s = newGame(2, { mode: 'sustainable' });
    expect(roundLimitOf(s)).toBe(30);
    s.round = 30; s.turn = 1; s.phase = 'post_roll'; s.rollAgain = false;
    give(s, 'p0', [1]);
    const r = applyAction(s, 'p1', { type: 'end_turn' }, mulberry(1));
    expect(r.state.phase).toBe('finished');
    expect(r.state.result!.reason).toBe('round_limit');
    expect(r.state.round).toBe(30);
    const c = newGame(2, { roundLimit: 40 });
    c.round = 40; c.turn = 1; c.phase = 'post_roll'; c.rollAgain = false; c.players[0].cash = 3000;
    const r2 = applyAction(c, 'p1', { type: 'end_turn' }, mulberry(1));
    expect(r2.state.result!.winnerId).toBe('p0');
  });
});
