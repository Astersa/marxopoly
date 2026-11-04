import { describe, expect, it } from 'vitest';
import { CARDS, validateCards } from '../src/shared/cards';
import { GLOSSARY_MAP } from '../src/shared/glossary';
import { give, newGame, roll } from './helpers';

describe('cards', () => {
  it('validates definitions and counts', () => {
    expect(CARDS.filter(c => c.deck === 'objective').length).toBeGreaterThanOrEqual(10);
    expect(CARDS.filter(c => c.deck === 'policy').length).toBeGreaterThanOrEqual(11);
    CARDS.forEach(c => expect(GLOSSARY_MAP[c.topic]).toBeTruthy());
    expect(() => validateCards([{ id: 'x' }])).toThrow();
  });
  it('covers every effect type', () => {
    const types = new Set<string>(CARDS.flatMap(c => c.effects.map(e => e.type)));
    for (const t of ['cash', 'cashPercent', 'cashPerLevel', 'collectFromOthers', 'index', 'move', 'moveBy', 'moveToNearest', 'jail', 'jailFreeCard', 'depreciate', 'modifier']) expect(types.has(t)).toBe(true);
  });
  it('covers the required topics', () => {
    const names = CARDS.map(c => c.name.toLowerCase()).join('|');
    for (const n of ['economic crisis', 'technological innovation', 'depreciation', 'inflation', 'overproduction', 'capital export', 'supply chain', 'supply and demand', 'capital efficiency', 'taxation', 'social welfare', 'public investment', 'green economy', 'labor protection', 'financial regulation']) expect(names).toContain(n);
  });
  for (const card of CARDS) {
    it(`plays ${card.id} without breaking state`, () => {
      const s = newGame(3);
      give(s, 'p0', [11, 12, 13]);
      s.props[11].level = 2; s.props[12].level = 2; s.props[13].level = 2;
      s.decks[card.deck].draw = [card.id];
      const [a, b] = card.deck === 'objective' ? [1, 1] : [3, 4];
      const r = roll(s, 'p0', a, b);
      expect(r.state.cardsSeen).toContain(card.id);
      r.state.players.forEach(p => { expect(p.cash).toBeGreaterThanOrEqual(0); for (const v of Object.values(p.indices)) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100); } });
      const kept = r.state.players.some(p => p.jailCards.includes(card.id));
      expect(kept || r.state.decks[card.deck].discard.includes(card.id) || r.state.decks[card.deck].draw.includes(card.id)).toBe(true);
    });
  }
  it('effects do what they say', () => {
    let s = newGame(3); give(s, 'p0', [11, 12, 13]); s.props[11].level = 3;
    s.decks.objective.draw = ['obj-depreciation'];
    let r = roll(s, 'p0', 1, 1);
    expect(r.state.props[11].level).toBe(2);
    s = newGame(3); s.decks.objective.draw = ['obj-inflation'];
    r = roll(s, 'p0', 1, 1);
    expect(r.state.players.map(p => p.cash)).toEqual([1450, 1450, 1450]);
    s = newGame(3); s.decks.policy.draw = ['pol-solidarity'];
    r = roll(s, 'p0', 3, 4);
    expect(r.state.players.map(p => p.cash)).toEqual([1560, 1470, 1470]);
    s = newGame(3); s.decks.objective.draw = ['obj-strike'];
    r = roll(s, 'p0', 1, 1);
    expect(r.state.players[0].inJail).toBe(true);
    expect(r.state.players[0].position).toBe(10);
    s = newGame(3); s.decks.objective.draw = ['obj-collective'];
    r = roll(s, 'p0', 1, 1);
    expect(r.state.players[0].jailCards).toEqual(['obj-collective']);
    s = newGame(3); s.decks.objective.draw = ['obj-crisis'];
    r = roll(s, 'p0', 1, 1);
    expect(r.state.modifiers[0]).toMatchObject({ kind: 'rent', multiplier: 0.8, roundsLeft: 2 });
    s = newGame(3); s.decks.objective.draw = ['obj-capital-export'];
    r = roll(s, 'p0', 1, 1);
    expect(r.state.players[0].position).toBe(5);
    s = newGame(3); s.decks.policy.draw = ['pol-antitrust'];
    r = roll(s, 'p0', 3, 4);
    expect(r.state.players[0].position).toBe(4);
  });
  it('reshuffles the discard when the deck runs out', () => {
    const s = newGame(2); s.decks.objective.draw = []; s.decks.objective.discard = ['obj-inflation'];
    const r = roll(s, 'p0', 1, 1);
    expect(r.state.cardsSeen).toContain('obj-inflation');
  });
});
