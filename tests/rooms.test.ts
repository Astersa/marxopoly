import { describe, expect, it } from 'vitest';
import { RoomManager, DEFAULT_LIMITS } from '../src/server/rooms';
import { GameSession } from '../src/server/session';
import { currentActor } from '../src/shared/engine';
import { DEFAULT_SETTINGS, type PublicGameState } from '../src/shared/types';

const hooks = { onUpdate: () => undefined };

describe('RoomManager', () => {
  it('generates unambiguous codes and enforces the room cap', () => {
    const m = new RoomManager({ ...DEFAULT_LIMITS, maxRooms: 3 });
    const codes = new Set<string>();
    for (let i = 0; i < 3; i++) {
      const { room } = m.create('P' + i, 0, 's' + i);
      expect(room.code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/);
      expect(/[01OI]/.test(room.code)).toBe(false);
      codes.add(room.code);
    }
    expect(codes.size).toBe(3);
    expect(() => m.create('Z', 0, 'sz')).toThrow(/full/i);
  });

  it('cleans up empty and finished rooms, transfers a long-gone host', () => {
    const m = new RoomManager();
    const { room } = m.create('Host', 0, 's1');
    m.join(room.code, 'Guest', 1, 's2');
    const t0 = Date.now();
    m.disconnect('s1');
    expect(m.sweep(t0 + 30_000)).toHaveLength(0);
    expect(room.hostId).not.toBe(room.seats[1].playerId);
    const changed = m.sweep(t0 + 61_000);
    expect(changed).toHaveLength(1);
    expect(room.hostId).toBe(room.seats[1].playerId);
    m.disconnect('s2');
    m.sweep(t0 + 61_000 + 31 * 60_000);
    expect(m.rooms.size).toBe(0);

    const a = m.create('A', 0, 'sa').room;
    const b = m.join(a.code, 'B', 1, 'sb').seat;
    m.setReady(a, b.playerId, true);
    m.start(a, a.hostId, hooks);
    m.markFinished(a);
    m.sweep(Date.now() + 61 * 60_000);
    expect(m.rooms.has(a.code)).toBe(false);
  });

  it('keeps a seat when a player drops during a game and marks connection', () => {
    const m = new RoomManager();
    const a = m.create('A', 0, 'sa').room;
    const b = m.join(a.code, 'B', 1, 'sb').seat;
    m.setReady(a, b.playerId, true);
    m.start(a, a.hostId, hooks);
    m.disconnect('sb');
    expect(a.session!.state.players.find(p => p.id === b.playerId)!.connected).toBe(false);
    m.reconnect(b.token, 'sb2');
    expect(a.session!.state.players.find(p => p.id === b.playerId)!.connected).toBe(true);
    a.session!.destroy();
  });
});

describe('GameSession timers', () => {
  const timing = { botMin: 5, botMax: 10, disconnectMs: 40, tradeMs: 40, autoStepMs: 10 };
  it('bots act on their own and humans time out into autopilot', async () => {
    const updates: PublicGameState[] = [];
    const s = new GameSession(
      [{ id: 'h', name: 'Human', avatar: 0, isBot: false }, { id: 'b', name: 'Bot', avatar: 1, isBot: true }],
      { ...DEFAULT_SETTINGS, turnTimer: 1 }, { onUpdate: st => updates.push(st) }, undefined, { ...timing },
    );
    const start = s.seq;
    await new Promise(r => setTimeout(r, 1500));
    expect(s.seq).toBeGreaterThan(start + 3);
    expect(updates.some(u => u.deadline !== null)).toBe(true);
    s.destroy();
  });
  it('reports a deadline for human actors and none when finished', () => {
    const s = new GameSession(
      [{ id: 'h', name: 'Human', avatar: 0, isBot: false }, { id: 'g', name: 'Guest', avatar: 1, isBot: false }],
      { ...DEFAULT_SETTINGS, turnTimer: 90 }, hooks,
    );
    expect(s.deadline).toBeGreaterThan(Date.now());
    expect(s.snapshot().actorId).toBe(currentActor(s.state));
    s.destroy();
  });
});
