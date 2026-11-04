import { describe, expect, it } from 'vitest';
import { GROUPS, GROUP_SPACES, RENTS, SPACES, capitalIndicators } from '../src/shared/board';
import { GLOSSARY } from '../src/shared/glossary';

describe('board', () => {
  it('has exactly 40 spaces with the right kinds', () => {
    expect(SPACES).toHaveLength(40);
    const count = (k: string) => SPACES.filter(s => s.kind === k).length;
    expect(count('property')).toBe(22);
    expect(count('station')).toBe(4);
    expect(count('utility')).toBe(2);
    expect(count('event')).toBe(3);
    expect(count('policy')).toBe(3);
    expect(count('tax')).toBe(2);
    expect(count('go') + count('jail') + count('free') + count('gotojail')).toBe(4);
    [0, 10, 20, 30].forEach(i => expect(['go', 'jail', 'free', 'gotojail']).toContain(SPACES[i].kind));
  });
  it('matches the plan prices and names', () => {
    expect(SPACES[0].name).toBe('GO: Expanded Reproduction');
    expect(SPACES[39].name).toBe('Smart Supply Chain Complex');
    expect(SPACES[1].price).toBe(60);
    expect(SPACES[3].price).toBe(80);
    expect(SPACES[39].price).toBe(400);
    for (const g of Object.keys(GROUPS) as (keyof typeof GROUPS)[]) {
      GROUP_SPACES[g].forEach((id, i) => expect(SPACES[id].price).toBe(GROUPS[g].prices[i]));
    }
  });
  it('rent table rises with level and rounds to multiples of 5', () => {
    for (const id of Object.keys(RENTS).map(Number)) {
      const r = RENTS[id];
      expect(r).toHaveLength(6);
      for (let i = 2; i < 6; i++) { expect(r[i] % 5).toBe(0); expect(r[i]).toBeGreaterThanOrEqual(r[i - 1]); }
    }
    expect(RENTS[1][0]).toBe(4);
  });
  it('short names fit and education text exists', () => {
    for (const s of SPACES) {
      expect(s.shortName.length).toBeLessThanOrEqual(24);
      for (const f of [s.definition, s.explanation, s.example, s.mechanic]) expect(f.length).toBeGreaterThan(5);
    }
    const ids = new Set(GLOSSARY.map(g => g.id));
    for (const s of SPACES) if (s.glossary) expect(ids.has(s.glossary)).toBe(true);
    expect(GLOSSARY.length).toBeGreaterThanOrEqual(25);
  });
  it('c, v, s, p-prime formulas', () => {
    const ind = capitalIndicators(11, 0)!;
    expect(ind.K).toBe(140);
    expect(ind.c).toBeCloseTo((140 * 5) / 6);
    expect(ind.v).toBeCloseTo(140 / 6);
    expect(ind.s).toBeCloseTo(ind.v * 1);
    expect(ind.profitRate).toBeCloseTo(ind.s / (ind.c + ind.v));
  });
});
