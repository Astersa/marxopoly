import { BOARD_SIZE, GO_REWARD, GROUPS, GROUP_SPACES, JAIL_FINE, JAIL_POS, SPACES, START_CASH, isOwnable } from './board';
import { CARDS, CARD_MAP, deckCards, type Card, type Effect } from './cards';
import {
  MAX_LEVEL, MAX_TRADES_PER_TURN, MIN_BID_STEP, activePlayers, canManage, clamp, currentActor, developCost, getPlayer, groupLevels,
  mortgageValue, netWorth, ownedBy, ownsFullGroup, rentFor, turnPlayer, unmortgageCost, modifierProduct,
} from './rules';
import { conceptsEncountered, rankPlayers, roundLimitOf } from './scoring';
import {
  ActionError, INDEX_KEYS,
  type Action, type DeckId, type GameEvent, type GameSettings, type GameState, type Indices, type PlayerState, type PublicGameState, type Rng, type Trade,
} from './types';

export { currentActor } from './rules';

interface Ctx { s: GameState; ev: GameEvent[]; rng: Rng }

export function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface NewPlayer { id: string; name: string; avatar: number; isBot: boolean }

export function createGame(players: NewPlayer[], settings: GameSettings, rng: Rng): GameState {
  const props: GameState['props'] = {};
  SPACES.forEach(sp => { if (isOwnable(sp.id)) props[sp.id] = { owner: null, level: 0, mortgaged: false }; });
  const s: GameState = {
    settings: { ...settings },
    players: players.map(p => ({
      ...p, cash: START_CASH, position: 0, inJail: false, jailTurns: 0, jailCards: [], bankrupt: false, connected: true,
      indices: { technology: 10, laborRelations: 50, socialContribution: 10, sustainability: 50 },
    })),
    turn: 0, round: 1, phase: 'roll', dice: [1, 1], doublesCount: 0, rollAgain: true, props,
    pendingPurchase: null, auction: null, debts: [], trade: null, tradesThisTurn: 0,
    decks: {
      objective: { draw: shuffle(deckCards('objective').map(c => c.id), rng), discard: [] },
      policy: { draw: shuffle(deckCards('policy').map(c => c.id), rng), discard: [] },
    },
    modifiers: [], lastCard: null, cardsSeen: [], log: [], result: null, nextId: 1,
  };
  s.log.push({ n: s.nextId++, round: 1, text: 'The game begins. Good luck!' });
  return s;
}

export function toPublic(s: GameState, extra: { deadline: number | null }): PublicGameState {
  const { decks, ...rest } = s;
  return {
    ...structuredClone(rest),
    deckCounts: { objective: decks.objective.draw.length, policy: decks.policy.draw.length },
    deadline: extra.deadline,
    actorId: currentActor(s),
  };
}

// ---------- helpers ----------

function say(c: Ctx, text: string) {
  c.s.log.push({ n: c.s.nextId++, round: c.s.round, text });
  if (c.s.log.length > 150) c.s.log.splice(0, c.s.log.length - 150);
  c.ev.push({ type: 'log', text });
}

const P = (c: Ctx, id: string): PlayerState => {
  const p = getPlayer(c.s, id);
  if (!p) throw new ActionError('UNKNOWN_PLAYER', 'Unknown player');
  return p;
};

function addIndices(p: PlayerState, delta: Indices, sign = 1) {
  for (const k of INDEX_KEYS) p.indices[k] = clamp(p.indices[k] + sign * delta[k], 0, 100);
}
function bumpIndex(p: PlayerState, key: keyof Indices, delta: number) {
  p.indices[key] = clamp(p.indices[key] + delta, 0, 100);
}

function payOrDebt(c: Ctx, fromId: string, toId: string | null, amount: number, reason: string) {
  if (amount <= 0) return;
  const from = P(c, fromId);
  if (from.bankrupt) return;
  if (from.cash >= amount) {
    from.cash -= amount;
    if (toId) { const to = getPlayer(c.s, toId); if (to) to.cash += amount; }
    c.ev.push({ type: 'cash', playerId: fromId, delta: -amount, reason });
    if (toId) c.ev.push({ type: 'cash', playerId: toId, delta: amount, reason });
    say(c, `${from.name} pays ${amount} cr${toId ? ' to ' + P(c, toId).name : ''} (${reason}).`);
  } else {
    c.s.debts.push({ id: c.s.nextId++, playerId: fromId, toId, amount, reason });
    say(c, `${from.name} owes ${amount} cr (${reason}) and must raise cash.`);
  }
}

function gain(c: Ctx, p: PlayerState, amount: number, reason: string) {
  p.cash += amount;
  c.ev.push({ type: 'cash', playerId: p.id, delta: amount, reason });
  say(c, `${p.name} receives ${amount} cr (${reason}).`);
}

function grantGo(c: Ctx, p: PlayerState) {
  const amt = Math.round(GO_REWARD * modifierProduct(c.s, 'go_reward', p.id));
  gain(c, p, amt, 'GO');
}

function sendToJail(c: Ctx, p: PlayerState) {
  p.position = JAIL_POS;
  p.inJail = true;
  p.jailTurns = 0;
  c.s.rollAgain = false;
  c.s.doublesCount = 0;
  c.ev.push({ type: 'jail', playerId: p.id });
  say(c, `${p.name} goes to the Labor Strike.`);
}

function movePlayer(c: Ctx, p: PlayerState, steps: number, direct = false) {
  const from = p.position;
  const raw = from + steps;
  const to = ((raw % BOARD_SIZE) + BOARD_SIZE) % BOARD_SIZE;
  p.position = to;
  c.ev.push({ type: 'move', playerId: p.id, from, to, steps, direct });
  if (steps > 0 && raw >= BOARD_SIZE) grantGo(c, p);
}

function moveForwardTo(c: Ctx, p: PlayerState, to: number, collectGo: boolean) {
  const from = p.position;
  p.position = to;
  c.ev.push({ type: 'move', playerId: p.id, from, to, steps: (to - from + BOARD_SIZE) % BOARD_SIZE, direct: !collectGo });
  if (collectGo && to <= from) grantGo(c, p);
}

function grantProperty(c: Ctx, pid: string, spaceId: number) {
  const p = P(c, pid);
  c.s.props[spaceId].owner = pid;
  const sp = SPACES[spaceId];
  if (sp.group) addIndices(p, GROUPS[sp.group].impact);
}

function drawCard(c: Ctx, deck: DeckId): Card | null {
  const d = c.s.decks[deck];
  if (d.draw.length === 0) { d.draw = shuffle(d.discard, c.rng); d.discard = []; }
  const id = d.draw.shift();
  return id ? CARD_MAP[id] : null;
}

function targetsOf(c: Ctx, p: PlayerState, t: 'self' | 'all' | 'others'): PlayerState[] {
  if (t === 'self') return [p];
  const act = activePlayers(c.s);
  return t === 'all' ? act : act.filter(x => x.id !== p.id);
}

function levelsOf(c: Ctx, pid: string) {
  return ownedBy(c.s, pid).reduce((a, id) => a + c.s.props[id].level, 0);
}

function applyEffect(c: Ctx, p: PlayerState, card: Card, e: Effect, depth: number) {
  const tgt = (e as { target?: 'self' | 'all' | 'others' }).target ?? card.target;
  switch (e.type) {
    case 'cash':
      for (const t of targetsOf(c, p, tgt)) {
        if (e.amount >= 0) gain(c, t, e.amount, card.name); else payOrDebt(c, t.id, null, -e.amount, card.name);
      }
      break;
    case 'cashPercent':
      for (const t of targetsOf(c, p, tgt)) {
        const amt = Math.min(e.cap, Math.round((Math.abs(e.percent) / 100) * Math.max(0, t.cash)));
        if (amt === 0) continue;
        if (e.percent >= 0) gain(c, t, amt, card.name); else payOrDebt(c, t.id, null, amt, card.name);
      }
      break;
    case 'cashPerLevel':
      for (const t of targetsOf(c, p, tgt)) {
        const amt = levelsOf(c, t.id) * Math.abs(e.perLevel);
        if (amt === 0) continue;
        if (e.perLevel >= 0) gain(c, t, amt, card.name); else payOrDebt(c, t.id, null, amt, card.name);
      }
      break;
    case 'collectFromOthers':
      for (const t of activePlayers(c.s)) if (t.id !== p.id) payOrDebt(c, t.id, p.id, e.amount, card.name);
      break;
    case 'index':
      for (const t of targetsOf(c, p, tgt)) bumpIndex(t, e.index, e.delta);
      break;
    case 'move':
      if (p.inJail) break;
      moveForwardTo(c, p, e.to, e.collectGo);
      if (depth < 3) landOn(c, p, depth + 1);
      break;
    case 'moveBy':
      if (p.inJail) break;
      movePlayer(c, p, e.steps);
      if (depth < 3) landOn(c, p, depth + 1);
      break;
    case 'moveToNearest': {
      if (p.inJail) break;
      let to = p.position;
      for (let i = 1; i <= BOARD_SIZE; i++) {
        const id = (p.position + i) % BOARD_SIZE;
        if (SPACES[id].kind === e.kind) { to = id; break; }
      }
      moveForwardTo(c, p, to, true);
      if (depth < 3) landOn(c, p, depth + 1);
      break;
    }
    case 'jail':
      sendToJail(c, p);
      break;
    case 'jailFreeCard':
      p.jailCards.push(card.id);
      break;
    case 'depreciate':
      for (const t of targetsOf(c, p, tgt)) {
        const owned = ownedBy(c.s, t.id).filter(id => c.s.props[id].level > 0).sort((a, b) => c.s.props[b].level - c.s.props[a].level || a - b);
        if (!owned.length) { say(c, `${t.name} has no developed property to depreciate.`); continue; }
        const pr = c.s.props[owned[0]];
        pr.level = Math.max(0, pr.level - e.levels);
        say(c, `${SPACES[owned[0]].name} of ${t.name} drops to level ${pr.level}.`);
      }
      break;
    case 'modifier':
      c.s.modifiers.push({
        id: c.s.nextId++, kind: e.modifier, multiplier: e.multiplier, roundsLeft: e.rounds,
        playerIds: targetsOf(c, p, tgt).map(t => t.id), source: card.name,
      });
      break;
  }
}

function drawAndApply(c: Ctx, p: PlayerState, deck: DeckId, depth: number) {
  const card = drawCard(c, deck);
  if (!card) return;
  c.s.lastCard = { playerId: p.id, cardId: card.id };
  if (!c.s.cardsSeen.includes(card.id)) c.s.cardsSeen.push(card.id);
  c.ev.push({ type: 'card', playerId: p.id, cardId: card.id, deck });
  say(c, `${p.name} draws "${card.name}".`);
  let kept = false;
  for (const e of card.effects) {
    if (e.type === 'jailFreeCard') kept = true;
    applyEffect(c, p, card, e, depth);
  }
  if (!kept) c.s.decks[deck].discard.push(card.id);
}

function landOn(c: Ctx, p: PlayerState, depth = 0) {
  const sp = SPACES[p.position];
  const s = c.s;
  switch (sp.kind) {
    case 'property': case 'station': case 'utility': {
      const prop = s.props[sp.id];
      if (!prop.owner) {
        s.pendingPurchase = { playerId: p.id, spaceId: sp.id };
        say(c, `${p.name} lands on ${sp.name} (${sp.price} cr). It is for sale.`);
      } else if (prop.owner !== p.id) {
        const rent = rentFor(s, sp.id, s.dice[0] + s.dice[1]);
        if (prop.mortgaged) say(c, `${sp.name} is mortgaged: no rent.`);
        else if (rent > 0) payOrDebt(c, p.id, prop.owner, rent, `Rent for ${sp.name}`);
      }
      break;
    }
    case 'event': drawAndApply(c, p, 'objective', depth); break;
    case 'policy': drawAndApply(c, p, 'policy', depth); break;
    case 'tax': {
      const amt = sp.id === 4 ? 100 : Math.min(300, Math.max(0, Math.floor(netWorth(s, p.id) * 0.1)));
      bumpIndex(p, 'socialContribution', 1);
      payOrDebt(c, p.id, null, amt, sp.name);
      break;
    }
    case 'gotojail': sendToJail(c, p); break;
    default: break;
  }
}

// ---------- turn / phase ----------

function settle(c: Ctx) {
  const s = c.s;
  if (s.phase === 'finished') return;
  if (s.debts.length) s.phase = 'debt';
  else if (s.auction) s.phase = 'auction';
  else if (s.pendingPurchase) s.phase = 'buy';
  else if (s.rollAgain && !turnPlayer(s).bankrupt) s.phase = 'roll';
  else s.phase = 'post_roll';
}

function finishGame(c: Ctx, reason: 'last_standing' | 'round_limit') {
  const s = c.s;
  const standings = rankPlayers(s);
  const top = standings[0];
  const winnerId = top && !top.bankrupt ? top.playerId : null;
  s.result = { mode: s.settings.mode, reason, winnerId, round: s.round, standings, conceptIds: conceptsEncountered(s) };
  s.phase = 'finished';
  s.pendingPurchase = null; s.auction = null; s.trade = null;
  c.ev.push({ type: 'gameover', winnerId });
  say(c, winnerId ? `${P(c, winnerId).name} wins the game!` : 'The game is over.');
}

function startTurn(c: Ctx) {
  const s = c.s;
  s.rollAgain = true;
  s.doublesCount = 0;
  s.tradesThisTurn = 0;
  s.pendingPurchase = null;
  s.lastCard = null;
}

function advanceTurn(c: Ctx) {
  const s = c.s;
  const n = s.players.length;
  let i = s.turn;
  do { i = (i + 1) % n; } while (s.players[i].bankrupt);
  const wrapped = i <= s.turn;
  s.turn = i;
  if (wrapped) {
    s.round++;
    for (const m of s.modifiers) m.roundsLeft--;
    s.modifiers = s.modifiers.filter(m => m.roundsLeft > 0);
    const limit = roundLimitOf(s);
    if (limit > 0 && s.round > limit) { s.round = limit; finishGame(c, 'round_limit'); return; }
  }
  startTurn(c);
  say(c, `Round ${s.round}: ${turnPlayer(s).name}'s turn.`);
}

function checkLastStanding(c: Ctx): boolean {
  if (activePlayers(c.s).length <= 1 && c.s.phase !== 'finished') { finishGame(c, 'last_standing'); return true; }
  return false;
}

// ---------- bankruptcy ----------

function removeFromAuction(c: Ctx, pid: string) {
  const a = c.s.auction;
  if (!a) return;
  const idx = a.order.indexOf(pid);
  if (idx < 0) return;
  a.order.splice(idx, 1);
  if (idx < a.turnIdx) a.turnIdx--;
  if (a.order.length) a.turnIdx %= a.order.length; else a.turnIdx = 0;
  checkAuctionEnd(c);
}

function bankrupt(c: Ctx, p: PlayerState, creditorId: string | null) {
  const s = c.s;
  const creditor = creditorId ? getPlayer(s, creditorId) : undefined;
  for (const id of ownedBy(s, p.id)) {
    const pr = s.props[id];
    if (pr.level > 0) { p.cash += Math.floor((pr.level * GROUPS[SPACES[id].group!].buildCost) / 2); pr.level = 0; }
  }
  if (creditor && !creditor.bankrupt) {
    creditor.cash += p.cash;
    for (const id of ownedBy(s, p.id)) s.props[id].owner = creditor.id;
  } else {
    for (const id of ownedBy(s, p.id)) { s.props[id].owner = null; s.props[id].mortgaged = false; }
  }
  p.cash = 0;
  p.bankrupt = true;
  p.inJail = false;
  for (const cid of p.jailCards) s.decks[CARD_MAP[cid].deck].discard.push(cid);
  p.jailCards = [];
  s.debts = s.debts.filter(d => d.playerId !== p.id && d.toId !== p.id);
  if (s.trade && (s.trade.fromId === p.id || s.trade.toId === p.id)) s.trade = null;
  if (s.pendingPurchase?.playerId === p.id) s.pendingPurchase = null;
  for (const m of s.modifiers) m.playerIds = m.playerIds.filter(x => x !== p.id);
  c.ev.push({ type: 'bankrupt', playerId: p.id });
  say(c, `${p.name} is bankrupt${creditor ? ' and hands everything to ' + creditor.name : ''}.`);
  removeFromAuction(c, p.id);
  if (checkLastStanding(c)) return;
  if (turnPlayer(s).id === p.id) advanceTurn(c);
}

// ---------- auction ----------

function checkAuctionEnd(c: Ctx) {
  const s = c.s;
  const a = s.auction;
  if (!a) return;
  if (a.order.length === 0 || (a.order.length === 1 && a.highBidder === a.order[0])) {
    if (a.highBidder) {
      const w = P(c, a.highBidder);
      w.cash -= a.highBid;
      c.ev.push({ type: 'cash', playerId: w.id, delta: -a.highBid, reason: 'Auction' });
      grantProperty(c, w.id, a.spaceId);
      say(c, `${w.name} wins the auction for ${SPACES[a.spaceId].name} at ${a.highBid} cr.`);
    } else say(c, `Nobody bids: ${SPACES[a.spaceId].name} stays unowned.`);
    s.auction = null;
  }
}

// ---------- trade ----------

function validateTrade(s: GameState, t: Trade) {
  const from = getPlayer(s, t.fromId);
  const to = getPlayer(s, t.toId);
  if (!from || !to || from.bankrupt || to.bankrupt || from.id === to.id) throw new ActionError('BAD_TRADE', 'Invalid trade partners');
  const ints = [t.offerCash, t.requestCash];
  if (ints.some(n => !Number.isInteger(n) || n < 0)) throw new ActionError('BAD_TRADE', 'Cash must be a non-negative integer');
  if (t.offerCash + t.requestCash + t.offerSpaces.length + t.requestSpaces.length === 0) throw new ActionError('BAD_TRADE', 'Empty trade');
  if (from.cash < t.offerCash) throw new ActionError('INSUFFICIENT_FUNDS', `${from.name} cannot afford the offered cash`);
  if (to.cash < t.requestCash) throw new ActionError('INSUFFICIENT_FUNDS', `${to.name} cannot afford the requested cash`);
  const check = (ids: number[], owner: string) => {
    if (new Set(ids).size !== ids.length) throw new ActionError('BAD_TRADE', 'Duplicate spaces');
    for (const id of ids) {
      if (!Number.isInteger(id) || !s.props[id] || s.props[id].owner !== owner) throw new ActionError('BAD_TRADE', 'A listed property is not owned by that player');
      const g = SPACES[id].group;
      if (g && GROUP_SPACES[g].some(x => s.props[x].level > 0)) throw new ActionError('BAD_TRADE', 'Developed groups cannot be traded');
    }
  };
  check(t.offerSpaces, t.fromId);
  check(t.requestSpaces, t.toId);
}

// ---------- action dispatch ----------

const need = (cond: boolean, code: string, msg: string) => { if (!cond) throw new ActionError(code, msg); };

export function applyAction(state: GameState, playerId: string, action: Action, rng: Rng): { state: GameState; events: GameEvent[] } {
  need(state.phase !== 'finished', 'GAME_FINISHED', 'The game is over');
  const me0 = getPlayer(state, playerId);
  need(!!me0 && !me0.bankrupt, 'UNKNOWN_PLAYER', 'You are not an active player');
  const isCancel = action.type === 'trade_cancel' && state.trade?.fromId === playerId;
  need(isCancel || currentActor(state) === playerId, 'NOT_YOUR_TURN', 'It is not your turn to act');
  if (state.trade && !['trade_accept', 'trade_reject', 'trade_cancel'].includes(action.type)) throw new ActionError('TRADE_PENDING', 'A trade offer is pending');
  const c: Ctx = { s: structuredClone(state), ev: [], rng };
  const s = c.s;
  const me = getPlayer(s, playerId);
  const p = me!;
  const isTurn = turnPlayer(s).id === playerId;

  switch (action.type) {
    case 'roll': {
      need(s.phase === 'roll' && isTurn, 'BAD_PHASE', 'You cannot roll now');
      const d1 = 1 + Math.floor(rng() * 6), d2 = 1 + Math.floor(rng() * 6);
      s.dice = [d1, d2];
      c.ev.push({ type: 'dice', playerId, dice: [d1, d2] });
      const dbl = d1 === d2, total = d1 + d2;
      say(c, `${p.name} rolls ${d1} + ${d2}${dbl ? ' (doubles)' : ''}.`);
      if (p.inJail) {
        s.rollAgain = false;
        if (dbl) {
          p.inJail = false; p.jailTurns = 0; s.doublesCount = 0;
          say(c, `${p.name} rolls doubles and leaves the Labor Strike.`);
          movePlayer(c, p, total); landOn(c, p);
        } else {
          p.jailTurns++;
          if (p.jailTurns >= 3) {
            p.inJail = false; p.jailTurns = 0;
            payOrDebt(c, p.id, null, JAIL_FINE, 'Jail fine');
            movePlayer(c, p, total); landOn(c, p);
          } else say(c, `${p.name} stays in the Labor Strike (attempt ${p.jailTurns}/3).`);
        }
      } else {
        s.doublesCount = dbl ? s.doublesCount + 1 : 0;
        s.rollAgain = dbl;
        if (s.doublesCount >= 3) { say(c, `${p.name} rolled three doubles in a row.`); sendToJail(c, p); }
        else { movePlayer(c, p, total); landOn(c, p); }
      }
      break;
    }
    case 'buy': {
      need(s.phase === 'buy' && s.pendingPurchase?.playerId === playerId, 'BAD_PHASE', 'Nothing to buy');
      const sp = SPACES[s.pendingPurchase!.spaceId];
      need(p.cash >= sp.price!, 'INSUFFICIENT_FUNDS', 'Not enough cash');
      p.cash -= sp.price!;
      c.ev.push({ type: 'cash', playerId, delta: -sp.price!, reason: 'Purchase' });
      grantProperty(c, playerId, sp.id);
      s.pendingPurchase = null;
      say(c, `${p.name} buys ${sp.name} for ${sp.price} cr.`);
      break;
    }
    case 'decline': {
      need(s.phase === 'buy' && s.pendingPurchase?.playerId === playerId, 'BAD_PHASE', 'Nothing to decline');
      const spaceId = s.pendingPurchase!.spaceId;
      s.pendingPurchase = null;
      if (s.settings.auctions) {
        const alive = activePlayers(s).map(x => x.id);
        const start = s.players.findIndex(x => x.id === playerId);
        const order: string[] = [];
        for (let i = 1; i <= s.players.length; i++) { const pl = s.players[(start + i) % s.players.length]; if (!pl.bankrupt && alive.includes(pl.id)) order.push(pl.id); }
        s.auction = { spaceId, order, turnIdx: 0, highBid: 0, highBidder: null };
        say(c, `${SPACES[spaceId].name} goes to auction.`);
      } else say(c, `${p.name} declines to buy ${SPACES[spaceId].name}.`);
      break;
    }
    case 'auction_bid': {
      const a = s.auction;
      need(s.phase === 'auction' && !!a, 'BAD_PHASE', 'No auction');
      need(Number.isInteger(action.amount), 'BAD_BID', 'Bid must be a whole number');
      need(action.amount >= a!.highBid + MIN_BID_STEP, 'BAD_BID', `Minimum bid is ${a!.highBid + MIN_BID_STEP} cr`);
      need(action.amount <= p.cash, 'INSUFFICIENT_FUNDS', 'You cannot bid more than your cash');
      a!.highBid = action.amount; a!.highBidder = playerId;
      a!.turnIdx = (a!.turnIdx + 1) % a!.order.length;
      say(c, `${p.name} bids ${action.amount} cr.`);
      checkAuctionEnd(c);
      break;
    }
    case 'auction_pass': {
      need(s.phase === 'auction' && !!s.auction, 'BAD_PHASE', 'No auction');
      say(c, `${p.name} leaves the auction.`);
      removeFromAuction(c, playerId);
      break;
    }
    case 'develop': {
      need(canManage(s, playerId) && (s.phase === 'roll' || s.phase === 'post_roll'), 'BAD_PHASE', 'You cannot develop now');
      const sp = SPACES[action.spaceId];
      need(sp?.kind === 'property', 'BAD_SPACE', 'Only properties can be developed');
      const pr = s.props[sp.id];
      need(pr.owner === playerId, 'NOT_OWNER', 'You do not own this property');
      need(ownsFullGroup(s, playerId, sp.id), 'NEED_GROUP', 'You need the whole group first');
      need(GROUP_SPACES[sp.group!].every(id => !s.props[id].mortgaged), 'MORTGAGED', 'A property in this group is mortgaged');
      need(pr.level < MAX_LEVEL, 'MAX_LEVEL', 'Already at the top level');
      need(pr.level <= Math.min(...groupLevels(s, sp.id)), 'EVEN_BUILD', 'Develop evenly across the group');
      const cost = developCost(s, playerId, sp.id);
      need(p.cash >= cost, 'INSUFFICIENT_FUNDS', `Development costs ${cost} cr`);
      p.cash -= cost; pr.level++;
      addIndices(p, GROUPS[sp.group!].impact);
      c.ev.push({ type: 'cash', playerId, delta: -cost, reason: 'Development' });
      say(c, `${p.name} develops ${sp.name} to level ${pr.level} for ${cost} cr.`);
      break;
    }
    case 'sell_development': {
      need(canManage(s, playerId), 'BAD_PHASE', 'You cannot sell now');
      const sp = SPACES[action.spaceId];
      need(sp?.kind === 'property', 'BAD_SPACE', 'Not a property');
      const pr = s.props[sp.id];
      need(pr.owner === playerId, 'NOT_OWNER', 'You do not own this property');
      need(pr.level > 0, 'NO_LEVEL', 'Nothing to sell');
      need(pr.level >= Math.max(...groupLevels(s, sp.id)), 'EVEN_BUILD', 'Sell evenly across the group');
      const g = GROUPS[sp.group!];
      const refund = Math.floor(g.buildCost / 2);
      pr.level--; p.cash += refund;
      addIndices(p, g.impact, -1);
      c.ev.push({ type: 'cash', playerId, delta: refund, reason: 'Sold development' });
      say(c, `${p.name} sells a level of ${sp.name} for ${refund} cr.`);
      break;
    }
    case 'mortgage': {
      need(canManage(s, playerId), 'BAD_PHASE', 'You cannot mortgage now');
      const sp = SPACES[action.spaceId];
      const pr = s.props[action.spaceId];
      need(!!pr && pr.owner === playerId, 'NOT_OWNER', 'You do not own this property');
      need(!pr.mortgaged, 'MORTGAGED', 'Already mortgaged');
      need(!sp.group || GROUP_SPACES[sp.group].every(id => s.props[id].level === 0), 'DEVELOPED', 'Sell all development in the group first');
      pr.mortgaged = true; p.cash += mortgageValue(sp.id);
      c.ev.push({ type: 'cash', playerId, delta: mortgageValue(sp.id), reason: 'Mortgage' });
      say(c, `${p.name} mortgages ${sp.name} for ${mortgageValue(sp.id)} cr.`);
      break;
    }
    case 'unmortgage': {
      need(canManage(s, playerId), 'BAD_PHASE', 'You cannot redeem now');
      const sp = SPACES[action.spaceId];
      const pr = s.props[action.spaceId];
      need(!!pr && pr.owner === playerId, 'NOT_OWNER', 'You do not own this property');
      need(pr.mortgaged, 'NOT_MORTGAGED', 'Not mortgaged');
      const cost = unmortgageCost(sp.id);
      need(p.cash >= cost, 'INSUFFICIENT_FUNDS', `Redeeming costs ${cost} cr`);
      p.cash -= cost; pr.mortgaged = false;
      c.ev.push({ type: 'cash', playerId, delta: -cost, reason: 'Redeem' });
      say(c, `${p.name} redeems ${sp.name} for ${cost} cr.`);
      break;
    }
    case 'trade_propose': {
      need(canManage(s, playerId), 'BAD_PHASE', 'You cannot trade now');
      need(s.tradesThisTurn < MAX_TRADES_PER_TURN, 'TRADE_LIMIT', 'Trade limit reached for this turn');
      const t: Trade = {
        fromId: playerId, toId: action.toId, offerCash: action.offerCash, requestCash: action.requestCash,
        offerSpaces: [...action.offerSpaces], requestSpaces: [...action.requestSpaces],
      };
      validateTrade(s, t);
      s.trade = t; s.tradesThisTurn++;
      say(c, `${p.name} proposes a trade to ${P(c, t.toId).name}.`);
      break;
    }
    case 'trade_accept': {
      need(!!s.trade && s.trade.toId === playerId, 'NO_TRADE', 'No trade to accept');
      const t = s.trade!;
      validateTrade(s, t);
      const from = P(c, t.fromId);
      from.cash += t.requestCash - t.offerCash; p.cash += t.offerCash - t.requestCash;
      for (const id of t.offerSpaces) s.props[id].owner = t.toId;
      for (const id of t.requestSpaces) s.props[id].owner = t.fromId;
      s.trade = null;
      say(c, `${p.name} accepts the trade with ${from.name}.`);
      break;
    }
    case 'trade_reject': {
      need(!!s.trade && s.trade.toId === playerId, 'NO_TRADE', 'No trade to reject');
      say(c, `${p.name} rejects the trade.`);
      s.trade = null;
      break;
    }
    case 'trade_cancel': {
      need(!!s.trade && s.trade.fromId === playerId, 'NO_TRADE', 'No trade to cancel');
      say(c, `${p.name} cancels the trade.`);
      s.trade = null;
      break;
    }
    case 'jail_pay': {
      need(s.phase === 'roll' && isTurn && p.inJail, 'BAD_PHASE', 'You are not in jail');
      need(p.cash >= JAIL_FINE, 'INSUFFICIENT_FUNDS', `The fine is ${JAIL_FINE} cr`);
      p.cash -= JAIL_FINE; p.inJail = false; p.jailTurns = 0;
      c.ev.push({ type: 'cash', playerId, delta: -JAIL_FINE, reason: 'Jail fine' });
      say(c, `${p.name} pays ${JAIL_FINE} cr and leaves the Labor Strike.`);
      break;
    }
    case 'jail_card': {
      need(s.phase === 'roll' && isTurn && p.inJail, 'BAD_PHASE', 'You are not in jail');
      need(p.jailCards.length > 0, 'NO_CARD', 'You have no card');
      const cid = p.jailCards.shift()!;
      s.decks[CARD_MAP[cid].deck].discard.push(cid);
      p.inJail = false; p.jailTurns = 0;
      say(c, `${p.name} uses a Collective agreement to leave the Labor Strike.`);
      break;
    }
    case 'pay_debt': {
      need(s.phase === 'debt' && s.debts[0]?.playerId === playerId, 'BAD_PHASE', 'You owe nothing');
      const d = s.debts[0];
      need(p.cash >= d.amount, 'INSUFFICIENT_FUNDS', `You still need ${d.amount - p.cash} cr`);
      s.debts.shift();
      p.cash -= d.amount;
      if (d.toId) { const to = getPlayer(s, d.toId); if (to) to.cash += d.amount; }
      c.ev.push({ type: 'cash', playerId, delta: -d.amount, reason: d.reason });
      say(c, `${p.name} settles the debt of ${d.amount} cr (${d.reason}).`);
      break;
    }
    case 'declare_bankruptcy': {
      need(s.phase === 'debt' && s.debts[0]?.playerId === playerId, 'BAD_PHASE', 'You can only declare bankruptcy while in debt');
      bankrupt(c, p, s.debts[0].toId);
      break;
    }
    case 'end_turn': {
      need(s.phase === 'post_roll' && isTurn, 'BAD_PHASE', 'You cannot end the turn now');
      advanceTurn(c);
      break;
    }
    default:
      throw new ActionError('BAD_ACTION', 'Unknown action');
  }
  settle(c);
  return { state: c.s, events: c.ev };
}

/** Check whether an action would be accepted (using the real engine). */
export function isLegal(state: GameState, playerId: string, action: Action): boolean {
  try { applyAction(state, playerId, action, () => 0.5); return true; } catch { return false; }
}

/** All currently legal actions for a player. trade_propose is not enumerated; see canPropose. */
export function legalActions(state: GameState, playerId: string): Action[] {
  if (state.phase === 'finished') return [];
  const out: Action[] = [];
  const add = (a: Action) => { if (isLegal(state, playerId, a)) out.push(a); };
  if (state.trade) {
    (['trade_accept', 'trade_reject', 'trade_cancel'] as const).forEach(type => add({ type }));
    return out;
  }
  if (currentActor(state) !== playerId) return out;
  switch (state.phase) {
    case 'roll': add({ type: 'roll' }); add({ type: 'jail_pay' }); add({ type: 'jail_card' }); break;
    case 'buy': add({ type: 'buy' }); add({ type: 'decline' }); break;
    case 'auction': add({ type: 'auction_pass' }); add({ type: 'auction_bid', amount: state.auction!.highBid + MIN_BID_STEP }); break;
    case 'debt': add({ type: 'pay_debt' }); add({ type: 'declare_bankruptcy' }); break;
    case 'post_roll': add({ type: 'end_turn' }); break;
  }
  if (canManage(state, playerId)) {
    for (const id of ownedBy(state, playerId)) {
      add({ type: 'develop', spaceId: id }); add({ type: 'sell_development', spaceId: id });
      add({ type: 'mortgage', spaceId: id }); add({ type: 'unmortgage', spaceId: id });
    }
  }
  return out;
}

export function canPropose(state: GameState, playerId: string): boolean {
  return canManage(state, playerId) && state.tradesThisTurn < MAX_TRADES_PER_TURN && activePlayers(state).length > 1;
}

export { CARDS };

/** Rebuild a state usable for legality checks on the client (decks are placeholders, order is meaningless). */
export function fromPublic(pub: PublicGameState): GameState {
  const { deckCounts, deadline: _d, actorId: _a, ...rest } = pub;
  const mk = (deck: DeckId, n: number) => ({ draw: deckCards(deck).map(c => c.id).slice(0, Math.max(n, 1)), discard: [] as string[] });
  return { ...structuredClone(rest), decks: { objective: mk('objective', deckCounts.objective), policy: mk('policy', deckCounts.policy) } };
}
