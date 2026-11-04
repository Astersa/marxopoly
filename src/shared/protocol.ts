import { z } from 'zod';
import type { GameEvent, GameSettings, PublicGameState } from './types';

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/;
export const MAX_SEATS = 4;
export const AVATAR_COUNT = 8;

export const nameSchema = z.string().trim().min(1).max(16);
const avatarSchema = z.number().int().min(0).max(AVATAR_COUNT - 1);

export const ActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('roll') }),
  z.object({ type: z.literal('buy') }),
  z.object({ type: z.literal('decline') }),
  z.object({ type: z.literal('auction_bid'), amount: z.number().int().min(1).max(100000) }),
  z.object({ type: z.literal('auction_pass') }),
  z.object({ type: z.literal('develop'), spaceId: z.number().int().min(0).max(39) }),
  z.object({ type: z.literal('sell_development'), spaceId: z.number().int().min(0).max(39) }),
  z.object({ type: z.literal('mortgage'), spaceId: z.number().int().min(0).max(39) }),
  z.object({ type: z.literal('unmortgage'), spaceId: z.number().int().min(0).max(39) }),
  z.object({
    type: z.literal('trade_propose'), toId: z.string().max(40),
    offerCash: z.number().int().min(0).max(100000), requestCash: z.number().int().min(0).max(100000),
    offerSpaces: z.array(z.number().int().min(0).max(39)).max(28), requestSpaces: z.array(z.number().int().min(0).max(39)).max(28),
  }),
  z.object({ type: z.literal('trade_accept') }),
  z.object({ type: z.literal('trade_reject') }),
  z.object({ type: z.literal('trade_cancel') }),
  z.object({ type: z.literal('jail_pay') }),
  z.object({ type: z.literal('jail_card') }),
  z.object({ type: z.literal('pay_debt') }),
  z.object({ type: z.literal('declare_bankruptcy') }),
  z.object({ type: z.literal('end_turn') }),
]);

export const SettingsPatchSchema = z.object({
  mode: z.enum(['capitalist', 'sustainable']).optional(),
  roundLimit: z.union([z.literal(0), z.literal(40), z.literal(60)]).optional(),
  auctions: z.boolean().optional(),
  turnTimer: z.number().int().min(0).max(600).optional(),
}).strict();

export const schemas = {
  'room:create': z.object({ name: nameSchema, avatar: avatarSchema.default(0) }),
  'room:join': z.object({ code: z.string().trim().toUpperCase().max(10), name: nameSchema, avatar: avatarSchema.default(0) }),
  'room:leave': z.object({}).passthrough().optional(),
  'room:ready': z.object({ ready: z.boolean() }),
  'room:kick': z.object({ playerId: z.string().max(40) }),
  'room:update-settings': SettingsPatchSchema,
  'room:update-profile': z.object({ name: nameSchema, avatar: avatarSchema }),
  'room:add-bot': z.object({}).passthrough().optional(),
  'room:start': z.object({}).passthrough().optional(),
  'game:action': z.object({ actionId: z.string().min(1).max(64), action: ActionSchema }),
  'game:reconnect': z.object({ token: z.string().min(8).max(200) }),
  'ai:ask': z.object({ kind: z.enum(['tutor', 'advisor']), question: z.string().trim().min(1).max(500), spaceId: z.number().int().min(0).max(39).optional(), lang: z.enum(['en', 'vi']).default('en') }),
  'session:set-lang': z.object({ lang: z.enum(['en', 'vi']) }),
} as const;

export type ClientEvent = keyof typeof schemas;

export type RoomStatus = 'WAITING' | 'STARTING' | 'PLAYING' | 'FINISHED';

export interface SeatPublic {
  playerId: string;
  name: string;
  avatar: number;
  isBot: boolean;
  connected: boolean;
  ready: boolean;
  isHost: boolean;
}

export interface RoomPublic {
  code: string;
  status: RoomStatus;
  hostId: string;
  settings: GameSettings;
  seats: SeatPublic[];
  maxSeats: number;
  aiProvider: string;
}

export type Ack<T = unknown> = { ok: true; data: T } | { ok: false; code: string; message: string };

export interface JoinData { code: string; playerId: string; token: string; room: RoomPublic }
export interface AiAnswer { text: string; source: 'claude' | 'offline' }

export interface ServerToClient {
  'room:updated': (room: RoomPublic) => void;
  'room:kicked': (info: { reason: string }) => void;
  'session:replaced': () => void;
  'game:snapshot': (p: { state: PublicGameState; seq: number }) => void;
  'game:state-updated': (p: { state: PublicGameState; events: GameEvent[]; seq: number }) => void;
  'ai:narration': (p: { text: string }) => void;
}
