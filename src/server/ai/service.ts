import type { AiAnswer } from '../../shared/protocol';
import { ActionError, type GameEvent, type GameState } from '../../shared/types';
import type { Room, Seat } from '../rooms';
import type { AiHooks } from '../sockets';
import { AnthropicProvider } from './anthropic';
import { buildPrompt } from './context';
import { OfflineProvider } from './offline';
import type { AiContext, AiProvider } from './provider';

export interface AiServiceOptions {
  /** the paid/remote provider, if any */
  remote?: AiProvider | null;
  maxPerRoom?: number;
  perMinute?: number;
  now?: () => number;
}

const MAX_TOKENS = 2000;

export function createAiService(opts: AiServiceOptions = {}): AiHooks {
  const offline = new OfflineProvider();
  const remote = opts.remote ?? null;
  const maxPerRoom = opts.maxPerRoom ?? 100;
  const perMinute = opts.perMinute ?? 10;
  const now = opts.now ?? Date.now;
  const windows = new Map<string, number[]>();

  async function run(ctx: AiContext): Promise<AiAnswer> {
    const { system, prompt } = buildPrompt(ctx);
    const req = { system, prompt, maxTokens: MAX_TOKENS, ctx };
    if (remote) {
      try { return { text: await remote.complete(req), source: 'claude' }; } catch { /* fall back to offline */ }
    }
    return { text: await offline.complete(req), source: 'offline' };
  }

  return {
    name: remote ? remote.name : 'offline',
    async ask(room: Room, seat: Seat, req) {
      const t = now();
      const w = (windows.get(seat.playerId) ?? []).filter(x => t - x < 60_000);
      if (w.length >= perMinute) throw new ActionError('RATE_LIMITED', 'Slow down: at most 10 questions per minute.');
      if (room.aiCount >= maxPerRoom) throw new ActionError('RATE_LIMITED', 'This room has used all of its assistant questions.');
      w.push(t); windows.set(seat.playerId, w);
      room.aiCount++;
      return run({ kind: req.kind, question: req.question, spaceId: req.spaceId, state: room.session?.snapshot(), playerId: seat.playerId });
    },
    async narrate(room: Room, state: GameState, events: GameEvent[]) {
      if (room.aiCount >= maxPerRoom) return null;
      room.aiCount++;
      const snap = room.session?.snapshot();
      const res = await run({ kind: 'narrator', events, state: snap });
      return res.text || null;
    },
  };
}

export function createAiHooks(env: NodeJS.ProcessEnv = process.env): AiHooks {
  const key = env.ANTHROPIC_API_KEY?.trim();
  const remote = key ? new AnthropicProvider({ apiKey: key, model: env.AI_MODEL }) : null;
  return createAiService({ remote, maxPerRoom: Number(env.AI_MAX_REQUESTS_PER_ROOM) || 100 });
}
