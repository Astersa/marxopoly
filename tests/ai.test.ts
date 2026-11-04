import { describe, expect, it, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { AnthropicProvider } from '../src/server/ai/anthropic';
import { buildPrompt, SYSTEM_PROMPTS } from '../src/server/ai/context';
import { OfflineProvider } from '../src/server/ai/offline';
import { createAiService } from '../src/server/ai/service';
import type { AiProvider } from '../src/server/ai/provider';
import { toPublic } from '../src/shared/engine';
import { give, newGame } from './helpers';

const room = (n = 0) => ({ aiCount: n, session: null }) as any;
const seat = { playerId: 'p0' } as any;

describe('AnthropicProvider request shape', () => {
  it('sends exactly the planned request and reads text blocks', async () => {
    const create = vi.fn().mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: 'x' }, { type: 'text', text: 'Hello ' }, { type: 'text', text: 'world' }] });
    const p = new AnthropicProvider({ model: 'claude-sonnet-5-5', client: { beta: { messages: { create } } } });
    const out = await p.complete({ system: 'SYS', prompt: 'hi', maxTokens: 2000 });
    expect(out).toBe('Hello world');
    const body = create.mock.calls[0][0];
    expect(body).toEqual({
      model: 'claude-sonnet-5-5', max_tokens: 2000, system: 'SYS', messages: [{ role: 'user', content: 'hi' }],
      output_config: { effort: 'low' }, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    });
    for (const k of ['temperature', 'top_p', 'top_k', 'thinking']) expect(body).not.toHaveProperty(k);
  });
  it('treats refusals and all SDK errors as unavailable', async () => {
    const mk = (fn: () => Promise<unknown>) => new AnthropicProvider({ client: { beta: { messages: { create: fn as never } } } });
    await expect(mk(async () => ({ stop_reason: 'refusal', content: [] })).complete({ system: '', prompt: '', maxTokens: 10 })).rejects.toThrow();
    await expect(mk(async () => { throw new Anthropic.RateLimitError(429, {}, 'slow', new Headers()); }).complete({ system: '', prompt: '', maxTokens: 10 })).rejects.toThrow(/rate/);
    await expect(mk(async () => { throw new Anthropic.InternalServerError(500, {}, 'boom', new Headers()); }).complete({ system: '', prompt: '', maxTokens: 10 })).rejects.toThrow(/500/);
    await expect(mk(async () => { throw new Anthropic.APIConnectionError({ message: 'down' }); }).complete({ system: '', prompt: '', maxTokens: 10 })).rejects.toThrow(/connection/);
  });
  it('system prompts are stable (no timestamps)', () => {
    expect(JSON.stringify(SYSTEM_PROMPTS)).not.toMatch(/20\d\d-\d\d-\d\d/);
    const a = buildPrompt({ kind: 'tutor', question: 'surplus value' });
    const b = buildPrompt({ kind: 'tutor', question: 'surplus value' });
    expect(a.system).toBe(b.system);
    expect(a.prompt).toContain('<player_question>');
  });
});

describe('offline provider', () => {
  const off = new OfflineProvider();
  it('tutor answers from the glossary and board content', async () => {
    const a = await off.complete({ system: '', prompt: '', maxTokens: 1, ctx: { kind: 'tutor', question: 'What is organic composition of capital?' } });
    expect(a.toLowerCase()).toContain('constant to variable');
    const b = await off.complete({ system: '', prompt: '', maxTokens: 1, ctx: { kind: 'tutor', question: 'tell me', spaceId: 16 } });
    expect(b).toContain('Cartel Price Alliance');
    const c = await off.complete({ system: '', prompt: '', maxTokens: 1, ctx: { kind: 'tutor', question: 'zzzz qqqq' } });
    expect(c).toContain('could not find');
  });
  it('advisor reasons from real state', async () => {
    const s = newGame(2); give(s, 'p0', [11, 12]); give(s, 'p1', [13]); s.players[0].position = 9;
    const state = toPublic(s, { deadline: null });
    const a = await off.complete({ system: '', prompt: '', maxTokens: 1, ctx: { kind: 'advisor', state, playerId: 'p0' } });
    expect(a).toContain('Heavy Industry');
    expect(a).toMatch(/^- /);
  });
});

describe('AiService', () => {
  const state = () => toPublic(newGame(2), { deadline: null });
  it('uses the remote provider when it works, falls back when it fails', async () => {
    const ok: AiProvider = { name: 'claude', complete: async () => 'from claude' };
    const bad: AiProvider = { name: 'claude', complete: async () => { throw new Error('boom'); } };
    const svc1 = createAiService({ remote: ok });
    expect(await svc1.ask(room(), seat, { kind: 'tutor', question: 'What is a trust?' })).toEqual({ text: 'from claude', source: 'claude' });
    const svc2 = createAiService({ remote: bad });
    const r = await svc2.ask(room(), seat, { kind: 'tutor', question: 'What is a trust?' });
    expect(r.source).toBe('offline');
    expect(r.text.toLowerCase()).toContain('trust');
    expect(svc2.name).toBe('claude');
    expect(state()).toBeTruthy();
  });
  it('limits per minute and per room, and works with no provider', async () => {
    let t = 0;
    const svc = createAiService({ perMinute: 2, maxPerRoom: 3, now: () => t });
    const rm = room();
    await svc.ask(rm, seat, { kind: 'tutor', question: 'cartel' });
    await svc.ask(rm, seat, { kind: 'tutor', question: 'cartel' });
    await expect(svc.ask(rm, seat, { kind: 'tutor', question: 'cartel' })).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    t = 61_000;
    await svc.ask(rm, seat, { kind: 'tutor', question: 'cartel' });
    await expect(svc.ask(rm, seat, { kind: 'tutor', question: 'cartel' })).rejects.toMatchObject({ code: 'RATE_LIMITED' });
    expect(svc.name).toBe('offline');
  });
  it('narration falls back to offline text from the card explanation', async () => {
    const svc = createAiService({ remote: { name: 'claude', complete: async () => { throw new Error('x'); } } });
    const text = await svc.narrate(room(), newGame(2), [{ type: 'card', playerId: 'p0', cardId: 'obj-inflation', deck: 'objective' }]);
    expect(text).toContain('Inflation');
  });
});
