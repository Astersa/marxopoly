import crypto from 'node:crypto';
import { autopilotAction, botAction } from '../shared/bot';
import { applyAction, createGame, currentActor, shuffle, toPublic, type NewPlayer } from '../shared/engine';
import { getPlayer } from '../shared/rules';
import { ActionError, type Action, type GameEvent, type GameSettings, type GameState, type PublicGameState, type Rng } from '../shared/types';

export interface Timing { botMin: number; botMax: number; disconnectMs: number; tradeMs: number; autoStepMs: number }
export const DEFAULT_TIMING: Timing = { botMin: 1200, botMax: 1800, disconnectMs: 30000, tradeMs: 30000, autoStepMs: 1500 };

export const cryptoRng: Rng = () => crypto.randomInt(0, 2 ** 32) / 2 ** 32;

export interface SessionHooks {
  onUpdate(state: PublicGameState, events: GameEvent[], seq: number): void;
  onFinished?(state: GameState): void;
  onEvents?(state: GameState, events: GameEvent[]): void;
}

export type DispatchResult = { ok: true; seq: number } | { ok: false; code: string; message: string };

export class GameSession {
  state: GameState;
  seq = 0;
  deadline: number | null = null;
  private timer: NodeJS.Timeout | null = null;
  private autoplay = new Set<string>();
  private recent = new Map<string, Map<string, DispatchResult>>();
  private destroyed = false;
  private finishedNotified = false;

  constructor(
    players: NewPlayer[], settings: GameSettings, private hooks: SessionHooks,
    private rng: Rng = cryptoRng, private timing: Timing = DEFAULT_TIMING,
  ) {
    this.state = createGame(shuffle(players, rng), settings, rng);
    this.reschedule();
  }

  snapshot(): PublicGameState { return toPublic(this.state, { deadline: this.deadline }); }

  dispatch(playerId: string, actionId: string, action: Action): DispatchResult {
    let cache = this.recent.get(playerId);
    if (!cache) { cache = new Map(); this.recent.set(playerId, cache); }
    const prev = cache.get(actionId);
    if (prev) return prev;
    let res: DispatchResult;
    try {
      this.autoplay.delete(playerId);
      this.apply(playerId, action);
      res = { ok: true, seq: this.seq };
    } catch (e) {
      if (e instanceof ActionError) res = { ok: false, code: e.code, message: e.message };
      else throw e;
    }
    cache.set(actionId, res);
    if (cache.size > 60) cache.delete(cache.keys().next().value!);
    return res;
  }

  private apply(playerId: string, action: Action) {
    const r = applyAction(this.state, playerId, action, this.rng);
    this.commit(r.state, r.events);
  }

  private commit(state: GameState, events: GameEvent[]) {
    this.state = state;
    this.seq++;
    this.reschedule();
    this.hooks.onUpdate(this.snapshot(), events, this.seq);
    this.hooks.onEvents?.(this.state, events);
    if (state.phase === 'finished' && !this.finishedNotified) { this.finishedNotified = true; this.hooks.onFinished?.(state); }
  }

  setConnected(playerId: string, connected: boolean) {
    const p = getPlayer(this.state, playerId);
    if (!p || p.isBot || p.connected === connected) return;
    p.connected = connected;
    if (connected) this.autoplay.delete(playerId);
    this.seq++;
    this.reschedule();
    this.hooks.onUpdate(this.snapshot(), [], this.seq);
  }

  private reschedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.deadline = null;
    if (this.destroyed || this.state.phase === 'finished') return;
    const actorId = currentActor(this.state);
    const actor = actorId ? getPlayer(this.state, actorId) : undefined;
    if (!actor) return;
    let delay: number | null = null;
    if (actor.isBot) delay = this.timing.botMin + Math.random() * (this.timing.botMax - this.timing.botMin);
    else if (this.autoplay.has(actor.id)) delay = this.timing.autoStepMs;
    else if (!actor.connected) delay = this.timing.disconnectMs;
    else if (this.state.trade) delay = this.timing.tradeMs;
    else if (this.state.settings.turnTimer > 0) delay = this.state.settings.turnTimer * 1000;
    if (delay == null) return;
    if (!actor.isBot) this.deadline = Date.now() + delay;
    const seq = this.seq;
    this.timer = setTimeout(() => this.fire(actor.id, seq), delay);
    this.timer.unref?.();
  }

  private fire(actorId: string, seq: number) {
    if (this.destroyed || seq !== this.seq || currentActor(this.state) !== actorId) return;
    const actor = getPlayer(this.state, actorId)!;
    try {
      if (actor.isBot) {
        const a = botAction(this.state, actorId);
        if (a) { try { this.apply(actorId, a); return; } catch { /* fall through to autopilot */ } }
      } else this.autoplay.add(actorId);
      const a2 = autopilotAction(this.state, actorId);
      if (a2) this.apply(actorId, a2);
    } catch (e) {
      console.error('[session] automatic action failed', e);
    }
  }

  /** Test helper: force the pending timer to run immediately. */
  fireNow() {
    const id = currentActor(this.state);
    if (id) this.fire(id, this.seq);
  }

  destroy() {
    this.destroyed = true;
    if (this.timer) clearTimeout(this.timer);
  }
}
