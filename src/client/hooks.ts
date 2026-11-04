import { useEffect, useMemo, useState } from 'react';
import { canPropose, fromPublic, legalActions } from '../shared/engine';
import type { Action, ActionType, PlayerState, PublicGameState } from '../shared/types';
import { useStore } from './store';

export interface GameView {
  game: PublicGameState;
  me: PlayerState | undefined;
  myIdx: number;
  actor: PlayerState | undefined;
  isActor: boolean;
  legal: Action[];
  has: (t: ActionType, spaceId?: number) => boolean;
  canTrade: boolean;
  locked: boolean;
}

export function useGameView(): GameView | null {
  const game = useStore(s => s.game);
  const session = useStore(s => s.session);
  const animating = useStore(s => s.animating);
  const full = useMemo(() => (game ? fromPublic(game) : null), [game]);
  const legal = useMemo(() => (full && session ? legalActions(full, session.playerId) : []), [full, session]);
  const canTrade = useMemo(() => (full && session ? canPropose(full, session.playerId) : false), [full, session]);
  if (!game || !session) return null;
  const me = game.players.find(p => p.id === session.playerId);
  const actor = game.players.find(p => p.id === game.actorId);
  const locked = animating;
  return {
    game, me, myIdx: game.players.findIndex(p => p.id === session.playerId), actor, isActor: game.actorId === session.playerId, legal: locked ? [] : legal,
    has: (t, spaceId) => legal.some(a => a.type === t && (spaceId == null || (a as { spaceId?: number }).spaceId === spaceId)) && !locked,
    canTrade: canTrade && !locked, locked,
  };
}

/** Seconds remaining until `deadline` (ms epoch), ticking every 500ms. */
export function useCountdown(deadline: number | null): number | null {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!deadline) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [deadline]);
  return deadline ? Math.max(0, Math.ceil((deadline - now) / 1000)) : null;
}

export const fmt = (n: number) => `${n.toLocaleString('en-US')} cr`;
