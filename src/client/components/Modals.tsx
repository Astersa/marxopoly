import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { GROUPS, GROUP_SPACES, SPACES } from '../../shared/board';
import { CARD_MAP } from '../../shared/cards';
import { GLOSSARY, GLOSSARY_MAP } from '../../shared/glossary';
import { financials } from '../../shared/rules';
import type { GameState } from '../../shared/types';
import { Avatar, PLAYER_COLORS } from '../avatars';
import { fmt, type GameView } from '../hooks';
import { commands, useStore } from '../store';

export function Modal({ title, onClose, children, wide, label }: { title: string; onClose?: () => void; children: ReactNode; wide?: boolean; label?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('keydown', key); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-3 bg-black/60" onMouseDown={e => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={label ?? title} className={`panel-paper slide-in w-full ${wide ? 'max-w-3xl' : 'max-w-lg'} max-h-[92vh] overflow-y-auto outline-none`}>
        <div className="flex items-center justify-between gap-3 px-5 pt-4">
          <h2 className="font-poster text-3xl leading-none">{title}</h2>
          {onClose && <button className="btn btn-sm" aria-label="Close" onClick={onClose}>Close</button>}
        </div>
        <div className="px-5 pb-5 pt-3">{children}</div>
      </div>
    </div>
  );
}

export function CardModal() {
  const shown = useStore(s => s.cardShown);
  const game = useStore(s => s.game);
  const set = useStore(s => s.set);
  useEffect(() => { if (!shown) return; const t = setTimeout(() => set({ cardShown: null }), 9000); return () => clearTimeout(t); }, [shown, set]);
  if (!shown) return null;
  const card = CARD_MAP[shown.cardId];
  const who = game?.players.find(p => p.id === shown.playerId)?.name ?? 'A player';
  const topic = GLOSSARY_MAP[card.topic];
  return (
    <Modal title={card.deck === 'objective' ? 'Objective event' : 'Policy and law'} onClose={() => set({ cardShown: null })}>
      <div data-testid="card-modal">
        <div className="h-label !text-[color:var(--red)]">{who} drew</div>
        <h3 className="font-poster text-4xl leading-tight">{card.name}</h3>
        <p className="mt-2 font-semibold">{card.description}</p>
        <p className="mt-3 text-sm"><b>Why it happens.</b> {card.explanation}</p>
        <p className="mt-2 text-sm"><b>Example.</b> {card.example}</p>
        {topic && <button className="mt-3 btn btn-sm" onClick={() => set({ cardShown: null, modal: 'glossary', glossaryQuery: topic.term.split(' (')[0] })}>Concept: {topic.term}</button>}
      </div>
    </Modal>
  );
}

export function AuctionModal({ view }: { view: GameView }) {
  const { game, me, has, isActor } = view;
  const a = game.auction;
  const min = a ? a.highBid + 10 : 10;
  const [bid, setBid] = useState(min);
  useEffect(() => setBid(min), [min]);
  if (game.phase !== 'auction' || !a) return null;
  const sp = SPACES[a.spaceId];
  const turn = game.players.find(p => p.id === a.order[a.turnIdx]);
  const high = game.players.find(p => p.id === a.highBidder);
  const max = me?.cash ?? 0;
  return (
    <Modal title="Auction" label="Auction">
      <div data-testid="auction">
        <h3 className="font-poster text-3xl leading-tight">{sp.name}</h3>
        <p className="font-semibold">List price {fmt(sp.price!)}</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="bg-[color:var(--ink)] text-[color:var(--paper)] p-3"><div className="h-label">Highest bid</div><div className="font-poster text-3xl">{a.highBidder ? fmt(a.highBid) : 'None'}</div><div className="text-sm opacity-80">{high?.name ?? ''}</div></div>
          <div className="bg-[color:var(--ink)] text-[color:var(--paper)] p-3"><div className="h-label">Bidding now</div><div className="font-poster text-3xl truncate">{turn?.name}</div><div className="text-sm opacity-80">{a.order.length} bidders left</div></div>
        </div>
        {isActor ? (
          <div className="mt-4">
            <label className="h-label !text-[color:var(--ink)]" htmlFor="bid">Your bid (cash {fmt(max)})</label>
            <div className="flex gap-2 mt-1">
              <input id="bid" type="number" className="input" min={min} max={max} step={10} value={bid} onChange={e => setBid(Number(e.target.value))} />
              <button className="btn btn-sm" onClick={() => setBid(Math.min(max, bid + 10))}>+10</button>
              <button className="btn btn-sm" onClick={() => setBid(Math.min(max, bid + 50))}>+50</button>
            </div>
            <div className="flex gap-2 mt-3">
              <button className="btn btn-red flex-1" disabled={!has('auction_bid') || bid < min || bid > max} onClick={() => commands.act({ type: 'auction_bid', amount: bid })}>Bid {fmt(bid)}</button>
              <button className="btn flex-1" onClick={() => commands.act({ type: 'auction_pass' })}>Pass</button>
            </div>
          </div>
        ) : <p className="mt-4 font-semibold">Waiting for {turn?.name} to bid or pass...</p>}
      </div>
    </Modal>
  );
}

function SpacePicker({ ids, picked, toggle, game }: { ids: number[]; picked: number[]; toggle: (id: number) => void; game: GameView['game'] }) {
  if (!ids.length) return <p className="text-sm opacity-60">No tradable spaces.</p>;
  return (
    <div className="flex flex-col gap-1">
      {ids.map(id => (
        <label key={id} className={`flex items-center gap-2 px-2 py-1.5 border-2 cursor-pointer ${picked.includes(id) ? 'border-[color:var(--red)] bg-[color:var(--red)]/10' : 'border-[color:var(--ink)]/30'}`}>
          <input type="checkbox" className="accent-[color:var(--red)]" checked={picked.includes(id)} onChange={() => toggle(id)} />
          <span className="w-2.5 h-5" style={{ background: SPACES[id].group ? GROUPS[SPACES[id].group!].color : '#777' }} />
          <span className="flex-1 text-sm font-semibold truncate">{SPACES[id].name}</span>
          <span className="text-xs">{fmt(SPACES[id].price!)}{game.props[id].mortgaged ? ' M' : ''}</span>
        </label>
      ))}
    </div>
  );
}

const tradable = (game: GameView['game'], pid: string) =>
  Object.keys(game.props).map(Number).filter(id => game.props[id].owner === pid)
    .filter(id => { const g = SPACES[id].group; return !g || GROUP_SPACES[g].every(x => game.props[x].level === 0); });

export function TradeComposer({ view }: { view: GameView }) {
  const { game, me } = view;
  const set = useStore(s => s.set);
  const others = game.players.filter(p => !p.bankrupt && p.id !== me?.id);
  const [to, setTo] = useState(others[0]?.id ?? '');
  const [offerCash, setOC] = useState(0);
  const [reqCash, setRC] = useState(0);
  const [offerSp, setOS] = useState<number[]>([]);
  const [reqSp, setRS] = useState<number[]>([]);
  if (!me) return null;
  const tog = (arr: number[], f: (a: number[]) => void) => (id: number) => f(arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id]);
  const partner = game.players.find(p => p.id === to);
  const empty = !offerCash && !reqCash && !offerSp.length && !reqSp.length;
  const send = async () => {
    const ok = await commands.act({ type: 'trade_propose', toId: to, offerCash, requestCash: reqCash, offerSpaces: offerSp, requestSpaces: reqSp });
    if (ok) set({ modal: null });
  };
  return (
    <Modal title="Propose a trade" onClose={() => set({ modal: null })} wide>
      <div data-testid="trade-composer">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Trade partner">
          {others.map(p => (
            <button key={p.id} role="radio" aria-checked={to === p.id} className={`btn btn-sm flex items-center gap-2 ${to === p.id ? 'btn-red' : ''}`} onClick={() => { setTo(p.id); setRS([]); setRC(0); }}>
              <Avatar idx={p.avatar} size={22} />{p.name}
            </button>
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-5 mt-4">
          <div>
            <h3 className="h-label !text-[color:var(--ink)]">You give</h3>
            <label className="text-sm font-semibold">Cash (you have {fmt(me.cash)})
              <input type="number" className="input mt-1" min={0} max={me.cash} value={offerCash} onChange={e => setOC(Math.max(0, Math.min(me.cash, Math.floor(Number(e.target.value) || 0))))} />
            </label>
            <div className="mt-2"><SpacePicker ids={tradable(game, me.id)} picked={offerSp} toggle={tog(offerSp, setOS)} game={game} /></div>
          </div>
          <div>
            <h3 className="h-label !text-[color:var(--ink)]">You get from {partner?.name}</h3>
            <label className="text-sm font-semibold">Cash (they have {fmt(partner?.cash ?? 0)})
              <input type="number" className="input mt-1" min={0} max={partner?.cash ?? 0} value={reqCash} onChange={e => setRC(Math.max(0, Math.min(partner?.cash ?? 0, Math.floor(Number(e.target.value) || 0))))} />
            </label>
            <div className="mt-2"><SpacePicker ids={tradable(game, to)} picked={reqSp} toggle={tog(reqSp, setRS)} game={game} /></div>
          </div>
        </div>
        <p className="text-xs mt-3 opacity-70">Developed groups cannot be traded. Mortgaged spaces move as they are. You can send up to 3 offers per turn.</p>
        <button className="btn btn-red w-full mt-3" disabled={empty || !to} onClick={send}>Send offer</button>
      </div>
    </Modal>
  );
}

export function TradePrompt({ view }: { view: GameView }) {
  const { game, me } = view;
  const t = game.trade;
  if (!t) return null;
  const from = game.players.find(p => p.id === t.fromId), to = game.players.find(p => p.id === t.toId);
  const list = (ids: number[]) => ids.length ? ids.map(id => SPACES[id].name).join(', ') : 'nothing';
  const iAmTo = me?.id === t.toId, iAmFrom = me?.id === t.fromId;
  return (
    <Modal title={iAmTo ? 'Trade offer for you' : 'Trade in progress'} label="Trade offer">
      <div data-testid="trade-prompt">
        <p className="font-semibold">{from?.name} offers {to?.name}:</p>
        <div className="grid sm:grid-cols-2 gap-3 mt-2">
          <div className="bg-[color:var(--ink)] text-[color:var(--paper)] p-3"><div className="h-label">{from?.name} gives</div><div className="mt-1">{t.offerCash ? fmt(t.offerCash) + ' and ' : ''}{list(t.offerSpaces)}</div></div>
          <div className="bg-[color:var(--ink)] text-[color:var(--paper)] p-3"><div className="h-label">{to?.name} gives</div><div className="mt-1">{t.requestCash ? fmt(t.requestCash) + ' and ' : ''}{list(t.requestSpaces)}</div></div>
        </div>
        {iAmTo && <div className="flex gap-2 mt-4"><button className="btn btn-red flex-1" onClick={() => commands.act({ type: 'trade_accept' })}>Accept</button><button className="btn flex-1" onClick={() => commands.act({ type: 'trade_reject' })}>Reject</button></div>}
        {iAmFrom && <div className="mt-4"><p className="text-sm mb-2">Waiting for {to?.name} to answer...</p><button className="btn w-full" onClick={() => commands.act({ type: 'trade_cancel' })}>Cancel offer</button></div>}
        {!iAmTo && !iAmFrom && <p className="mt-3 text-sm">Waiting for {to?.name}...</p>}
      </div>
    </Modal>
  );
}

export function GlossaryModal() {
  const set = useStore(s => s.set);
  const initial = useStore(s => s.glossaryQuery);
  const [q, setQ] = useState(initial);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? GLOSSARY.filter(g => (g.term + ' ' + g.definition).toLowerCase().includes(t)) : GLOSSARY;
  }, [q]);
  return (
    <Modal title="Glossary" onClose={() => set({ modal: null, glossaryQuery: '' })} wide>
      <input className="input" autoFocus placeholder="Search terms..." value={q} onChange={e => setQ(e.target.value)} aria-label="Search glossary" />
      <ul className="mt-3 flex flex-col gap-3" data-testid="glossary-list">
        {list.map(g => (
          <li key={g.id} className="border-l-4 border-[color:var(--red)] pl-3">
            <h3 className="font-poster text-xl">{g.term}</h3>
            <p className="text-sm">{g.definition}</p>
            <p className="text-sm opacity-70"><b>Example.</b> {g.example}</p>
          </li>
        ))}
        {!list.length && <li>No match.</li>}
      </ul>
    </Modal>
  );
}

export function HelpModal() {
  const set = useStore(s => s.set);
  return (
    <Modal title="How to play" onClose={() => set({ modal: null })}>
      <ol className="list-decimal pl-5 flex flex-col gap-2 text-sm">
        <li>Roll the dice and move clockwise. Passing GO pays 200 cr.</li>
        <li>Buy free spaces, or auction them. Owners collect rent; owning a full group doubles base rent and lets you develop it.</li>
        <li>Develop evenly across a group. Each level raises rent but also changes your technology, labor, social and sustainability indices.</li>
        <li>Objective and Policy spaces draw cards that explain real economic forces.</li>
        <li>If you cannot pay, sell development, mortgage spaces, trade, or declare bankruptcy.</li>
        <li>Capitalist Competition: be the last one standing. Sustainable Development: best balanced score after 30 rounds.</li>
        <li>Click any space for its rent table, its c, v, s indicators and what it teaches.</li>
      </ol>
    </Modal>
  );
}

export function ResultModal({ view }: { view: GameView }) {
  const { game } = view;
  const res = game.result;
  const set = useStore(s => s.set);
  const asked = useRef(false);
  const chat = useStore(s => s.chat);
  useEffect(() => {
    if (res && !asked.current) { asked.current = true; void commands.ask('advisor', 'Give a short closing review of how the game went and what I should learn from it.'); }
  }, [res]);
  if (!res) return null;
  const review = [...chat].reverse().find(m => m.role === 'ai' && m.source);
  const winner = game.players.find(p => p.id === res.winnerId);
  return (
    <Modal title={winner ? `${winner.name} wins` : 'Game over'} wide label="Final results">
      <div data-testid="result">
        <p className="text-sm font-semibold">{res.mode === 'sustainable' ? 'Sustainable Development' : 'Capitalist Competition'} - {res.reason === 'last_standing' ? 'last player standing' : 'round limit reached'} after {res.round} rounds.</p>
        <ol className="mt-3 flex flex-col gap-3">
          {res.standings.map(s => {
            const p = game.players.find(x => x.id === s.playerId)!;
            const i = game.players.indexOf(p);
            const bars: [string, number, string][] = [['Wealth', s.scores.financial, '#c9962b'], ['Social', s.scores.social, '#d9b21f'], ['Technology', s.scores.technology, '#3aa6c9'], ['Sustainability', s.scores.sustainability, '#2f9d6b']];
            return (
              <li key={s.playerId} className="border-2 border-[color:var(--ink)] p-3" style={{ borderLeftWidth: 8, borderLeftColor: PLAYER_COLORS[i % 4] }}>
                <div className="flex items-center gap-3">
                  <span className="font-poster text-3xl w-8">{s.rank}</span>
                  <Avatar idx={p.avatar} size={36} />
                  <div className="flex-1 min-w-0"><div className="font-poster text-xl truncate">{p.name}{s.bankrupt ? ' (bankrupt)' : ''}</div><div className="text-sm">Net worth {fmt(s.netWorth)}</div></div>
                  <div className="text-right"><div className="font-poster text-2xl">{s.scores.total.toFixed(1)}</div><div className="text-[10px] uppercase tracking-widest">score</div></div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
                  {bars.map(([l, v, c]) => (
                    <div key={l} className="text-xs"><div className="flex justify-between"><span>{l}</span><span>{v.toFixed(0)}</span></div><div className="h-2 bg-[color:var(--ink)]/15"><div className="h-full" style={{ width: `${Math.min(100, v)}%`, background: c }} /></div></div>
                  ))}
                </div>
              </li>
            );
          })}
        </ol>
        <h3 className="h-label !text-[color:var(--ink)] mt-5">Concepts you met</h3>
        <ul className="mt-1 grid sm:grid-cols-2 gap-2">
          {res.conceptIds.map(id => GLOSSARY_MAP[id]).filter(Boolean).map(g => (
            <li key={g.id} className="text-sm bg-[color:var(--ink)]/8 border border-[color:var(--ink)]/20 p-2"><b>{g.term}.</b> {g.definition}</li>
          ))}
        </ul>
        {review && <div className="mt-4 p-3 bg-[color:var(--ink)] text-[color:var(--paper)] text-sm whitespace-pre-wrap"><div className="h-label mb-1">Coach review {review.source === 'claude' ? '(Claude)' : '(offline)'}</div>{review.text}</div>}
        <div className="flex gap-2 mt-5">
          <button className="btn flex-1" onClick={() => set({ modal: null })}>View board</button>
          <button className="btn btn-red flex-1" onClick={() => commands.leave()}>Back to start</button>
        </div>
      </div>
    </Modal>
  );
}

export const moneyOf = (game: GameView['game'], pid: string) => financials(game as unknown as GameState, pid);
