import { useEffect, useRef, useState } from 'react';
import { GROUPS, RENTS, SPACES, capitalIndicators } from '../../shared/board';
import { levelName } from '../../shared/i18n';
import { developCost, mortgageValue, ownedBy, unmortgageCost } from '../../shared/rules';
import type { GameState } from '../../shared/types';
import type { GameView } from '../hooks';
import { useL } from '../i18n';
import { commands, useStore } from '../store';

const sign = (n: number) => (n >= 0 ? '+' : '') + n;

export function ActionPanel({ view }: { view: GameView }) {
  const { t, space, card, fmt } = useL();
  const { game, me } = view;
  const set = useStore(s => s.set);
  const mine = me ? ownedBy(game as unknown as GameState, me.id) : [];
  const alive = game.players.filter(p => !p.bankrupt).length;
  return (
    <div className="flex flex-col gap-4">
      <section>
        <h3 className="h-label mb-2">{t('panel.holdings')}</h3>
        {mine.length === 0 ? <p className="text-[color:var(--muted)]">{t('panel.no_props')}</p> : (
          <ul className="flex flex-col gap-1.5">
            {mine.map(id => {
              const sp = SPACES[id], pr = game.props[id];
              return (
                <li key={id}>
                  <button className="w-full flex items-center gap-2 text-left px-2 py-1.5 bg-[color:var(--coal3)] hover:bg-[color:var(--line)]" onClick={() => set({ selectedSpace: id, tab: 'property' })}>
                    <span className="w-3 h-8 shrink-0" style={{ background: sp.group ? GROUPS[sp.group].color : '#a69b84' }} />
                    <span className="flex-1 min-w-0 font-semibold leading-tight">{space(id).name}</span>
                    {pr.mortgaged && <span className="tag">{t('panel.mortgaged')}</span>}
                    {sp.kind === 'property' && <span className="tag !bg-[color:var(--brass)]">L{pr.level}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section>
        <h3 className="h-label mb-2">{t('panel.effects')}</h3>
        {game.modifiers.length === 0 ? <p className="text-[color:var(--muted)]">{t('panel.none')}</p> : (
          <ul className="flex flex-col gap-1">
            {game.modifiers.map(m => (
              <li key={m.id} className="text-sm bg-[color:var(--coal3)] px-2 py-1.5">
                <b>{card(m.source).name}</b>: {t(`mod.${m.kind}` as const, { m: m.multiplier })}, {t('panel.rounds_left', { n: m.roundsLeft })}
                <span className="text-[color:var(--muted)]"> ({m.playerIds.length === alive ? t('panel.everyone') : m.playerIds.map(id => game.players.find(p => p.id === id)?.name).join(', ')})</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="flex gap-2 flex-wrap">
        <button className="btn btn-sm" onClick={() => set({ modal: 'glossary' })}>{t('panel.glossary')}</button>
        <button className="btn btn-sm btn-dark" onClick={() => set({ modal: 'help' })}>{t('panel.howto')}</button>
      </section>
      <p className="text-xs text-[color:var(--muted)]">{t('panel.deck', { o: game.deckCounts.objective, p: game.deckCounts.policy })}</p>
      <span className="hidden">{fmt(0)}</span>
    </div>
  );
}

export function PropertyPanel({ view }: { view: GameView }) {
  const L = useL();
  const { t, fmt, lang } = L;
  const { game, me, has } = view;
  const id = useStore(s => s.selectedSpace);
  const set = useStore(s => s.set);
  if (id == null) return <p className="text-[color:var(--muted)]">{t('prop.hint')}</p>;
  const sp = SPACES[id];
  const ls = L.space(id);
  const pr = game.props[id];
  const owner = pr?.owner ? game.players.find(p => p.id === pr.owner) : null;
  const g = sp.group ? GROUPS[sp.group] : null;
  const ind = sp.kind === 'property' ? capitalIndicators(id, pr?.level ?? 0) : null;
  const mineOwned = pr?.owner === me?.id;
  const gl = sp.glossary ? L.term(sp.glossary) : null;
  const st = game as unknown as GameState;
  const gname = g ? L.group(g.id).name : t(`kind.${sp.kind}` as const);
  return (
    <div className="flex flex-col gap-4" data-testid="property-panel">
      <div className="border-4 border-[color:var(--paper)]">
        <div className="h-3" style={{ background: g?.color ?? '#a69b84' }} />
        <div className="bg-[color:var(--paper)] text-[color:var(--ink)] p-3">
          <div className="h-label !text-[color:var(--red)]">{g ? `${g.id} ${gname}` : gname}</div>
          <h3 className="font-poster text-2xl leading-tight">{ls.name}</h3>
          {sp.price != null && <div className="font-bold mt-1">{t('prop.price', { price: fmt(sp.price) })} - {owner ? t('prop.owned_by', { name: owner.name }) : t('prop.unowned')}</div>}
          {pr?.mortgaged && <div className="tag !bg-[color:var(--red)] !text-[color:var(--paper)] mt-1">{t('panel.mortgaged')}</div>}
        </div>
      </div>

      {pr && (
        <div className="flex flex-wrap gap-2">
          {mineOwned && sp.kind === 'property' && (
            <>
              <button className="btn btn-sm btn-red" disabled={!has('develop', id)} onClick={() => commands.act({ type: 'develop', spaceId: id })}>{t('prop.develop')} {has('develop', id) ? '-' + developCost(st, me!.id, id) : ''}</button>
              <button className="btn btn-sm" disabled={!has('sell_development', id)} onClick={() => commands.act({ type: 'sell_development', spaceId: id })}>{t('prop.sell')}</button>
            </>
          )}
          {mineOwned && (
            <>
              <button className="btn btn-sm" disabled={!has('mortgage', id)} onClick={() => commands.act({ type: 'mortgage', spaceId: id })}>{t('prop.mortgage', { n: mortgageValue(id) })}</button>
              <button className="btn btn-sm" disabled={!has('unmortgage', id)} onClick={() => commands.act({ type: 'unmortgage', spaceId: id })}>{t('prop.redeem', { n: unmortgageCost(id) })}</button>
            </>
          )}
        </div>
      )}

      {sp.kind === 'property' && (
        <div>
          <h4 className="h-label mb-1">{t('prop.rent_by')}</h4>
          <table className="w-full text-sm border-collapse">
            <tbody>
              {RENTS[id].map((r, lvl) => (
                <tr key={lvl} className={pr?.level === lvl ? 'bg-[color:var(--red)] text-[color:var(--paper)] font-bold' : 'odd:bg-[color:var(--coal3)]'}>
                  <td className="px-2 py-1">L{lvl} {levelName(lang, lvl)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{fmt(r)}{lvl === 0 ? ' ' + t('prop.full_group') : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {g && <p className="text-xs text-[color:var(--muted)] mt-1">{t('prop.level_cost', { cost: fmt(g.buildCost), t: sign(g.impact.technology), l: sign(g.impact.laborRelations), s: sign(g.impact.socialContribution), g: sign(g.impact.sustainability) })}</p>}
        </div>
      )}
      {sp.kind === 'station' && <p className="text-sm">{t('prop.station_rent')}</p>}
      {sp.kind === 'utility' && <p className="text-sm">{t('prop.utility_rent')}</p>}

      {ind && g && (
        <div className="border-2 border-dashed border-[color:var(--brass)] p-3" data-testid="csv-box">
          <div className="h-label">{t('prop.edu')}</div>
          <div className="grid grid-cols-5 gap-1 text-center mt-2">
            {([['K', ind.K], ['c', ind.c], ['v', ind.v], ['m', ind.s]] as const).map(([k, v]) => (
              <div key={k} className="bg-[color:var(--coal3)] py-1"><div className="font-poster text-lg">{Math.round(v)}</div><div className="text-xs text-[color:var(--muted)]">{lang === 'vi' ? k : k === 'm' ? 's' : k}</div></div>
            ))}
            <div className="bg-[color:var(--coal3)] py-1"><div className="font-poster text-lg">{Math.round(ind.profitRate * 100)}%</div><div className="text-xs text-[color:var(--muted)]">p'</div></div>
          </div>
          <p className="text-xs text-[color:var(--muted)] mt-2">{t('prop.edu_note', { oc: g.ocLabel, m: Math.round(g.mPrime * 100) })}</p>
        </div>
      )}

      <div className="flex flex-col gap-2 text-sm leading-relaxed">
        <p><b className="text-[color:var(--brass)]">{t('prop.what')}</b> {ls.definition}</p>
        <p><b className="text-[color:var(--brass)]">{t('prop.idea')}</b> {ls.explanation}</p>
        <p><b className="text-[color:var(--brass)]">{t('prop.example')}</b> {ls.example}</p>
        <p><b className="text-[color:var(--brass)]">{t('prop.in_game')}</b> {ls.mechanic}</p>
        {gl && <button className="btn btn-sm self-start" onClick={() => set({ modal: 'glossary', glossaryQuery: gl.term.split(' (')[0] })}>{t('prop.gloss_btn', { term: gl.term.split(' (')[0] })}</button>}
        <button className="btn btn-sm btn-dark self-start" onClick={() => { set({ tab: 'advisor' }); void commands.ask('tutor', t('prop.tutor_q', { space: id }), id); }}>{t('prop.ask_tutor')}</button>
      </div>
    </div>
  );
}

export function AdvisorPanel() {
  const { t } = useL();
  const chat = useStore(s => s.chat);
  const busy = useStore(s => s.chatBusy);
  const selected = useStore(s => s.selectedSpace);
  const [kind, setKind] = useState<'tutor' | 'advisor'>('tutor');
  const [q, setQ] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [chat.length]);
  const send = (text: string, k = kind) => { if (!text.trim() || busy) return; void commands.ask(k, text.trim(), k === 'tutor' ? selected ?? undefined : undefined); setQ(''); };
  const chips: [string, 'tutor' | 'advisor'][] = [[t('chat.chip1'), 'tutor'], [t('chat.chip2'), 'tutor'], [t('chat.chip3'), 'advisor'], [t('chat.chip4'), 'advisor']];
  return (
    <div className="flex flex-col h-full min-h-[320px]">
      <div className="flex gap-2 mb-3" role="tablist" aria-label={t('chat.mode_aria')}>
        {(['tutor', 'advisor'] as const).map(k => (
          <button key={k} role="tab" aria-selected={kind === k} className={`btn btn-sm flex-1 ${kind === k ? 'btn-red' : 'btn-dark'}`} onClick={() => setKind(k)}>{k === 'tutor' ? t('chat.tutor') : t('chat.advisor')}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {chips.map(([c, k]) => <button key={c} className="tag !py-1 !px-2 !normal-case !tracking-normal !text-sm hover:!bg-[color:var(--brass)]" onClick={() => { setKind(k); send(c, k); }}>{c}</button>)}
      </div>
      <div className="flex-1 scroll-y flex flex-col gap-2 pr-1 max-h-[46vh] lg:max-h-none" aria-live="polite" data-testid="chat">
        {chat.length === 0 && <p className="text-[color:var(--muted)]">{t('chat.empty')}</p>}
        {chat.map(m => (
          <div key={m.id} className={`px-3 py-2 text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-[color:var(--coal3)] self-end max-w-[90%]' : 'bg-[color:var(--paper)] text-[color:var(--ink)] max-w-[96%]'}`}>
            {m.text}
            {m.role === 'ai' && m.source && <div className="mt-1 text-[10px] uppercase tracking-widest opacity-60">{m.source === 'claude' ? t('chat.src_claude') : t('chat.src_offline')}</div>}
          </div>
        ))}
        {busy && <div className="text-[color:var(--muted)] text-sm">{t('chat.thinking')}</div>}
        <div ref={end} />
      </div>
      <form className="flex gap-2 mt-3" onSubmit={e => { e.preventDefault(); send(q); }}>
        <input className="input" maxLength={500} value={q} onChange={e => setQ(e.target.value)} placeholder={kind === 'tutor' ? t('chat.ph_tutor') : t('chat.ph_advisor')} aria-label={t('chat.question')} />
        <button className="btn btn-sm" type="submit" disabled={busy || !q.trim()}>{t('chat.ask')}</button>
      </form>
    </div>
  );
}

export function LogPanel({ view }: { view: GameView }) {
  const { msg } = useL();
  const log = [...view.game.log].reverse();
  return (
    <ol className="flex flex-col gap-1 text-sm" data-testid="log">
      {log.map(l => <li key={l.n} className="border-l-4 border-[color:var(--line)] pl-2 py-0.5"><span className="text-[color:var(--muted)] text-xs mr-1">R{l.round}</span>{msg({ key: l.key, params: l.params })}</li>)}
    </ol>
  );
}
