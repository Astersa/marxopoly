import { CARD_MAP } from './cards';
import { GROUPS } from './board';
import { netWorth, ownedBy } from './rules';
import { SPACES } from './board';
import type { GameState, ScoreLine, Standing } from './types';

export const SUSTAINABLE_ROUNDS = 30;
export const WEIGHTS = { financial: 0.35, social: 0.25, technology: 0.2, sustainability: 0.2 };

export function roundLimitOf(s: Pick<GameState, 'settings'>): number {
  return s.settings.mode === 'sustainable' ? SUSTAINABLE_ROUNDS : s.settings.roundLimit;
}

export function computeScores(s: GameState): Record<string, ScoreLine> {
  const alive = s.players.filter(p => !p.bankrupt);
  const maxNw = Math.max(0, ...alive.map(p => netWorth(s, p.id)));
  const out: Record<string, ScoreLine> = {};
  for (const p of s.players) {
    const nw = netWorth(s, p.id);
    const financial = maxNw > 0 ? Math.max(0, Math.min(100, (nw / maxNw) * 100)) : 0;
    const social = 0.7 * p.indices.socialContribution + 0.3 * p.indices.laborRelations;
    const technology = p.indices.technology;
    const sustainability = p.indices.sustainability;
    const total = WEIGHTS.financial * financial + WEIGHTS.social * social + WEIGHTS.technology * technology + WEIGHTS.sustainability * sustainability;
    out[p.id] = { financial, social, technology, sustainability, total };
  }
  return out;
}

/** Ranking: survivors first. Sustainable ranks by total score then net worth; capitalist by net worth. */
export function rankPlayers(s: GameState): Standing[] {
  const scores = computeScores(s);
  const rows = s.players.map(p => ({ p, nw: netWorth(s, p.id), sc: scores[p.id] }));
  const sustainable = s.settings.mode === 'sustainable';
  rows.sort((a, b) => {
    if (a.p.bankrupt !== b.p.bankrupt) return a.p.bankrupt ? 1 : -1;
    if (sustainable && Math.abs(a.sc.total - b.sc.total) > 1e-9) return b.sc.total - a.sc.total;
    return b.nw - a.nw;
  });
  return rows.map((r, i) => ({ playerId: r.p.id, rank: i + 1, bankrupt: r.p.bankrupt, netWorth: r.nw, scores: r.sc }));
}

export function conceptsEncountered(s: GameState): string[] {
  const ids = new Set<string>();
  for (const cid of s.cardsSeen) if (CARD_MAP[cid]) ids.add(CARD_MAP[cid].topic);
  for (const p of s.players) for (const id of ownedBy(s, p.id)) {
    const sp = SPACES[id];
    if (sp.group) ids.add(GROUPS[sp.group].glossary);
    else if (sp.glossary) ids.add(sp.glossary);
  }
  ids.add('surplus-value');
  return [...ids];
}
