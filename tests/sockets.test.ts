import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io as ioc, type Socket } from 'socket.io-client';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/server/app';
import { createAiService } from '../src/server/ai/service';
import type { JoinData } from '../src/shared/protocol';
import type { PublicGameState } from '../src/shared/types';

let ctx: ReturnType<typeof createApp>;
let url: string;
const sockets: Socket[] = [];

beforeEach(async () => {
  ctx = createApp({
    ai: createAiService({ perMinute: 3 }),
    timing: { botMin: 10, botMax: 20, disconnectMs: 100, tradeMs: 100, autoStepMs: 20 },
  });
  await new Promise<void>(r => ctx.server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${(ctx.server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  sockets.splice(0).forEach(s => s.close());
  await ctx.close();
  ctx.server.close();
});

function client(): Promise<Socket> {
  const s = ioc(url, { transports: ['websocket'], forceNew: true, reconnection: false });
  sockets.push(s);
  return new Promise(res => s.on('connect', () => res(s)));
}
const emit = <T = any>(s: Socket, ev: string, payload: unknown = {}): Promise<{ ok: boolean; data?: T; code?: string; message?: string }> =>
  new Promise(res => s.emit(ev, payload, res));
const next = <T = any>(s: Socket, ev: string, ms = 3000): Promise<T> =>
  new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout waiting ' + ev)), ms); s.once(ev, (d: T) => { clearTimeout(t); res(d); }); });
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function lobby(n = 2) {
  const host = await client();
  const h = (await emit<JoinData>(host, 'room:create', { name: 'Host', avatar: 0 })).data!;
  const guests: { s: Socket; j: JoinData }[] = [];
  for (let i = 1; i < n; i++) {
    const s = await client();
    const j = (await emit<JoinData>(s, 'room:join', { code: h.code, name: 'Guest' + i, avatar: i })).data!;
    guests.push({ s, j });
  }
  return { host, h, guests };
}

async function startGame(n = 2, settings: object = { turnTimer: 0 }) {
  const l = await lobby(n);
  await emit(l.host, 'room:update-settings', settings);
  for (const g of l.guests) await emit(g.s, 'room:ready', { ready: true });
  const snaps = [l.host, ...l.guests.map(g => g.s)].map(s => next<{ state: PublicGameState }>(s, 'game:snapshot'));
  const r = await emit(l.host, 'room:start');
  expect(r.ok).toBe(true);
  const states = await Promise.all(snaps);
  return { ...l, state: states[0].state };
}

function socketFor(g: Awaited<ReturnType<typeof startGame>>, pid: string): Socket {
  if (g.h.playerId === pid) return g.host;
  return g.guests.find(x => x.j.playerId === pid)!.s;
}

describe('rooms over sockets', () => {
  it('creates and joins rooms, reports meaningful errors', async () => {
    const { h } = await lobby(2);
    expect(h.code).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);
    expect(h.token.length).toBeGreaterThan(20);
    const s = await client();
    expect((await emit(s, 'room:join', { code: 'ab', name: 'X' })).code).toBe('INVALID_ROOM_CODE');
    expect((await emit(s, 'room:join', { code: 'ZZZZZ', name: 'X' })).code).toBe('ROOM_NOT_FOUND');
    expect((await emit(s, 'room:join', { code: h.code, name: 'host' })).code).toBe('PLAYER_ALREADY_CONNECTED');
    expect((await emit(s, 'room:join', { code: h.code, name: '' })).code).toBe('INVALID_PAYLOAD');
    expect((await emit(s, 'room:create', { name: 'x'.repeat(40) })).code).toBe('INVALID_PAYLOAD');
    // fill to 4 then reject the 5th
    for (const n of ['A', 'B']) { const c = await client(); expect((await emit(c, 'room:join', { code: h.code, name: n })).ok).toBe(true); }
    expect((await emit(s, 'room:join', { code: h.code, name: 'Late' })).code).toBe('ROOM_FULL');
  });

  it('handles host actions: bots, settings, kick, ready', async () => {
    const { host, h, guests } = await lobby(2);
    const g = guests[0];
    expect((await emit(g.s, 'room:add-bot')).code).toBe('NOT_HOST');
    expect((await emit(host, 'room:add-bot')).ok).toBe(true);
    expect((await emit(host, 'room:add-bot')).ok).toBe(true);
    expect((await emit(host, 'room:add-bot')).code).toBe('ROOM_FULL');
    expect((await emit(host, 'room:update-settings', { mode: 'sustainable' })).ok).toBe(true);
    expect((await emit(host, 'room:update-settings', { roundLimit: 99 })).code).toBe('INVALID_PAYLOAD');
    const kicked = next(g.s, 'room:kicked');
    expect((await emit(host, 'room:kick', { playerId: g.j.playerId })).ok).toBe(true);
    await kicked;
    expect((await emit(g.s, 'room:ready', { ready: true })).code).toBe('NOT_IN_ROOM');
    expect(h.code).toBeTruthy();
  });

  it('enforces start conditions', async () => {
    const host = await client();
    const h = (await emit<JoinData>(host, 'room:create', { name: 'Solo' })).data!;
    await emit(host, 'room:add-bot');
    expect((await emit(host, 'room:start')).code).toBe('CANNOT_START');
    const s = await client();
    await emit(s, 'room:join', { code: h.code, name: 'Two' });
    const r = await emit(host, 'room:start');
    expect(r.code).toBe('CANNOT_START');
    expect(r.message).toContain('not ready');
    expect((await emit(s, 'room:start')).code).toBe('NOT_HOST');
    await emit(s, 'room:ready', { ready: true });
    expect((await emit(host, 'room:start')).ok).toBe(true);
    const late = await client();
    expect((await emit(late, 'room:join', { code: h.code, name: 'Late' })).code).toBe('GAME_ALREADY_STARTED');
  });

  it('transfers host when the host leaves the lobby', async () => {
    const { host, guests } = await lobby(2);
    const upd = next(guests[0].s, 'room:updated');
    await emit(host, 'room:leave');
    const room = await upd;
    expect(room.hostId).toBe(guests[0].j.playerId);
  });
});

describe('public room list', () => {
  const list = async (s: Socket) => (await emit<any[]>(s, 'room:list')).data!;

  it('lists only public, waiting rooms with free seats, and exposes no ids or tokens', async () => {
    const { host, h, guests } = await lobby(2);
    const stranger = await client();
    expect(await list(stranger)).toEqual([]); // hidden by default

    await emit(host, 'room:update-settings', { isPublic: true });
    const rooms = await list(stranger);
    expect(rooms).toEqual([{ code: h.code, hostName: 'Host', mode: 'capitalist', players: 2, maxSeats: 4 }]);
    expect(JSON.stringify(rooms)).not.toContain(h.token);
    expect(JSON.stringify(rooms)).not.toContain(h.playerId);

    expect((await emit(guests[0].s, 'room:update-settings', { isPublic: false })).code).toBe('NOT_HOST');

    await emit(host, 'room:add-bot');
    await emit(host, 'room:add-bot');
    expect(await list(stranger)).toEqual([]); // full

    await emit(host, 'room:kick', { playerId: guests[0].j.playerId });
    expect((await list(stranger)).length).toBe(1);
    await emit(host, 'room:update-settings', { isPublic: false });
    expect(await list(stranger)).toEqual([]); // hidden again
  });

  it('drops a public room once the game has started', async () => {
    const { host, guests } = await lobby(2);
    await emit(host, 'room:update-settings', { isPublic: true });
    await emit(guests[0].s, 'room:ready', { ready: true });
    expect((await emit(host, 'room:start')).ok).toBe(true);
    const stranger = await client();
    expect(await list(stranger)).toEqual([]);
  });
});

describe('game over sockets', () => {
  it('rejects wrong turn, dedupes actionId, and hides secrets', async () => {
    const g = await startGame(2);
    const actor = g.state.actorId!;
    const other = g.state.players.find(p => p.id !== actor)!.id;
    const wrong = await emit(socketFor(g, other), 'game:action', { actionId: 'w1', action: { type: 'roll' } });
    expect(wrong).toMatchObject({ ok: false, code: 'NOT_YOUR_TURN' });
    const invalid = await emit(socketFor(g, actor), 'game:action', { actionId: 'w2', action: { type: 'teleport' } });
    expect(invalid.code).toBe('INVALID_PAYLOAD');

    const sock = socketFor(g, actor);
    const upd = next<{ state: PublicGameState; seq: number }>(g.host, 'game:state-updated');
    const a = await emit(sock, 'game:action', { actionId: 'r1', action: { type: 'roll' } });
    expect(a.ok).toBe(true);
    const u = await upd;
    const dup = await emit(sock, 'game:action', { actionId: 'r1', action: { type: 'roll' } });
    expect(dup).toMatchObject({ ok: true });
    expect((dup.data as { seq: number }).seq).toBe(u.seq);
    await sleep(50);
    expect(ctx.mgr.rooms.get(g.h.code)!.session!.seq).toBe(u.seq);

    const json = JSON.stringify(u.state);
    expect(json).not.toContain('"decks"');
    expect(json).not.toContain(g.h.token);
    expect(json).not.toContain('token');
    expect(u.state.deckCounts.objective + u.state.deckCounts.policy).toBeGreaterThan(0);
    expect(Object.keys(u.state)).not.toContain('draw');
  });

  it('reconnects with a token and replaces duplicate sessions', async () => {
    const g = await startGame(2);
    const guest = g.guests[0];
    const fresh = await client();
    const replaced = next(guest.s, 'session:replaced');
    const snap = next<{ state: PublicGameState }>(fresh, 'game:snapshot');
    const r = await emit<JoinData>(fresh, 'game:reconnect', { token: guest.j.token });
    expect(r.ok).toBe(true);
    expect(r.data!.playerId).toBe(guest.j.playerId);
    await replaced;
    expect((await snap).state.players).toHaveLength(2);
    expect((await emit(fresh, 'game:reconnect', { token: 'nonsense-token-123' })).code).toBe('INVALID_TOKEN');
    // old socket can no longer act
    const old = await emit(guest.s, 'game:action', { actionId: 'x', action: { type: 'roll' } });
    expect(old.code).toBe('NOT_IN_ROOM');
    // a dropped player can come back
    fresh.close();
    await sleep(30);
    const again = await client();
    expect((await emit(again, 'game:reconnect', { token: guest.j.token })).ok).toBe(true);
  });

  it('autopilots a disconnected player', async () => {
    const g = await startGame(2);
    const actor = g.state.actorId!;
    const sock = socketFor(g, actor);
    const room = ctx.mgr.rooms.get(g.h.code)!;
    const before = room.session!.seq;
    sock.close();
    await sleep(600);
    expect(room.session!.seq).toBeGreaterThan(before + 1);
    expect(room.session!.state.log.some(l => l.key.startsWith('log.roll'))).toBe(true);
  });

  it('bots take their turns once humans are gone (autopilot + bot AI)', async () => {
    const l = await lobby(2);
    await emit(l.host, 'room:add-bot');
    await emit(l.guests[0].s, 'room:ready', { ready: true });
    await emit(l.host, 'room:start');
    const room = ctx.mgr.rooms.get(l.h.code)!;
    l.host.close(); l.guests[0].s.close();
    await sleep(2500);
    const rolls = room.session!.state.log.filter(x => x.key.startsWith('log.roll') && String(x.params?.name).startsWith('Bot'));
    expect(rolls.length).toBeGreaterThan(0);
    expect(room.session!.state.players.filter(p => p.isBot)).toHaveLength(1);
    expect(room.session!.seq).toBeGreaterThan(5);
  });
});

describe('assistant over sockets', () => {
  it('answers offline and rate limits', async () => {
    const l = await lobby(2);
    const a = await emit(l.host, 'ai:ask', { kind: 'tutor', question: 'What is surplus value?' });
    expect(a.ok).toBe(true);
    expect((a.data as { source: string }).source).toBe('offline');
    expect((a.data as { text: string }).text.toLowerCase()).toContain('surplus');
    await emit(l.host, 'ai:ask', { kind: 'tutor', question: 'What is a cartel?' });
    await emit(l.host, 'ai:ask', { kind: 'tutor', question: 'What is a trust?' });
    expect((await emit(l.host, 'ai:ask', { kind: 'tutor', question: 'again' })).code).toBe('RATE_LIMITED');
    expect((await emit(l.host, 'ai:ask', { kind: 'tutor', question: 'x'.repeat(501) })).code).toBe('INVALID_PAYLOAD');
  });
});

describe('language per socket', () => {
  it('the Game Master narrates once per language and only to sockets using it', async () => {
    await ctx.close();
    ctx.server.close();
    const q: number[] = [];
    ctx = createApp({
      ai: createAiService({}), rng: () => (q.length ? q.shift()! : 0.5),
      timing: { botMin: 10, botMax: 20, disconnectMs: 60000, tradeMs: 60000, autoStepMs: 20 },
    });
    await new Promise<void>(r => ctx.server.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${(ctx.server.address() as AddressInfo).port}`;
    const g = await startGame(2);
    expect((await emit(g.guests[0].s, 'session:set-lang', { lang: 'vi' })).ok).toBe(true);
    expect((await emit(g.guests[0].s, 'session:set-lang', { lang: 'fr' })).code).toBe('INVALID_PAYLOAD');
    const hostText = next<{ text: string }>(g.host, 'ai:narration');
    const guestText = next<{ text: string }>(g.guests[0].s, 'ai:narration');
    const actor = socketFor(g, g.state.actorId!);
    q.push(0.0833, 0.0833); // two ones: lands on the Objective Event space 2
    expect((await emit(actor, 'game:action', { actionId: 'n1', action: { type: 'roll' } })).ok).toBe(true);
    expect((await hostText).text).toContain('turns over');
    expect((await guestText).text).toContain('lật thẻ');
    // the state stays language-neutral: log entries are keys with params
    const room = ctx.mgr.rooms.get(g.h.code)!;
    expect(room.session!.state.log.every(l => l.key.startsWith('log.'))).toBe(true);
    // Vietnamese question gets a Vietnamese answer
    const a = await emit<{ text: string }>(g.guests[0].s, 'ai:ask', { kind: 'tutor', question: 'gia tri thang du la gi', lang: 'vi' });
    expect(a.data!.text).toContain('Giá trị thặng dư');
    const b = await emit<{ text: string }>(g.host, 'ai:ask', { kind: 'tutor', question: 'surplus value' });
    expect(b.data!.text).toContain('Surplus value');
  });
});
