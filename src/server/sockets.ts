import type { Server, Socket } from 'socket.io';
import { ZodError } from 'zod';
import type { Ack, AiAnswer, ClientEvent, JoinData } from '../shared/protocol';
import { schemas } from '../shared/protocol';
import { ActionError, type GameEvent, type GameState } from '../shared/types';
import { RoomManager, type Room, type Seat } from './rooms';
import type { SessionHooks } from './session';

export interface AiHooks {
  name: string;
  ask(room: Room, seat: Seat, req: { kind: 'tutor' | 'advisor'; question: string; spaceId?: number }): Promise<AiAnswer>;
  narrate(room: Room, state: GameState, events: GameEvent[]): Promise<string | null>;
}

interface SockData { code?: string; playerId?: string }

export function attachSockets(io: Server, mgr: RoomManager, ai?: AiHooks) {
  const aiName = () => ai?.name ?? 'offline';
  const emitRoom = (room: Room) => io.to(room.code).emit('room:updated', mgr.publicRoom(room, aiName()));

  const hooksFor = (room: Room): SessionHooks => ({
    onUpdate: (state, events, seq) => io.to(room.code).emit('game:state-updated', { state, events, seq }),
    onFinished: () => { mgr.markFinished(room); emitRoom(room); },
    onEvents: (state, events) => {
      if (!ai) return;
      if (!events.some(e => e.type === 'card' || e.type === 'bankrupt' || e.type === 'gameover')) return;
      const now = Date.now();
      const last = events.some(e => e.type === 'gameover') ? 0 : room.lastNarration;
      if (now - last < 20_000) return;
      room.lastNarration = now;
      ai.narrate(room, state, events).then(text => { if (text) io.to(room.code).emit('ai:narration', { text }); }).catch(() => undefined);
    },
  });

  io.on('connection', (socket: Socket) => {
    const data = socket.data as SockData;

    const ctx = (): { room: Room; seat: Seat } => {
      if (!data.code || !data.playerId) throw new ActionError('NOT_IN_ROOM', 'You are not in a room.');
      const room = mgr.rooms.get(data.code);
      if (!room) throw new ActionError('ROOM_NOT_FOUND', 'The room no longer exists.');
      return { room, seat: mgr.seatOf(room, data.playerId) };
    };

    const bind = (room: Room, seat: Seat) => {
      data.code = room.code; data.playerId = seat.playerId;
      socket.join(room.code);
    };

    const detach = () => {
      if (data.code) socket.leave(data.code);
      data.code = undefined; data.playerId = undefined;
    };

    function on<E extends ClientEvent>(event: E, handler: (payload: any) => unknown | Promise<unknown>) {
      (socket as Socket).on(event as string, async (raw: unknown, cb?: (a: Ack) => void) => {
        const ack = typeof cb === 'function' ? cb : () => undefined;
        try {
          const payload = (schemas[event] as any).parse(raw ?? {});
          const result = await handler(payload);
          ack({ ok: true, data: result ?? null });
        } catch (e) {
          if (e instanceof ActionError) ack({ ok: false, code: e.code, message: e.message });
          else if (e instanceof ZodError) ack({ ok: false, code: 'INVALID_PAYLOAD', message: e.issues[0]?.message ?? 'Invalid request' });
          else { console.error('[socket]', event, e); ack({ ok: false, code: 'INTERNAL', message: 'Something went wrong.' }); }
        }
      });
    }

    const leaveCurrent = () => {
      if (!data.code || !data.playerId) return;
      const room = mgr.rooms.get(data.code);
      const pid = data.playerId;
      detach();
      if (!room) return;
      try { mgr.leave(room, pid); } catch { /* seat already gone */ }
      if (mgr.rooms.has(room.code)) emitRoom(room);
    };

    const joined = (room: Room, seat: Seat): JoinData => {
      bind(room, seat);
      emitRoom(room);
      return { code: room.code, playerId: seat.playerId, token: seat.token, room: mgr.publicRoom(room, aiName()) };
    };

    on('room:create', p => { leaveCurrent(); const { room, seat } = mgr.create(p.name, p.avatar, socket.id); return joined(room, seat); });
    on('room:join', p => { leaveCurrent(); const { room, seat } = mgr.join(p.code, p.name, p.avatar, socket.id); return joined(room, seat); });
    on('room:leave', () => { leaveCurrent(); return null; });
    on('room:ready', p => { const { room, seat } = ctx(); mgr.setReady(room, seat.playerId, p.ready); emitRoom(room); });
    on('room:kick', p => {
      const { room, seat } = ctx();
      const kicked = mgr.kick(room, seat.playerId, p.playerId);
      if (kicked.socketId) {
        const s = io.sockets.sockets.get(kicked.socketId);
        s?.emit('room:kicked', { reason: 'The host removed you from the room.' });
        if (s) { s.leave(room.code); (s.data as SockData).code = undefined; (s.data as SockData).playerId = undefined; }
      }
      emitRoom(room);
    });
    on('room:update-settings', p => { const { room, seat } = ctx(); mgr.updateSettings(room, seat.playerId, p); emitRoom(room); });
    on('room:update-profile', p => { const { room, seat } = ctx(); mgr.updateProfile(room, seat.playerId, p.name, p.avatar); emitRoom(room); });
    on('room:add-bot', () => { const { room, seat } = ctx(); mgr.addBot(room, seat.playerId); emitRoom(room); });
    on('room:start', () => {
      const { room, seat } = ctx();
      mgr.start(room, seat.playerId, hooksFor(room));
      emitRoom(room);
      io.to(room.code).emit('game:snapshot', { state: room.session!.snapshot(), seq: room.session!.seq });
    });
    on('game:action', p => {
      const { room, seat } = ctx();
      if (!room.session) throw new ActionError('BAD_STATE', 'The game has not started.');
      const res = room.session.dispatch(seat.playerId, p.actionId, p.action as never);
      if (!res.ok) throw new ActionError(res.code, res.message);
      return { seq: res.seq };
    });
    on('game:reconnect', p => {
      const { room, seat, previousSocketId } = mgr.reconnect(p.token, socket.id);
      if (previousSocketId) {
        const old = io.sockets.sockets.get(previousSocketId);
        if (old) { old.emit('session:replaced'); old.leave(room.code); (old.data as SockData).code = undefined; (old.data as SockData).playerId = undefined; }
      }
      bind(room, seat);
      emitRoom(room);
      const join: JoinData = { code: room.code, playerId: seat.playerId, token: seat.token, room: mgr.publicRoom(room, aiName()) };
      if (room.session) setImmediate(() => socket.emit('game:snapshot', { state: room.session!.snapshot(), seq: room.session!.seq }));
      return join;
    });
    on('ai:ask', async p => {
      const { room, seat } = ctx();
      if (!ai) throw new ActionError('AI_UNAVAILABLE', 'The assistant is not available.');
      return ai.ask(room, seat, p);
    });

    socket.on('disconnect', () => {
      const room = mgr.disconnect(socket.id);
      if (room && mgr.rooms.has(room.code)) emitRoom(room);
    });
  });
}
