import crypto from 'node:crypto';
import { MAX_SEATS, ROOM_CODE_ALPHABET, ROOM_CODE_RE, type RoomListing, type RoomPublic, type RoomStatus, type SeatPublic } from '../shared/protocol';
import { ActionError, DEFAULT_SETTINGS, type GameSettings, type Rng } from '../shared/types';
import { GameSession, type SessionHooks, type Timing } from './session';

export interface Seat {
  playerId: string;
  token: string;
  name: string;
  avatar: number;
  isBot: boolean;
  ready: boolean;
  connected: boolean;
  socketId: string | null;
}

export interface Room {
  code: string;
  status: RoomStatus;
  hostId: string;
  settings: GameSettings;
  seats: Seat[];
  session: GameSession | null;
  createdAt: number;
  lastHumanSeen: number;
  finishedAt: number | null;
  hostDownSince: number | null;
  aiCount: number;
  lastNarration: number;
}

const BOT_NAMES = ['Ada', 'Boris', 'Clara', 'Dmitri', 'Elena', 'Felix', 'Greta', 'Hugo'];
const hex = (n: number) => crypto.randomBytes(n).toString('hex');

export interface RoomLimits { maxRooms: number; hostGraceMs: number; emptyTtlMs: number; finishedTtlMs: number }
export const DEFAULT_LIMITS: RoomLimits = { maxRooms: 200, hostGraceMs: 60_000, emptyTtlMs: 30 * 60_000, finishedTtlMs: 60 * 60_000 };

export class RoomManager {
  rooms = new Map<string, Room>();
  private tokens = new Map<string, { code: string; playerId: string }>();

  constructor(public limits: RoomLimits = DEFAULT_LIMITS, private timing?: Timing, private rng?: Rng) {}

  private genCode(): string {
    for (let tries = 0; tries < 50; tries++) {
      let code = '';
      for (let i = 0; i < 5; i++) code += ROOM_CODE_ALPHABET[crypto.randomInt(0, ROOM_CODE_ALPHABET.length)];
      if (!this.rooms.has(code)) return code;
    }
    throw new ActionError('TOO_MANY_ROOMS', 'Could not allocate a room code');
  }

  private newSeat(name: string, avatar: number, isBot = false): Seat {
    return { playerId: hex(4), token: hex(24), name, avatar, isBot, ready: isBot, connected: isBot, socketId: null };
  }

  private register(room: Room, seat: Seat) {
    room.seats.push(seat);
    if (!seat.isBot) this.tokens.set(seat.token, { code: room.code, playerId: seat.playerId });
  }

  private nameTaken(room: Room, name: string, exceptId?: string) {
    return room.seats.find(s => s.playerId !== exceptId && s.name.toLowerCase() === name.toLowerCase());
  }

  create(name: string, avatar: number, socketId: string, isPublic = true): { room: Room; seat: Seat } {
    if (this.rooms.size >= this.limits.maxRooms) throw new ActionError('TOO_MANY_ROOMS', 'The server is full. Try again later.');
    const code = this.genCode();
    const seat = this.newSeat(name, avatar);
    seat.connected = true; seat.socketId = socketId; seat.ready = true;
    const room: Room = {
      code, status: 'WAITING', hostId: seat.playerId, settings: { ...DEFAULT_SETTINGS, isPublic }, seats: [], session: null,
      createdAt: Date.now(), lastHumanSeen: Date.now(), finishedAt: null, hostDownSince: null, aiCount: 0, lastNarration: 0,
    };
    this.register(room, seat);
    this.rooms.set(code, room);
    return { room, seat };
  }

  get(code: string): Room {
    if (!ROOM_CODE_RE.test(code)) throw new ActionError('INVALID_ROOM_CODE', 'Room codes have 5 letters or digits.');
    const room = this.rooms.get(code);
    if (!room) throw new ActionError('ROOM_NOT_FOUND', 'No room with that code.');
    return room;
  }

  join(code: string, name: string, avatar: number, socketId: string): { room: Room; seat: Seat } {
    const room = this.get(code);
    if (room.status !== 'WAITING') throw new ActionError('GAME_ALREADY_STARTED', 'That game has already started.');
    if (room.seats.length >= MAX_SEATS) throw new ActionError('ROOM_FULL', 'The room is full (4 seats).');
    const clash = this.nameTaken(room, name);
    if (clash) {
      if (clash.connected) throw new ActionError('PLAYER_ALREADY_CONNECTED', 'A connected player already uses that name.');
      throw new ActionError('NAME_TAKEN', 'That name is used by a disconnected player. Pick another name.');
    }
    const seat = this.newSeat(name, avatar);
    seat.connected = true; seat.socketId = socketId;
    this.register(room, seat);
    room.lastHumanSeen = Date.now();
    return { room, seat };
  }

  byToken(token: string): { room: Room; seat: Seat } | null {
    const ref = this.tokens.get(token);
    if (!ref) return null;
    const room = this.rooms.get(ref.code);
    const seat = room?.seats.find(s => s.playerId === ref.playerId);
    return room && seat ? { room, seat } : null;
  }

  /** Attach a new socket to the seat. Returns the previous socket id (to be told it was replaced). */
  reconnect(token: string, socketId: string): { room: Room; seat: Seat; previousSocketId: string | null } {
    const found = this.byToken(token);
    if (!found) throw new ActionError('INVALID_TOKEN', 'Your session has expired.');
    const { room, seat } = found;
    const previousSocketId = seat.socketId && seat.socketId !== socketId ? seat.socketId : null;
    seat.socketId = socketId; seat.connected = true;
    room.lastHumanSeen = Date.now();
    if (seat.playerId === room.hostId) room.hostDownSince = null;
    room.session?.setConnected(seat.playerId, true);
    return { room, seat, previousSocketId };
  }

  /** Called when a socket drops. Ignored if the seat already moved to a newer socket. */
  disconnect(socketId: string): Room | null {
    for (const room of this.rooms.values()) {
      const seat = room.seats.find(s => s.socketId === socketId);
      if (!seat) continue;
      seat.connected = false; seat.socketId = null;
      if (room.status === 'WAITING') {
        seat.ready = false;
        if (seat.playerId === room.hostId) room.hostDownSince = Date.now();
      }
      room.session?.setConnected(seat.playerId, false);
      return room;
    }
    return null;
  }

  private assertHost(room: Room, playerId: string) {
    if (room.hostId !== playerId) throw new ActionError('NOT_HOST', 'Only the host can do that.');
  }
  private assertWaiting(room: Room) {
    if (room.status !== 'WAITING') throw new ActionError('BAD_STATE', 'The game has already started.');
  }
  seatOf(room: Room, playerId: string): Seat {
    const s = room.seats.find(x => x.playerId === playerId);
    if (!s) throw new ActionError('NOT_IN_ROOM', 'You are not in this room.');
    return s;
  }

  private transferHost(room: Room) {
    const next = room.seats.find(s => !s.isBot && s.connected) ?? room.seats.find(s => !s.isBot);
    if (next) { room.hostId = next.playerId; next.ready = true; room.hostDownSince = null; }
  }

  /** Removes the seat. Returns the removed seat; deletes the room when no humans remain. */
  leave(room: Room, playerId: string): Seat {
    const seat = this.seatOf(room, playerId);
    if (room.status === 'WAITING') {
      room.seats = room.seats.filter(s => s !== seat);
      this.tokens.delete(seat.token);
      if (!room.seats.some(s => !s.isBot)) { this.deleteRoom(room); return seat; }
      if (room.hostId === playerId) this.transferHost(room);
    } else {
      seat.connected = false; seat.socketId = null;
      room.session?.setConnected(playerId, false);
    }
    return seat;
  }

  kick(room: Room, hostId: string, targetId: string): Seat {
    this.assertHost(room, hostId); this.assertWaiting(room);
    if (targetId === hostId) throw new ActionError('BAD_TARGET', 'You cannot kick yourself.');
    const seat = this.seatOf(room, targetId);
    room.seats = room.seats.filter(s => s !== seat);
    this.tokens.delete(seat.token);
    return seat;
  }

  setReady(room: Room, playerId: string, ready: boolean) {
    this.assertWaiting(room);
    const seat = this.seatOf(room, playerId);
    seat.ready = seat.playerId === room.hostId ? true : ready;
  }

  updateSettings(room: Room, playerId: string, patch: Partial<GameSettings>) {
    this.assertHost(room, playerId); this.assertWaiting(room);
    room.settings = { ...room.settings, ...patch };
    if (room.settings.mode === 'sustainable') room.settings.roundLimit = 0;
  }

  updateProfile(room: Room, playerId: string, name: string, avatar: number) {
    this.assertWaiting(room);
    const seat = this.seatOf(room, playerId);
    if (this.nameTaken(room, name, playerId)) throw new ActionError('NAME_TAKEN', 'That name is already used in this room.');
    seat.name = name; seat.avatar = avatar;
  }

  addBot(room: Room, playerId: string): Seat {
    this.assertHost(room, playerId); this.assertWaiting(room);
    if (room.seats.length >= MAX_SEATS) throw new ActionError('ROOM_FULL', 'The room is full (4 seats).');
    const name = BOT_NAMES.map(n => 'Bot ' + n).find(n => !this.nameTaken(room, n)) ?? 'Bot ' + hex(2);
    const used = new Set(room.seats.map(s => s.avatar));
    let avatar = 0; while (used.has(avatar) && avatar < 7) avatar++;
    const seat = this.newSeat(name, avatar, true);
    room.seats.push(seat);
    return seat;
  }

  startProblems(room: Room): string[] {
    const problems: string[] = [];
    const humans = room.seats.filter(s => !s.isBot);
    const online = humans.filter(s => s.connected);
    if (online.length < 2) problems.push('At least 2 connected human players are needed.');
    if (!online.some(s => s.playerId === room.hostId)) problems.push('The host must be connected.');
    for (const s of online) if (!s.ready && s.playerId !== room.hostId) problems.push(`${s.name} is not ready.`);
    return problems;
  }

  start(room: Room, playerId: string, hooks: SessionHooks) {
    this.assertHost(room, playerId); this.assertWaiting(room);
    const problems = this.startProblems(room);
    if (problems.length) throw new ActionError('CANNOT_START', problems.join(' '));
    room.status = 'STARTING';
    for (const s of room.seats.filter(x => !x.isBot && !x.connected)) { this.tokens.delete(s.token); }
    room.seats = room.seats.filter(s => s.isBot || s.connected);
    room.session = new GameSession(
      room.seats.map(s => ({ id: s.playerId, name: s.name, avatar: s.avatar, isBot: s.isBot })),
      room.settings, hooks, this.rng, this.timing,
    );
    room.status = 'PLAYING';
  }

  markFinished(room: Room) { room.status = 'FINISHED'; room.finishedAt = Date.now(); }

  deleteRoom(room: Room) {
    room.session?.destroy();
    for (const s of room.seats) this.tokens.delete(s.token);
    this.rooms.delete(room.code);
  }

  /** Housekeeping. Returns rooms whose host changed so the caller can broadcast. */
  sweep(now = Date.now()): Room[] {
    const changed: Room[] = [];
    for (const room of [...this.rooms.values()]) {
      const anyHuman = room.seats.some(s => !s.isBot && s.connected);
      if (anyHuman) room.lastHumanSeen = now;
      if ((!anyHuman && now - room.lastHumanSeen > this.limits.emptyTtlMs) || (room.finishedAt && now - room.finishedAt > this.limits.finishedTtlMs)) {
        this.deleteRoom(room);
        continue;
      }
      if (room.status === 'WAITING' && room.hostDownSince && now - room.hostDownSince > this.limits.hostGraceMs) {
        const cand = room.seats.find(s => !s.isBot && s.connected && s.playerId !== room.hostId);
        if (cand) { room.hostId = cand.playerId; cand.ready = true; room.hostDownSince = null; changed.push(room); }
      }
    }
    return changed;
  }

  /** Public rooms a new player could join right now. */
  listPublic(limit = 50): RoomListing[] {
    const out: RoomListing[] = [];
    for (const room of this.rooms.values()) {
      if (out.length >= limit) break;
      if (room.status !== 'WAITING' || !room.settings.isPublic || room.seats.length >= MAX_SEATS) continue;
      const host = room.seats.find(s => s.playerId === room.hostId);
      if (!host?.connected) continue;
      out.push({ code: room.code, hostName: host.name, mode: room.settings.mode, players: room.seats.length, maxSeats: MAX_SEATS });
    }
    return out;
  }

  publicRoom(room: Room, aiProvider = 'offline'): RoomPublic {
    const seats: SeatPublic[] = room.seats.map(s => ({
      playerId: s.playerId, name: s.name, avatar: s.avatar, isBot: s.isBot, connected: s.connected, ready: s.ready, isHost: s.playerId === room.hostId,
    }));
    return { code: room.code, status: room.status, hostId: room.hostId, settings: room.settings, seats, maxSeats: MAX_SEATS, aiProvider };
  }
}
