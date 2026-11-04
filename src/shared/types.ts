export type IndexKey = 'technology' | 'laborRelations' | 'socialContribution' | 'sustainability';
export type Indices = Record<IndexKey, number>;
export const INDEX_KEYS: IndexKey[] = ['technology', 'laborRelations', 'socialContribution', 'sustainability'];

export type GameMode = 'capitalist' | 'sustainable';
export type SpaceKind = 'go' | 'property' | 'station' | 'utility' | 'event' | 'policy' | 'tax' | 'jail' | 'free' | 'gotojail';
export type GroupId = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6' | 'G7' | 'G8';
export type Phase = 'roll' | 'buy' | 'auction' | 'debt' | 'post_roll' | 'finished';
export type DeckId = 'objective' | 'policy';

export interface GameSettings {
  mode: GameMode;
  roundLimit: 0 | 40 | 60;
  auctions: boolean;
  /** seconds; 0 disables the turn timer */
  turnTimer: number;
}
export const DEFAULT_SETTINGS: GameSettings = { mode: 'capitalist', roundLimit: 0, auctions: true, turnTimer: 90 };

/** A translatable message: the client turns key + params into text in the viewer's language. */
export type MsgParam = string | number | Msg;
export interface Msg { key: string; params?: Record<string, MsgParam> }

export interface PlayerState {
  id: string;
  name: string;
  avatar: number;
  isBot: boolean;
  cash: number;
  position: number;
  inJail: boolean;
  jailTurns: number;
  /** ids of held get-out-of-jail cards */
  jailCards: string[];
  bankrupt: boolean;
  indices: Indices;
  /** set by the session layer, not by the engine */
  connected: boolean;
}

export interface PropState {
  owner: string | null;
  level: number;
  mortgaged: boolean;
}

export interface Debt {
  id: number;
  playerId: string;
  toId: string | null;
  amount: number;
  reason: Msg;
}

export interface Auction {
  spaceId: number;
  /** players still in the auction, in bidding order */
  order: string[];
  turnIdx: number;
  highBid: number;
  highBidder: string | null;
}

export interface Trade {
  fromId: string;
  toId: string;
  offerCash: number;
  requestCash: number;
  offerSpaces: number[];
  requestSpaces: number[];
}

export interface Modifier {
  id: number;
  kind: 'rent' | 'develop_cost' | 'go_reward';
  multiplier: number;
  roundsLeft: number;
  playerIds: string[];
  source: string;
}

export interface LogEntry { n: number; round: number; key: string; params?: Record<string, MsgParam> }

export interface ScoreLine {
  financial: number; social: number; technology: number; sustainability: number; total: number;
}
export interface Standing {
  playerId: string; rank: number; bankrupt: boolean; netWorth: number; scores: ScoreLine;
}
export interface GameResult {
  mode: GameMode;
  reason: 'last_standing' | 'round_limit';
  winnerId: string | null;
  round: number;
  standings: Standing[];
  conceptIds: string[];
}

export interface DeckState { draw: string[]; discard: string[] }

export interface GameState {
  settings: GameSettings;
  players: PlayerState[];
  turn: number;
  round: number;
  phase: Phase;
  dice: [number, number];
  doublesCount: number;
  rollAgain: boolean;
  props: Record<number, PropState>;
  pendingPurchase: { playerId: string; spaceId: number } | null;
  auction: Auction | null;
  debts: Debt[];
  trade: Trade | null;
  tradesThisTurn: number;
  /** SERVER ONLY. Never sent to clients. */
  decks: Record<DeckId, DeckState>;
  modifiers: Modifier[];
  lastCard: { playerId: string; cardId: string } | null;
  cardsSeen: string[];
  log: LogEntry[];
  result: GameResult | null;
  nextId: number;
}

export type PublicGameState = Omit<GameState, 'decks'> & {
  deckCounts: Record<DeckId, number>;
  /** epoch ms when the current actor will be auto-played; null if none */
  deadline: number | null;
  actorId: string | null;
};

export type Action =
  | { type: 'roll' }
  | { type: 'buy' }
  | { type: 'decline' }
  | { type: 'auction_bid'; amount: number }
  | { type: 'auction_pass' }
  | { type: 'develop'; spaceId: number }
  | { type: 'sell_development'; spaceId: number }
  | { type: 'mortgage'; spaceId: number }
  | { type: 'unmortgage'; spaceId: number }
  | ({ type: 'trade_propose' } & Omit<Trade, 'fromId'>)
  | { type: 'trade_accept' }
  | { type: 'trade_reject' }
  | { type: 'trade_cancel' }
  | { type: 'jail_pay' }
  | { type: 'jail_card' }
  | { type: 'pay_debt' }
  | { type: 'declare_bankruptcy' }
  | { type: 'end_turn' };
export type ActionType = Action['type'];

export type GameEvent =
  | { type: 'dice'; playerId: string; dice: [number, number] }
  | { type: 'move'; playerId: string; from: number; to: number; steps: number; direct: boolean }
  | { type: 'card'; playerId: string; cardId: string; deck: DeckId }
  | { type: 'jail'; playerId: string }
  | { type: 'cash'; playerId: string; delta: number; reason: Msg }
  | { type: 'bankrupt'; playerId: string }
  | { type: 'gameover'; winnerId: string | null }
  | { type: 'log'; key: string; params?: Record<string, MsgParam> };

export type Rng = () => number;

export class ActionError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'ActionError';
  }
}
