import { SPACES } from '../../shared/board';
import { financials, ownedBy } from '../../shared/rules';
import type { GameState } from '../../shared/types';
import { Avatar, PLAYER_COLORS } from '../avatars';
import { fmt, type GameView } from '../hooks';
import { useStore } from '../store';
import { GROUPS } from '../../shared/board';

function Meter({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5" title={`${label}: ${value}`}>
      <span className="w-4 text-[10px] font-bold text-[color:var(--muted)]">{label[0]}</span>
      <div className="flex-1 h-1.5 bg-[color:var(--coal)]"><div className="h-full" style={{ width: `${value}%`, background: color }} /></div>
    </div>
  );
}

export function PlayerList({ view }: { view: GameView }) {
  const { game } = view;
  const set = useStore(s => s.set);
  return (
    <ul className="flex flex-col gap-3" aria-label="Players">
      {game.players.map((p, i) => {
        const f = financials(game as unknown as GameState, p.id);
        const props = ownedBy(game as unknown as GameState, p.id);
        const turn = game.actorId === p.id;
        return (
          <li key={p.id} data-testid="player-card" className={`panel p-3 ${p.bankrupt ? 'opacity-50' : ''} ${turn ? 'ring-2 ring-[color:var(--brass)]' : ''}`} style={{ borderLeftColor: PLAYER_COLORS[i % 4] }}>
            <div className="flex items-center gap-2.5">
              <Avatar idx={p.avatar} size={42} color={PLAYER_COLORS[i % 4]} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={`font-poster text-lg leading-none truncate ${p.bankrupt ? 'line-through' : ''}`}>{p.name}</span>
                  {p.id === view.me?.id && <span className="tag !bg-[color:var(--red)] !text-[color:var(--paper)]">You</span>}
                </div>
                <div className="flex gap-1 mt-1 flex-wrap items-center">
                  {turn && <span className="tag !bg-[color:var(--brass)]">To act</span>}
                  {p.isBot && <span className="tag">Bot</span>}
                  {!p.isBot && !p.connected && <span className="tag !bg-[color:var(--red)] !text-[color:var(--paper)]">Offline</span>}
                  {p.inJail && <span className="tag !bg-[color:var(--coal3)] !text-[color:var(--paper)] border border-[color:var(--paper)]">Strike</span>}
                  {p.jailCards.length > 0 && <span className="tag" title="Get out of strike card">Card x{p.jailCards.length}</span>}
                  {p.bankrupt && <span className="tag">Bankrupt</span>}
                </div>
              </div>
            </div>
            {!p.bankrupt && (
              <>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="font-poster text-2xl text-[color:var(--brass)]" data-testid={`cash-${i}`}>{fmt(p.cash)}</span>
                  <span className="text-xs text-[color:var(--muted)]">net worth {fmt(f.netWorth)}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                  <Meter label="Tech" value={p.indices.technology} color="#3aa6c9" />
                  <Meter label="Labor" value={p.indices.laborRelations} color="#e0782b" />
                  <Meter label="Social" value={p.indices.socialContribution} color="#d9b21f" />
                  <Meter label="Green" value={p.indices.sustainability} color="#2f9d6b" />
                </div>
                {props.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {props.map(id => {
                      const sp = SPACES[id];
                      const col = sp.group ? GROUPS[sp.group].color : '#a69b84';
                      return (
                        <button key={id} className="w-4 h-4 border border-[color:var(--ink)]" style={{ background: col, opacity: game.props[id].mortgaged ? 0.35 : 1 }} aria-label={sp.name}
                          title={`${sp.name}${game.props[id].level ? ' L' + game.props[id].level : ''}${game.props[id].mortgaged ? ' (mortgaged)' : ''}`}
                          onClick={() => set({ selectedSpace: id, tab: 'property' })} />
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
