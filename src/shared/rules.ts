import { GROUPS, GROUP_SPACES, RENTS, SPACES, STATION_IDS, UTILITY_IDS, capitalIndicators } from './board';
import type { GameState, Modifier, PlayerState, PropState } from './types';

export const MIN_BID_STEP = 10;
export const MAX_TRADES_PER_TURN = 3;
export const MAX_LEVEL = 5;

export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export const getPlayer = (s: Pick<GameState, 'players'>, id: string): PlayerState | undefined => s.players.find(p => p.id === id);
export const activePlayers = (s: Pick<GameState, 'players'>) => s.players.filter(p => !p.bankrupt);
export const turnPlayer = (s: GameState) => s.players[s.turn];

export function ownedBy(s: GameState, pid: string): number[] {
  return Object.keys(s.props).map(Number).filter(id => s.props[id].owner === pid).sort((a, b) => a - b);
}

export function ownsFullGroup(s: GameState, pid: string, spaceId: number): boolean {
  const g = SPACES[spaceId].group;
  if (!g) return false;
  return GROUP_SPACES[g].every(id => s.props[id]?.owner === pid);
}

export function groupLevels(s: GameState, spaceId: number): number[] {
  const g = SPACES[spaceId].group;
  return g ? GROUP_SPACES[g].map(id => s.props[id].level) : [];
}

export function modifierProduct(s: GameState, kind: Modifier['kind'], pid: string): number {
  return s.modifiers.filter(m => m.kind === kind && m.playerIds.includes(pid)).reduce((acc, m) => acc * m.multiplier, 1);
}

export function rentFor(s: GameState, spaceId: number, diceTotal: number): number {
  const sp = SPACES[spaceId];
  const prop = s.props[spaceId];
  if (!prop || !prop.owner || prop.mortgaged) return 0;
  const owner = getPlayer(s, prop.owner)!;
  let rent = 0;
  if (sp.kind === 'property') {
    const table = RENTS[spaceId];
    rent = prop.level === 0 && ownsFullGroup(s, prop.owner, spaceId) ? table[0] * 2 : table[prop.level];
  } else if (sp.kind === 'station') {
    const n = STATION_IDS.filter(id => s.props[id]?.owner === prop.owner).length;
    rent = 25 * 2 ** (n - 1);
  } else if (sp.kind === 'utility') {
    const n = UTILITY_IDS.filter(id => s.props[id]?.owner === prop.owner).length;
    rent = diceTotal * (n >= 2 ? 10 : 4);
  }
  rent *= modifierProduct(s, 'rent', prop.owner);
  if (owner.indices.laborRelations < 25) rent *= 0.85;
  return Math.round(rent);
}

export function developCost(s: GameState, pid: string, spaceId: number): number {
  const g = GROUPS[SPACES[spaceId].group!];
  const p = getPlayer(s, pid)!;
  let cost = g.buildCost;
  if (p.indices.technology >= 60) cost *= 0.9;
  cost *= modifierProduct(s, 'develop_cost', pid);
  return Math.round(cost);
}

export const mortgageValue = (spaceId: number) => Math.floor(SPACES[spaceId].price! / 2);
export const unmortgageCost = (spaceId: number) => Math.ceil(SPACES[spaceId].price! * 0.55);

export interface Financials { assets: number; liabilities: number; netWorth: number; productiveCapital: number }

export function financials(s: GameState, pid: string): Financials {
  const p = getPlayer(s, pid)!;
  let assets = p.cash;
  let liabilities = 0;
  let productive = 0;
  for (const id of ownedBy(s, pid)) {
    const sp = SPACES[id];
    const prop: PropState = s.props[id];
    const buildCost = sp.group ? GROUPS[sp.group].buildCost : 0;
    assets += sp.price! + prop.level * buildCost;
    if (prop.mortgaged) liabilities += mortgageValue(id);
    else if (sp.kind === 'property') productive += capitalIndicators(id, prop.level)!.K;
  }
  liabilities += s.debts.filter(d => d.playerId === pid).reduce((a, d) => a + d.amount, 0);
  return { assets, liabilities, netWorth: assets - liabilities, productiveCapital: Math.round(productive) };
}

export const netWorth = (s: GameState, pid: string) => financials(s, pid).netWorth;

/** Who is expected to act next. */
export function currentActor(s: GameState): string | null {
  if (s.phase === 'finished') return null;
  if (s.trade) return s.trade.toId;
  if (s.phase === 'auction' && s.auction) return s.auction.order[s.auction.turnIdx] ?? null;
  if (s.phase === 'debt' && s.debts.length) return s.debts[0].playerId;
  return turnPlayer(s)?.id ?? null;
}

/** Can this player sell/mortgage/develop/trade right now? */
export function canManage(s: GameState, pid: string): boolean {
  if (s.trade || s.auction || s.phase === 'finished') return false;
  if (s.phase === 'debt') return s.debts[0]?.playerId === pid;
  return ['roll', 'post_roll', 'buy'].includes(s.phase) && turnPlayer(s).id === pid && !turnPlayer(s).bankrupt;
}

export function modifierLabel(m: Modifier): string {
  const k = m.kind === 'rent' ? 'Rent' : m.kind === 'develop_cost' ? 'Development cost' : 'GO reward';
  return `${k} x${m.multiplier}`;
}

