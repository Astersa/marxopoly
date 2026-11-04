import { GROUPS, GROUP_SPACES, SPACES } from './board';
import { canPropose, isLegal, legalActions } from './engine';
import { currentActor, developCost, getPlayer, mortgageValue, ownedBy, ownsFullGroup, unmortgageCost } from './rules';
import type { Action, GameState, Trade } from './types';

const has = (acts: Action[], t: Action['type']) => acts.some(a => a.type === t);

function spaceValue(id: number) { return SPACES[id].price ?? 0; }

function wouldCompleteGroup(s: GameState, pid: string, spaceId: number): boolean {
  const g = SPACES[spaceId].group;
  if (!g) return false;
  return GROUP_SPACES[g].every(id => id === spaceId || s.props[id].owner === pid);
}

/** Debt handling shared by bot and autopilot: pay, else sell levels, else mortgage, else go bankrupt. */
function debtAction(s: GameState, pid: string, acts: Action[]): Action {
  if (has(acts, 'pay_debt')) return { type: 'pay_debt' };
  const sells = acts.filter(a => a.type === 'sell_development') as Extract<Action, { type: 'sell_development' }>[];
  if (sells.length) return sells[0];
  const morts = (acts.filter(a => a.type === 'mortgage') as Extract<Action, { type: 'mortgage' }>[])
    .sort((a, b) => mortgageValue(b.spaceId) - mortgageValue(a.spaceId));
  if (morts.length) return morts[0];
  return { type: 'declare_bankruptcy' };
}

/** Conservative auto-play used for disconnected / timed-out humans. */
export function autopilotAction(s: GameState, pid: string): Action | null {
  if (s.phase === 'finished') return null;
  const acts = legalActions(s, pid);
  if (s.trade && s.trade.toId === pid) return { type: 'trade_reject' };
  if (s.trade && s.trade.fromId === pid) return { type: 'trade_cancel' };
  if (s.phase === 'debt') return debtAction(s, pid, acts);
  if (has(acts, 'roll')) return { type: 'roll' };
  if (has(acts, 'decline')) return { type: 'decline' };
  if (has(acts, 'auction_pass')) return { type: 'auction_pass' };
  if (has(acts, 'end_turn')) return { type: 'end_turn' };
  return acts[0] ?? null;
}

function evalTrade(s: GameState, t: Trade, pid: string): boolean {
  const receive = t.offerCash + t.offerSpaces.reduce((a, id) => a + spaceValue(id), 0);
  const give = t.requestCash + t.requestSpaces.reduce((a, id) => a + spaceValue(id), 0);
  if (receive < 1.2 * give) return false;
  // do not hand the proposer a complete group
  for (const id of t.requestSpaces) {
    const g = SPACES[id].group;
    if (!g) continue;
    const all = GROUP_SPACES[g].every(x => s.props[x].owner === t.fromId || t.requestSpaces.includes(x));
    const hadAlready = GROUP_SPACES[g].every(x => s.props[x].owner === t.fromId);
    if (all && !hadAlready) return false;
  }
  return true;
}

function proposeTrade(s: GameState, pid: string): Action | null {
  if (s.tradesThisTurn >= 1 || !canPropose(s, pid)) return null;
  const me = getPlayer(s, pid)!;
  for (const g of Object.keys(GROUP_SPACES) as (keyof typeof GROUP_SPACES)[]) {
    const ids = GROUP_SPACES[g];
    const mine = ids.filter(id => s.props[id].owner === pid);
    const missing = ids.filter(id => s.props[id].owner !== pid);
    if (mine.length === 0 || missing.length !== 1) continue;
    const target = missing[0];
    const owner = s.props[target].owner;
    if (!owner) continue;
    if (ids.some(id => s.props[id].level > 0)) continue;
    const offer = Math.round(SPACES[target].price! * 1.5);
    if (me.cash - offer < 150) continue;
    const other = getPlayer(s, owner)!;
    if (other.bankrupt) continue;
    if (GROUP_SPACES[SPACES[target].group!].some(id => s.props[id].level > 0)) continue;
    const act: Action = { type: 'trade_propose', toId: owner, offerCash: offer, requestCash: 0, offerSpaces: [], requestSpaces: [target] };
    if (isLegal(s, pid, act)) return act;
  }
  return null;
}

/** Heuristic bot. Returns the next action for `pid` (which must be the current actor). */
export function botAction(s: GameState, pid: string): Action | null {
  if (s.phase === 'finished') return null;
  const me = getPlayer(s, pid)!;
  const acts = legalActions(s, pid);
  if (s.trade && s.trade.toId === pid) return evalTrade(s, s.trade, pid) ? { type: 'trade_accept' } : { type: 'trade_reject' };
  if (s.trade && s.trade.fromId === pid) return { type: 'trade_cancel' };

  switch (s.phase) {
    case 'debt': return debtAction(s, pid, acts);
    case 'auction': {
      const a = s.auction!;
      const limit = Math.min(0.9 * (SPACES[a.spaceId].price ?? 0), me.cash - 100);
      const bid = a.highBid + 10;
      if (bid <= limit && has(acts, 'auction_bid')) return { type: 'auction_bid', amount: bid };
      return { type: 'auction_pass' };
    }
    case 'buy': {
      const sp = SPACES[s.pendingPurchase!.spaceId];
      if (has(acts, 'buy') && (me.cash - sp.price! >= 50 || wouldCompleteGroup(s, pid, sp.id))) return { type: 'buy' };
      return { type: 'decline' };
    }
    case 'roll': {
      if (me.inJail) {
        if (has(acts, 'jail_card')) return { type: 'jail_card' };
        if (me.cash > 500 && has(acts, 'jail_pay')) return { type: 'jail_pay' };
      }
      return { type: 'roll' };
    }
    case 'post_roll': {
      // redeem mortgages when rich
      const redeem = ownedBy(s, pid).filter(id => s.props[id].mortgaged && me.cash - unmortgageCost(id) > 400).sort((a, b) => spaceValue(b) - spaceValue(a));
      if (redeem.length) return { type: 'unmortgage', spaceId: redeem[0] };
      // develop while there is a comfortable surplus
      const devs = (acts.filter(a => a.type === 'develop') as Extract<Action, { type: 'develop' }>[])
        .filter(a => me.cash - developCost(s, pid, a.spaceId) > 200)
        .sort((a, b) => (s.props[a.spaceId].level - s.props[b.spaceId].level) || (GROUPS[SPACES[b.spaceId].group!].mPrime - GROUPS[SPACES[a.spaceId].group!].mPrime));
      if (devs.length) return devs[0];
      const t = proposeTrade(s, pid);
      if (t) return t;
      return { type: 'end_turn' };
    }
  }
  return null;
}

