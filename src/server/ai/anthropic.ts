import Anthropic from '@anthropic-ai/sdk';
import type { AiProvider, CompleteRequest } from './provider';

export class AiUnavailable extends Error {
  constructor(public reason: string) { super(reason); this.name = 'AiUnavailable'; }
}

export interface AnthropicLike {
  beta: { messages: { create(params: any): Promise<any> } };
}

export class AnthropicProvider implements AiProvider {
  readonly name = 'claude';
  private client: AnthropicLike;

  constructor(opts: { apiKey?: string; model?: string; client?: AnthropicLike }) {
    this.model = opts.model || 'claude-sonnet-5-5';
    this.client = opts.client ?? (new Anthropic({ apiKey: opts.apiKey, maxRetries: 1, timeout: 20_000 }) as unknown as AnthropicLike);
  }
  private model: string;

  async complete(req: CompleteRequest): Promise<string> {
    try {
      // No temperature / top_p / top_k / thinking / prefill: they can cause 400s on current models.
      const msg = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: [{ role: 'user', content: req.prompt }],
        output_config: { effort: 'low' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      });
      if (msg.stop_reason === 'refusal') throw new AiUnavailable('refusal');
      const text = (msg.content as { type: string; text?: string }[])
        .filter(b => b.type === 'text')
        .map(b => b.text ?? '')
        .join('')
        .trim();
      if (!text) throw new AiUnavailable('empty response');
      return text;
    } catch (e) {
      if (e instanceof AiUnavailable) throw e;
      if (e instanceof Anthropic.RateLimitError) throw new AiUnavailable('rate limited');
      // SDK 1.4.0 has no APIStatusError export: APIError carries the status (APIConnectionError is a subclass, so check it first).
      if (e instanceof Anthropic.APIConnectionError) throw new AiUnavailable('connection error');
      if (e instanceof Anthropic.APIError) throw new AiUnavailable(`api status ${e.status}`);
      throw new AiUnavailable('unexpected error');
    }
  }
}
