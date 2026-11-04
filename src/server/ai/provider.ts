import type { Lang } from '../../shared/i18n';
import type { GameEvent, PublicGameState } from '../../shared/types';

export interface AiContext {
  kind: 'tutor' | 'advisor' | 'narrator';
  lang?: Lang;
  question?: string;
  spaceId?: number;
  state?: PublicGameState;
  playerId?: string;
  events?: GameEvent[];
}

export interface CompleteRequest {
  system: string;
  prompt: string;
  maxTokens: number;
  /** Structured context, used only by the offline provider. */
  ctx?: AiContext;
}

export interface AiProvider {
  readonly name: string;
  complete(req: CompleteRequest): Promise<string>;
}
