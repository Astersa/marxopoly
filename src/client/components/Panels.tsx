import { useEffect, useRef, useState } from 'react';
import { GROUPS, LEVEL_NAMES, RENTS, SPACES, capitalIndicators } from '../../shared/board';
import { developCost, mortgageValue, ownedBy, unmortgageCost, modifierLabel } from '../../shared/rules';
import type { GameState } from '../../shared/types';
import { PLAYER_COLORS } from '../avatars';
import { fmt, type GameView } from '../hooks';
import { commands, useStore } from '../store';
import { GLOSSARY_MAP } from '../../shared/glossary';

export function ActionPanel({ view }: { view: GameView }) {
  const { game, me } = view;
  const set = useStore(s => s.set);
  const mine = me ? ownedBy(game as unknown as GameState, me.id) : [];
  return (
    <div className="flex flex-col gap-4">
      <section>
        <h3 className="h-label mb-2">Your holdings</h3>
        {mine.length === 0 ? <p className="text-[color:var(--muted)]">No properties yet. Land on a free space and buy it.</p> : (
          <ul className="flex flex-col gap-1.5">
            {mine.map(id => {
              const sp = SPACES[id], pr = game.props[id];
              return (
                <li key={id}>
                  <button className="w-full flex items-center gap-2 text-left px-2 py-1.5 bg-[color:var(--coal3)] hover:bg-[color:var(--line)]" onClick={() => set({ selectedSpace: id, tab: 'property' })}>
                    <span className="w-3 h-8 shrink-0" style={{ background: sp.group ? GROUPS[sp.group].color : '#a69b84' }} />
                    <span className="flex-1 min-w-0 truncate font-semibold">{sp.name}</span>
                    {pr.mortgaged && <span className="tag">Mortgaged</span>}
                    {sp.kind === 'property' && <span className="tag !bg-[color:var(--brass)]">L{pr.level}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section>
        <h3 className="h-label mb-2">Active effects</h3>
        {game.modifiers.length === 0 ? <p className="text-[color:var(--muted)]">None.</p> : (
          <ul className="flex flex-col gap-1">
            {game.modifiers.map(m => (
              <li key={m.id} className="text-sm bg-[color:var(--coal3)] px-2 py-1.5">
                <b>{m.source}</b>: {modifierLabel(m)} for {m.roundsLeft} more round{m.roundsLeft === 1 ? '' : 's'}
                <span className="text-[color:var(--muted)]"> ({m.playerIds.length === game.players.filter(p => !p.bankrupt).length ? 'everyone' : m.playerIds.map(id => game.players.find(p => p.id === id)?.name).join(', ')})</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="flex gap-2 flex-wrap">
        <button className="btn btn-sm" onClick={() => set({ modal: 'glossary' })}>Glossary</button>
        <button className="btn btn-sm btn-dark" onClick={() => set({ modal: 'help' })}>How to play</button>
      </section>
      <p className="text-xs text-[color:var(--muted)]">Deck: {game.deckCounts.objective} objective and {game.deckCounts.policy} policy cards left.</p>
    </div>
  );
}

export function PropertyPanel({ view }: { view: GameView }) {
  const { game, me, has } = view;
  const id = useStore(s => s.selectedSpace);
  const set = useStore(s => s.set);
  if (id == null) return <p className="text-[color:var(--muted)]">Click any space on the board to read about it.</p>;
  const sp = SPACES[id];
  const pr = game.props[id];
  const owner = pr?.owner ? game.players.find(p => p.id === pr.owner) : null;
  const g = sp.group ? GROUPS[sp.group] : null;
  const ind = sp.kind === 'property' ? capitalIndicators(id, pr?.level ?? 0) : null;
  const mineOwned = pr?.owner === me?.id;
  const gl = sp.glossary ? GLOSSARY_MAP[sp.glossary] : null;
  const st = game as unknown as GameState;
  return (
    <div className="flex flex-col gap-4" data-testid="property-panel">
      <div className="border-4 border-[color:var(--paper)]">
        <div className="h-3" style={{ background: g?.color ?? '#a69b84' }} />
        <div className="bg-[color:var(--paper)] text-[color:var(--ink)] p-3">
          <div className="h-label !text-[color:var(--red)]">{g ? `${g.id} ${g.name}` : sp.kind.replace('gotojail', 'go to strike')}</div>
          <h3 className="font-poster text-2xl leading-tight">{sp.name}</h3>
          {sp.price != null && <div className="font-bold mt-1">Price {fmt(sp.price)}{owner ? ` - owned by ${owner.name}` : ' - unowned'}</div>}
          {pr?.mortgaged && <div className="tag !bg-[color:var(--red)] !text-[color:var(--paper)] mt-1">Mortgaged</div>}
        </div>
      </div>

      {pr && (
        <div className="flex flex-wrap gap-2">
          {mineOwned && sp.kind === 'property' && (
            <>
              <button className="btn btn-sm btn-red" disabled={!has('develop', id)} onClick={() => commands.act({ type: 'develop', spaceId: id })}>Develop {has('develop', id) ? '-' + developCost(st, me!.id, id) : ''}</button>
              <button className="btn btn-sm" disabled={!has('sell_development', id)} onClick={() => commands.act({ type: 'sell_development', spaceId: id })}>Sell level</button>
            </>
          )}
          {mineOwned && (
            <>
              <button className="btn btn-sm" disabled={!has('mortgage', id)} onClick={() => commands.act({ type: 'mortgage', spaceId: id })}>Mortgage +{mortgageValue(id)}</button>
              <button className="btn btn-sm" disabled={!has('unmortgage', id)} onClick={() => commands.act({ type: 'unmortgage', spaceId: id })}>Redeem -{unmortgageCost(id)}</button>
            </>
          )}
        </div>
      )}

      {sp.kind === 'property' && (
        <div>
          <h4 className="h-label mb-1">Rent by development</h4>
          <table className="w-full text-sm border-collapse">
            <tbody>
              {RENTS[id].map((r, lvl) => (
                <tr key={lvl} className={pr?.level === lvl ? 'bg-[color:var(--red)] text-[color:var(--paper)] font-bold' : 'odd:bg-[color:var(--coal3)]'}>
                  <td className="px-2 py-1">L{lvl} {LEVEL_NAMES[lvl]}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{fmt(r)}{lvl === 0 ? ' (x2 with full group)' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {g && <p className="text-xs text-[color:var(--muted)] mt-1">Each level costs {fmt(g.buildCost)} and changes your indices by tech {g.impact.technology >= 0 ? '+' : ''}{g.impact.technology}, labor {g.impact.laborRelations >= 0 ? '+' : ''}{g.impact.laborRelations}, social {g.impact.socialContribution >= 0 ? '+' : ''}{g.impact.socialContribution}, green {g.impact.sustainability >= 0 ? '+' : ''}{g.impact.sustainability}.</p>}
        </div>
      )}
      {sp.kind === 'station' && <p className="text-sm">Rent 25 cr x 2<sup>n-1</sup> where n is the number of stations the owner holds.</p>}
      {sp.kind === 'utility' && <p className="text-sm">Rent is the dice total x 4, or x 10 if the owner holds both utilities.</p>}

      {ind && g && (
        <div className="border-2 border-dashed border-[color:var(--brass)] p-3" data-testid="csv-box">
          <div className="h-label">Educational indicator, not game currency</div>
          <div className="grid grid-cols-5 gap-1 text-center mt-2">
            {([['K', ind.K], ['c', ind.c], ['v', ind.v], ['s', ind.s]] as const).map(([k, v]) => (
              <div key={k} className="bg-[color:var(--coal3)] py-1"><div className="font-poster text-lg">{Math.round(v)}</div><div className="text-xs text-[color:var(--muted)]">{k}</div></div>
            ))}
            <div className="bg-[color:var(--coal3)] py-1"><div className="font-poster text-lg">{Math.round(ind.profitRate * 100)}%</div><div className="text-xs text-[color:var(--muted)]">p'</div></div>
          </div>
          <p className="text-xs text-[color:var(--muted)] mt-2">K = capital advanced (price + levels). c:v = {g.ocLabel}, m' = {Math.round(g.mPrime * 100)}%. s = v x m', p' = s / (c + v).</p>
        </div>
      )}

      <div className="flex flex-col gap-2 text-sm leading-relaxed">
        <p><b className="text-[color:var(--brass)]">What it is.</b> {sp.definition}</p>
        <p><b className="text-[color:var(--brass)]">The idea.</b> {sp.explanation}</p>
        <p><b className="text-[color:var(--brass)]">Example.</b> {sp.example}</p>
        <p><b className="text-[color:var(--brass)]">In the game.</b> {sp.mechanic}</p>
        {gl && <button className="btn btn-sm self-start" onClick={() => set({ modal: 'glossary', glossaryQuery: gl.term.split(' (')[0] })}>Glossary: {gl.term.split(' (')[0]}</button>}
        <button className="btn btn-sm btn-dark self-start" onClick={() => { set({ tab: 'advisor' }); void commands.ask('tutor', `Explain ${sp.name}`, id); }}>Ask the tutor</button>
      </div>
      <span className="hidden">{PLAYER_COLORS[0]}</span>
    </div>
  );
}

export function AdvisorPanel() {
  const chat = useStore(s => s.chat);
  const busy = useStore(s => s.chatBusy);
  const selected = useStore(s => s.selectedSpace);
  const [kind, setKind] = useState<'tutor' | 'advisor'>('tutor');
  const [q, setQ] = useState('');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }); }, [chat.length]);
  const send = (text: string, k = kind) => { if (!text.trim() || busy) return; void commands.ask(k, text.trim(), k === 'tutor' ? selected ?? undefined : undefined); setQ(''); };
  const chips: [string, 'tutor' | 'advisor'][] = [['What is surplus value?', 'tutor'], ['What is organic composition?', 'tutor'], ['What should I do next?', 'advisor'], ['What are my risks?', 'advisor']];
  return (
    <div className="flex flex-col h-full min-h-[320px]">
      <div className="flex gap-2 mb-3" role="tablist" aria-label="Assistant mode">
        {(['tutor', 'advisor'] as const).map(k => (
          <button key={k} role="tab" aria-selected={kind === k} className={`btn btn-sm flex-1 ${kind === k ? 'btn-red' : 'btn-dark'}`} onClick={() => setKind(k)}>{k === 'tutor' ? 'Tutor' : 'Advisor'}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {chips.map(([c, k]) => <button key={c} className="tag !py-1 !px-2 !normal-case !tracking-normal !text-sm hover:!bg-[color:var(--brass)]" onClick={() => { setKind(k); send(c, k); }}>{c}</button>)}
      </div>
      <div className="flex-1 scroll-y flex flex-col gap-2 pr-1 max-h-[46vh] lg:max-h-none" aria-live="polite" data-testid="chat">
        {chat.length === 0 && <p className="text-[color:var(--muted)]">Ask the Tutor about a concept or a space, or ask the Advisor for a read on your position. Works offline too.</p>}
        {chat.map(m => (
          <div key={m.id} className={`px-3 py-2 text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-[color:var(--coal3)] self-end max-w-[90%]' : 'bg-[color:var(--paper)] text-[color:var(--ink)] max-w-[96%]'}`}>
            {m.text}
            {m.role === 'ai' && m.source && <div className="mt-1 text-[10px] uppercase tracking-widest opacity-60">{m.source === 'claude' ? 'Claude' : 'Offline guide'}</div>}
          </div>
        ))}
        {busy && <div className="text-[color:var(--muted)] text-sm">Thinking...</div>}
        <div ref={end} />
      </div>
      <form className="flex gap-2 mt-3" onSubmit={e => { e.preventDefault(); send(q); }}>
        <input className="input" maxLength={500} value={q} onChange={e => setQ(e.target.value)} placeholder={kind === 'tutor' ? 'Ask about a concept...' : 'Ask for advice...'} aria-label="Question" />
        <button className="btn btn-sm" type="submit" disabled={busy || !q.trim()}>Ask</button>
      </form>
    </div>
  );
}

export function LogPanel({ view }: { view: GameView }) {
  const log = [...view.game.log].reverse();
  return (
    <ol className="flex flex-col gap-1 text-sm" data-testid="log">
      {log.map(l => <li key={l.n} className="border-l-4 border-[color:var(--line)] pl-2 py-0.5"><span className="text-[color:var(--muted)] text-xs mr-1">R{l.round}</span>{l.text}</li>)}
    </ol>
  );
}
