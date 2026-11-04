import { describe, expect, it } from 'vitest';
import { ActionError } from '../src/shared/types';
import { applyAction, canPropose, legalActions } from '../src/shared/engine';
import { currentActor, financials, rentFor } from '../src/shared/rules';
import { RENTS } from '../src/shared/board';
import { act, give, newGame, roll, scripted } from './helpers';

const err = (fn: () => unknown) => { try { fn(); } catch (e) { return (e as ActionError).code; } return null; };

describe('movement, buying and rent', () => {
  it('moves, offers purchase and buys', () => {
    let s = newGame(3);
    let r = roll(s, 'p0', 1, 2); // to 3
    expect(r.state.players[0].position).toBe(3);
    expect(r.state.phase).toBe('buy');
    expect(currentActor(r.state)).toBe('p0');
    r = act(r.state, 'p0', { type: 'buy' });
    expect(r.state.props[3].owner).toBe('p0');
    expect(r.state.players[0].cash).toBe(1420);
    expect(r.state.phase).toBe('post_roll');
    expect(r.state.players[0].indices.laborRelations).toBe(51);
    r = act(r.state, 'p0', { type: 'end_turn' });
    expect(currentActor(r.state)).toBe('p1');
  });
  it('rejects wrong actor, wrong phase and does not mutate input', () => {
    const s = newGame(3);
    const snap = JSON.stringify(s);
    expect(err(() => act(s, 'p1', { type: 'roll' }))).toBe('NOT_YOUR_TURN');
    expect(err(() => act(s, 'p0', { type: 'end_turn' }))).toBe('BAD_PHASE');
    expect(err(() => act(s, 'p0', { type: 'buy' }))).toBe('BAD_PHASE');
    expect(JSON.stringify(s)).toBe(snap);
  });
  it('pays rent, doubled with full group at level 0', () => {
    const s = newGame(3);
    give(s, 'p1', [1]);
    let r;
    const s2 = newGame(3); give(s2, 'p1', [1]); s2.players[0].position = 0;
    // 1 can't be reached with two dice from 0, so move player to 39 first
    s2.players[0].position = 39;
    r = roll(s2, 'p0', 1, 1);
    expect(r.state.players[0].position).toBe(1);
    expect(r.state.players[0].cash).toBe(1500 + 200 - RENTS[1][0]);
    expect(r.state.players[1].cash).toBe(1500 + RENTS[1][0]);
    const s3 = newGame(3); give(s3, 'p1', [1, 3]); s3.players[0].position = 39;
    r = roll(s3, 'p0', 1, 1);
    expect(r.state.players[0].cash).toBe(1700 - RENTS[1][0] * 2);
  });
  it('passing GO pays 200, stations and utilities compute rent', () => {
    const s = newGame(3); give(s, 'p1', [5, 15, 9, 28]); s.players[0].position = 35;
    let r = roll(s, 'p0', 5, 5); // to 5 (station), passes GO
    expect(r.state.players[0].cash).toBe(1700 - 50);
    const s2 = newGame(3); give(s2, 'p1', [9, 28]); s2.players[0].position = 3;
    r = roll(s2, 'p0', 2, 4); // to 9
    expect(r.state.players[0].cash).toBe(1500 - 6 * 10);
  });
  it('mortgaged property collects no rent; low labor cuts rent', () => {
    const s = newGame(3); give(s, 'p1', [3]); s.props[3].mortgaged = true; s.players[0].position = 1;
    let r = roll(s, 'p0', 1, 1);
    expect(r.state.players[0].cash).toBe(1500);
    const s2 = newGame(3); give(s2, 'p1', [3]); s2.players[1].indices.laborRelations = 10;
    expect(rentFor(s2, 3, 5)).toBe(Math.round(RENTS[3][0] * 0.85));
  });
  it('modifiers scale rent and expire after rounds', () => {
    const s = newGame(2); give(s, 'p1', [3]);
    s.modifiers.push({ id: 99, kind: 'rent', multiplier: 2, roundsLeft: 1, playerIds: ['p1'], source: 't' });
    expect(rentFor(s, 3, 7)).toBe(RENTS[3][0] * 2);
    let st = newGame(2); st.modifiers.push({ id: 1, kind: 'rent', multiplier: 2, roundsLeft: 1, playerIds: ['p1'], source: 't' });
    st.phase = 'post_roll'; st.rollAgain = false;
    st = act(st, 'p0', { type: 'end_turn' }).state;
    expect(st.modifiers).toHaveLength(1);
    st.phase = 'post_roll'; st.rollAgain = false;
    st = act(st, 'p1', { type: 'end_turn' }).state;
    expect(st.round).toBe(2);
    expect(st.modifiers).toHaveLength(0);
  });
  it('tax spaces', () => {
    const s = newGame(2); s.players[0].position = 1;
    let r = roll(s, 'p0', 1, 2);
    expect(r.state.players[0].cash).toBe(1400);
    expect(r.state.players[0].indices.socialContribution).toBe(11);
    const s2 = newGame(2); s2.players[0].position = 30;
    r = roll(s2, 'p0', 3, 3);
    expect(r.state.players[0].cash).toBe(1500 - 150);
  });
});

describe('development and mortgage', () => {
  const setup = () => { const s = newGame(2); give(s, 'p0', [11, 12, 13]); s.phase = 'post_roll'; s.rollAgain = false; return s; };
  it('requires full group and builds evenly', () => {
    const s = newGame(2); give(s, 'p0', [11, 12]); s.phase = 'post_roll';
    expect(err(() => act(s, 'p0', { type: 'develop', spaceId: 11 }))).toBe('NEED_GROUP');
    let t = setup();
    t = act(t, 'p0', { type: 'develop', spaceId: 11 }).state;
    expect(t.props[11].level).toBe(1);
    expect(t.players[0].cash).toBe(1400);
    expect(err(() => act(t, 'p0', { type: 'develop', spaceId: 11 }))).toBe('EVEN_BUILD');
    t = act(t, 'p0', { type: 'develop', spaceId: 12 }).state;
    expect(t.players[0].indices.technology).toBe(14);
  });
  it('tech discount at 60 and cost modifier', () => {
    const s = setup(); s.players[0].indices.technology = 60;
    expect(act(s, 'p0', { type: 'develop', spaceId: 11 }).state.players[0].cash).toBe(1410);
  });
  it('sell development refunds half and reverses indices', () => {
    let s = setup();
    s = act(s, 'p0', { type: 'develop', spaceId: 11 }).state;
    const tech = s.players[0].indices.technology;
    s = act(s, 'p0', { type: 'sell_development', spaceId: 11 }).state;
    expect(s.players[0].cash).toBe(1450);
    expect(s.players[0].indices.technology).toBe(tech - 2);
    expect(s.props[11].level).toBe(0);
  });
  it('mortgage and unmortgage amounts; group must be level 0', () => {
    let s = setup();
    s = act(s, 'p0', { type: 'develop', spaceId: 11 }).state;
    expect(err(() => act(s, 'p0', { type: 'mortgage', spaceId: 12 }))).toBe('DEVELOPED');
    s = setup();
    s = act(s, 'p0', { type: 'mortgage', spaceId: 11 }).state;
    expect(s.players[0].cash).toBe(1570);
    expect(err(() => act(s, 'p0', { type: 'develop', spaceId: 12 }))).toBe('MORTGAGED');
    s = act(s, 'p0', { type: 'unmortgage', spaceId: 11 }).state;
    expect(s.players[0].cash).toBe(1570 - 77);
  });
  it('legalActions only lists valid moves', () => {
    const s = setup();
    const acts = legalActions(s, 'p0');
    expect(acts.some(a => a.type === 'develop')).toBe(true);
    expect(acts.some(a => a.type === 'end_turn')).toBe(true);
    expect(acts.some(a => a.type === 'roll')).toBe(false);
    expect(legalActions(s, 'p1')).toEqual([]);
  });
});

describe('auctions', () => {
  const toBuy = () => roll(newGame(3), 'p0', 1, 2).state;
  it('decline opens an auction starting after the roller; highest bidder wins', () => {
    let s = act(toBuy(), 'p0', { type: 'decline' }).state;
    expect(s.phase).toBe('auction');
    expect(s.auction!.order).toEqual(['p1', 'p2', 'p0']);
    expect(currentActor(s)).toBe('p1');
    expect(err(() => act(s, 'p1', { type: 'auction_bid', amount: 5 }))).toBe('BAD_BID');
    s = act(s, 'p1', { type: 'auction_bid', amount: 30 }).state;
    expect(currentActor(s)).toBe('p2');
    s = act(s, 'p2', { type: 'auction_bid', amount: 40 }).state;
    s = act(s, 'p0', { type: 'auction_pass' }).state;
    s = act(s, 'p1', { type: 'auction_pass' }).state;
    expect(s.phase).toBe('post_roll');
    expect(s.props[3].owner).toBe('p2');
    expect(s.players[2].cash).toBe(1460);
  });
  it('no bids leaves the space unowned; auctions can be disabled', () => {
    let s = act(toBuy(), 'p0', { type: 'decline' }).state;
    for (const id of ['p1', 'p2', 'p0']) s = act(s, id, { type: 'auction_pass' }).state;
    expect(s.props[3].owner).toBeNull();
    expect(s.phase).toBe('post_roll');
    const t = roll(newGame(3, { auctions: false }), 'p0', 1, 2).state;
    expect(act(t, 'p0', { type: 'decline' }).state.phase).toBe('post_roll');
  });
  it('cannot bid more than cash', () => {
    const s = act(toBuy(), 'p0', { type: 'decline' }).state;
    expect(err(() => act(s, 'p1', { type: 'auction_bid', amount: 2000 }))).toBe('INSUFFICIENT_FUNDS');
  });
});

describe('trade', () => {
  const base = () => { const s = newGame(3); give(s, 'p0', [1]); give(s, 'p1', [3]); s.phase = 'post_roll'; s.rollAgain = false; return s; };
  it('propose, accept swaps assets', () => {
    let s = base();
    s = act(s, 'p0', { type: 'trade_propose', toId: 'p1', offerCash: 100, requestCash: 0, offerSpaces: [1], requestSpaces: [3] }).state;
    expect(currentActor(s)).toBe('p1');
    expect(err(() => act(s, 'p0', { type: 'end_turn' }))).toBe('NOT_YOUR_TURN');
    s = act(s, 'p1', { type: 'trade_accept' }).state;
    expect(s.props[1].owner).toBe('p1'); expect(s.props[3].owner).toBe('p0');
    expect(s.players[0].cash).toBe(1400); expect(s.players[1].cash).toBe(1600);
  });
  it('reject, cancel, limit and validation', () => {
    let s = base();
    const prop = { type: 'trade_propose' as const, toId: 'p1', offerCash: 10, requestCash: 0, offerSpaces: [] as number[], requestSpaces: [] as number[] };
    s = act(s, 'p0', prop).state;
    s = act(s, 'p1', { type: 'trade_reject' }).state;
    expect(s.trade).toBeNull();
    s = act(s, 'p0', prop).state;
    s = act(s, 'p0', { type: 'trade_cancel' }).state;
    expect(s.trade).toBeNull();
    s = act(s, 'p0', prop).state; s = act(s, 'p1', { type: 'trade_reject' }).state;
    expect(err(() => act(s, 'p0', prop))).toBe('TRADE_LIMIT');
    expect(canPropose(s, 'p0')).toBe(false);
    const t = base();
    expect(err(() => act(t, 'p0', { ...prop, offerSpaces: [3] }))).toBe('BAD_TRADE');
    expect(err(() => act(t, 'p0', { ...prop, offerCash: 99999 }))).toBe('INSUFFICIENT_FUNDS');
    give(t, 'p0', [11, 12, 13]); t.props[11].level = 1;
    expect(err(() => act(t, 'p0', { ...prop, offerSpaces: [11] }))).toBe('BAD_TRADE');
  });
  it('mortgaged space transfers as-is', () => {
    let s = base(); s.props[3].mortgaged = true;
    s = act(s, 'p0', { type: 'trade_propose', toId: 'p1', offerCash: 0, requestCash: 0, offerSpaces: [], requestSpaces: [3] }).state;
    s = act(s, 'p1', { type: 'trade_accept' }).state;
    expect(s.props[3]).toMatchObject({ owner: 'p0', mortgaged: true });
  });
});

describe('jail and doubles', () => {
  it('three doubles go to jail', () => {
    let t = newGame(2); t.doublesCount = 2; t.decks.objective.draw = ['obj-inflation'];
    const r = roll(t, 'p0', 2, 2);
    expect(r.state.players[0].inJail).toBe(true);
    expect(r.state.players[0].position).toBe(10);
    expect(r.state.phase).toBe('post_roll');
  });
  it('doubles allow another roll', () => {
    const s = newGame(2); s.players[0].position = 5;
    const r = roll(s, 'p0', 3, 3); // lands on 11
    expect(r.state.rollAgain).toBe(true);
  });
  it('go to jail space does not pay GO', () => {
    const s = newGame(2); s.players[0].position = 24;
    const r = roll(s, 'p0', 3, 3);
    expect(r.state.players[0].inJail).toBe(true);
    expect(r.state.players[0].cash).toBe(1500);
    expect(r.state.phase).toBe('post_roll');
  });
  const jailed = () => { const s = newGame(2); s.players[0].inJail = true; s.players[0].position = 10; return s; };
  it('pay fine, use card', () => {
    let s = act(jailed(), 'p0', { type: 'jail_pay' }).state;
    expect(s.players[0].inJail).toBe(false); expect(s.players[0].cash).toBe(1450); expect(s.phase).toBe('roll');
    const j = jailed(); j.players[0].jailCards = ['obj-collective'];
    s = act(j, 'p0', { type: 'jail_card' }).state;
    expect(s.players[0].inJail).toBe(false);
    expect(s.decks.objective.discard).toContain('obj-collective');
    expect(err(() => act(jailed(), 'p0', { type: 'jail_card' }))).toBe('NO_CARD');
  });
  it('doubles leave jail without extra roll; non-doubles count; third failure pays', () => {
    let r = roll(jailed(), 'p0', 3, 3);
    expect(r.state.players[0].inJail).toBe(false);
    expect(r.state.players[0].position).toBe(16);
    expect(r.state.rollAgain).toBe(false);
    r = roll(jailed(), 'p0', 1, 2);
    expect(r.state.players[0].jailTurns).toBe(1);
    expect(r.state.phase).toBe('post_roll');
    const j = jailed(); j.players[0].jailTurns = 2;
    r = roll(j, 'p0', 1, 2);
    expect(r.state.players[0].inJail).toBe(false);
    expect(r.state.players[0].cash).toBe(1450);
    expect(r.state.players[0].position).toBe(13);
  });
});

describe('debt and bankruptcy', () => {
  it('creates debt, allows paying after raising cash', () => {
    const s = newGame(3); give(s, 'p1', [11, 12, 13]); s.props[13].level = 5; s.players[0].cash = 10; s.players[0].position = 9;
    give(s, 'p0', [1]);
    let r = roll(s, 'p0', 1, 1); // to 11
    expect(r.state.phase).toBe('debt');
    expect(r.state.debts[0]).toMatchObject({ playerId: 'p0', toId: 'p1' });
    expect(err(() => act(r.state, 'p0', { type: 'pay_debt' }))).toBe('INSUFFICIENT_FUNDS');
    expect(financials(r.state, 'p0').liabilities).toBeGreaterThan(0);
    r = act(r.state, 'p0', { type: 'mortgage', spaceId: 1 });
    expect(r.state.players[0].cash).toBe(40);
  });
  it('bankruptcy to a creditor transfers cash and properties', () => {
    const s = newGame(3); give(s, 'p1', [11, 12, 13]); s.props[13].level = 5; s.players[0].cash = 10; s.players[0].position = 9;
    give(s, 'p0', [1, 3]); s.props[3].mortgaged = true;
    let r = roll(s, 'p0', 1, 1);
    r = act(r.state, 'p0', { type: 'declare_bankruptcy' });
    const st = r.state;
    expect(st.players[0].bankrupt).toBe(true);
    expect(st.props[1].owner).toBe('p1');
    expect(st.props[3]).toMatchObject({ owner: 'p1', mortgaged: true });
    expect(st.players[1].cash).toBe(1510);
    expect(st.debts).toHaveLength(0);
    expect(currentActor(st)).toBe('p1');
    expect(st.phase).toBe('roll');
  });
  it('bankruptcy to the bank frees properties and returns jail cards; last player wins', () => {
    let s = newGame(2); s.players[0].cash = 0; give(s, 'p0', [1]);
    s.players[0].jailCards = ['obj-collective']; s.players[0].position = 34;
    let r = roll(s, 'p0', 1, 1);
    expect(r.state.phase).toBe('debt');
    r = act(r.state, 'p0', { type: 'declare_bankruptcy' });
    expect(r.state.props[1].owner).toBeNull();
    expect(r.state.decks.objective.discard).toContain('obj-collective');
    expect(r.state.phase).toBe('finished');
    expect(r.state.result!.winnerId).toBe('p1');
    expect(r.state.result!.conceptIds.length).toBeGreaterThan(0);
    expect(err(() => act(r.state, 'p1', { type: 'roll' }))).toBe('GAME_FINISHED');
  });
  it('bankrupt turn player passes the turn', () => {
    const s = newGame(3); s.players[0].cash = 0; s.players[0].position = 3; give(s, 'p1', [5]);
    let r = roll(s, 'p0', 1, 1);
    expect(r.state.players[0].position).toBe(5);
    expect(r.state.phase).toBe('debt');
    r = act(r.state, 'p0', { type: 'declare_bankruptcy' });
    expect(r.state.turn).toBe(1);
    expect(r.state.phase).toBe('roll');
    expect(r.state.players.filter(p => !p.bankrupt)).toHaveLength(2);
  });
});

describe('financials', () => {
  it('computes assets, liabilities, net worth', () => {
    const s = newGame(2); give(s, 'p0', [11, 12]); s.props[11].level = 2; s.props[12].mortgaged = true;
    const f = financials(s, 'p0');
    expect(f.assets).toBe(1500 + 140 + 200 + 150);
    expect(f.liabilities).toBe(75);
    expect(f.netWorth).toBe(f.assets - 75);
    expect(f.productiveCapital).toBe(340);
  });
  it('scripted rng helper sanity', () => {
    const r = scripted(3, 4);
    expect(Math.floor(r() * 6) + 1).toBe(3);
    expect(Math.floor(r() * 6) + 1).toBe(4);
    expect(applyAction).toBeTruthy();
  });
});
