import { GROUPS, SPACES } from '../../shared/board';
import { financials, ownedBy } from '../../shared/rules';
import type { GameState } from '../../shared/types';
import { Avatar, PLAYER_COLORS } from '../avatars';
import type { GameView } from '../hooks';
import { useL } from '../i18n';
import { useStore } from '../store';

function Meter({ label, short, value, color }: { label: string; short: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5" title={`${label}: ${value}`}>
      <span className="w-4 text-[10px] font-bold text-[color:var(--muted)]">{short}</span>
      <div className="flex-1 h-1.5 bg-[color:var(--coal)]"><div className="h-full" style={{ width: `${value}%`, background: color }} /></div>
    </div>
  );
}

export function PlayerList({ view }: { view: GameView }) {
  const { t, fmt, space } = useL();
  const { game } = view;
  const set = useStore(s => s.set);
  return (
    <ul className="flex flex-col gap-3" aria-label={t('player.list')}>
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
                  {p.id === view.me?.id && <span className="tag !bg-[color:var(--red)] !text-[color:var(--paper)]">{t('player.you')}</span>}
                </div>
                <div className="flex gap-1 mt-1 flex-wrap items-center">
                  {turn && <span className="tag !bg-[color:var(--brass)]">{t('player.to_act')}</span>}
                  {p.isBot && <span className="tag">{t('player.bot')}</span>}
                  {!p.isBot && !p.connected && <span className="tag !bg-[color:var(--red)] !text-[color:var(--paper)]">{t('player.offline')}</span>}
                  {p.inJail && <span className="tag !bg-[color:var(--coal3)] !text-[color:var(--paper)] border border-[color:var(--paper)]">{t('player.strike')}</span>}
                  {p.jailCards.length > 0 && <span className="tag" title={t('player.card_title')}>{t('player.card', { n: p.jailCards.length })}</span>}
                  {p.bankrupt && <span className="tag">{t('player.bankrupt')}</span>}
                </div>
              </div>
            </div>
            {!p.bankrupt && (
              <>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="font-poster text-2xl text-[color:var(--brass)]" data-testid={`cash-${i}`}>{fmt(p.cash)}</span>
                  <span className="text-xs text-[color:var(--muted)]">{t('player.net_worth', { n: fmt(f.netWorth) })}</span>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                  <Meter label={t('idx.technology')} short={t('idx.t')} value={p.indices.technology} color="#3aa6c9" />
                  <Meter label={t('idx.laborRelations')} short={t('idx.l')} value={p.indices.laborRelations} color="#e0782b" />
                  <Meter label={t('idx.socialContribution')} short={t('idx.s')} value={p.indices.socialContribution} color="#d9b21f" />
                  <Meter label={t('idx.sustainability')} short={t('idx.g')} value={p.indices.sustainability} color="#2f9d6b" />
                </div>
                {props.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {props.map(id => {
                      const sp = SPACES[id];
                      const col = sp.group ? GROUPS[sp.group].color : '#a69b84';
                      const name = space(id).name;
                      return (
                        <button key={id} className="w-4 h-4 border border-[color:var(--ink)]" style={{ background: col, opacity: game.props[id].mortgaged ? 0.35 : 1 }} aria-label={name}
                          title={`${name}${game.props[id].level ? ' L' + game.props[id].level : ''}${game.props[id].mortgaged ? ' (' + t('panel.mortgaged').toLowerCase() + ')' : ''}`}
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

/** Slim horizontal player summary shown above the 3D board so the board can use the whole column. */
export function PlayerStrip({ view }: { view: GameView }) {
  const { t, fmt } = useL();
  const { game } = view;
  return (
    <ul className="flex flex-col gap-1.5" aria-label={t('player.list')} data-testid="player-strip">
      {game.players.map((p, i) => {
        const turn = game.actorId === p.id;
        const f = financials(game as unknown as GameState, p.id);
        return (
          <li key={p.id} data-testid="player-card" className={`panel flex items-center gap-2 px-2.5 py-1 ${p.bankrupt ? 'opacity-50' : ''} ${turn ? 'ring-2 ring-[color:var(--brass)]' : ''}`} style={{ borderLeftColor: PLAYER_COLORS[i % 4] }}>
            <Avatar idx={p.avatar} size={32} color={PLAYER_COLORS[i % 4]} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className={`font-poster text-base leading-none truncate ${p.bankrupt ? 'line-through' : ''}`}>{p.name}</span>
                {p.id === view.me?.id && <span className="tag !bg-[color:var(--red)] !text-[color:var(--paper)]">{t('player.you')}</span>}
                {p.isBot && <span className="tag">{t('player.bot')}</span>}
                {!p.isBot && !p.connected && <span className="tag !bg-[color:var(--red)] !text-[color:var(--paper)]">{t('player.offline')}</span>}
                {p.inJail && <span className="tag">{t('player.strike')}</span>}
              </div>
              {!p.bankrupt && <div className="flex items-baseline gap-2"><span className="font-poster text-lg text-[color:var(--brass)]" data-testid={`cash-${i}`}>{fmt(p.cash)}</span><span className="text-[11px] text-[color:var(--muted)] truncate">{t('player.net_worth', { n: fmt(f.netWorth) })}</span></div>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
