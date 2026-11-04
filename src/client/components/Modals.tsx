import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { GROUPS, GROUP_SPACES, SPACES } from '../../shared/board';
import { GLOSSARY } from '../../shared/glossary';
import { fold, localizedTerm } from '../../shared/i18n';
import type { GameView } from '../hooks';
import { useL } from '../i18n';
import { Avatar, PLAYER_COLORS } from '../avatars';
import { commands, useStore } from '../store';

export function Modal({ title, onClose, children, wide, label }: { title: string; onClose?: () => void; children: ReactNode; wide?: boolean; label?: string }) {
  const { t } = useL();
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
          {onClose && <button className="btn btn-sm" aria-label={t('modal.close')} onClick={onClose}>{t('modal.close')}</button>}
        </div>
        <div className="px-5 pb-5 pt-3">{children}</div>
      </div>
    </div>
  );
}

export function CardModal() {
  const L = useL();
  const { t } = L;
  const shown = useStore(s => s.cardShown);
  const game = useStore(s => s.game);
  const set = useStore(s => s.set);
  useEffect(() => { if (!shown) return; const timer = setTimeout(() => set({ cardShown: null }), 9000); return () => clearTimeout(timer); }, [shown, set]);
  if (!shown) return null;
  const card = L.card(shown.cardId);
  const who = game?.players.find(p => p.id === shown.playerId)?.name ?? t('ai.player');
  const topic = L.term(card.topic);
  return (
    <Modal title={card.deck === 'objective' ? t('card.objective') : t('card.policy')} onClose={() => set({ cardShown: null })}>
      <div data-testid="card-modal">
        <div className="h-label !text-[color:var(--red)]">{t('card.drew', { name: who })}</div>
        <h3 className="font-poster text-4xl leading-tight">{card.name}</h3>
        <p className="mt-2 font-semibold">{card.description}</p>
        <p className="mt-3 text-sm"><b>{t('card.why')}</b> {card.explanation}</p>
        <p className="mt-2 text-sm"><b>{t('card.example')}</b> {card.example}</p>
        {topic && <button className="mt-3 btn btn-sm" onClick={() => set({ cardShown: null, modal: 'glossary', glossaryQuery: topic.term.split(' (')[0] })}>{t('card.concept', { term: topic.term })}</button>}
      </div>
    </Modal>
  );
}

export function AuctionModal({ view }: { view: GameView }) {
  const { t, fmt, space } = useL();
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
    <Modal title={t('auction.title')} label={t('auction.title')}>
      <div data-testid="auction">
        <h3 className="font-poster text-3xl leading-tight">{space(a.spaceId).name}</h3>
        <p className="font-semibold">{t('auction.list_price', { price: fmt(sp.price!) })}</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="bg-[color:var(--ink)] text-[color:var(--paper)] p-3"><div className="h-label">{t('auction.highest')}</div><div className="font-poster text-3xl">{a.highBidder ? fmt(a.highBid) : t('auction.none')}</div><div className="text-sm opacity-80">{high?.name ?? ''}</div></div>
          <div className="bg-[color:var(--ink)] text-[color:var(--paper)] p-3"><div className="h-label">{t('auction.now')}</div><div className="font-poster text-3xl truncate">{turn?.name}</div><div className="text-sm opacity-80">{t('auction.left', { n: a.order.length })}</div></div>
        </div>
        {isActor ? (
          <div className="mt-4">
            <label className="h-label !text-[color:var(--ink)]" htmlFor="bid">{t('auction.your_bid', { cash: fmt(max) })}</label>
            <div className="flex gap-2 mt-1">
              <input id="bid" type="number" className="input" min={min} max={max} step={10} value={bid} onChange={e => setBid(Number(e.target.value))} />
              <button className="btn btn-sm" onClick={() => setBid(Math.min(max, bid + 10))}>+10</button>
              <button className="btn btn-sm" onClick={() => setBid(Math.min(max, bid + 50))}>+50</button>
            </div>
            <div className="flex gap-2 mt-3">
              <button className="btn btn-red flex-1" data-testid="bid" disabled={!has('auction_bid') || bid < min || bid > max} onClick={() => commands.act({ type: 'auction_bid', amount: bid })}>{t('auction.bid', { amount: fmt(bid) })}</button>
              <button className="btn flex-1" data-testid="auction-pass" onClick={() => commands.act({ type: 'auction_pass' })}>{t('btn.pass')}</button>
            </div>
          </div>
        ) : <p className="mt-4 font-semibold">{t('auction.waiting', { name: turn?.name ?? '' })}</p>}
      </div>
    </Modal>
  );
}

function SpacePicker({ ids, picked, toggle, game }: { ids: number[]; picked: number[]; toggle: (id: number) => void; game: GameView['game'] }) {
  const { t, fmt, space } = useL();
  if (!ids.length) return <p className="text-sm opacity-60">{t('trade.no_spaces')}</p>;
  return (
    <div className="flex flex-col gap-1">
      {ids.map(id => (
        <label key={id} className={`flex items-center gap-2 px-2 py-1.5 border-2 cursor-pointer ${picked.includes(id) ? 'border-[color:var(--red)] bg-[color:var(--red)]/10' : 'border-[color:var(--ink)]/30'}`}>
          <input type="checkbox" className="accent-[color:var(--red)]" checked={picked.includes(id)} onChange={() => toggle(id)} />
          <span className="w-2.5 h-5" style={{ background: SPACES[id].group ? GROUPS[SPACES[id].group!].color : '#777' }} />
          <span className="flex-1 text-sm font-semibold truncate">{space(id).name}</span>
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
  const { t, fmt } = useL();
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
    <Modal title={t('trade.title')} onClose={() => set({ modal: null })} wide>
      <div data-testid="trade-composer">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('trade.partner')}>
          {others.map(p => (
            <button key={p.id} role="radio" aria-checked={to === p.id} className={`btn btn-sm flex items-center gap-2 ${to === p.id ? 'btn-red' : ''}`} onClick={() => { setTo(p.id); setRS([]); setRC(0); }}>
              <Avatar idx={p.avatar} size={22} />{p.name}
            </button>
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-5 mt-4">
          <div>
            <h3 className="h-label !text-[color:var(--ink)]">{t('trade.give')}</h3>
            <label className="text-sm font-semibold">{t('trade.cash_you', { n: fmt(me.cash) })}
              <input type="number" className="input mt-1" min={0} max={me.cash} value={offerCash} onChange={e => setOC(Math.max(0, Math.min(me.cash, Math.floor(Number(e.target.value) || 0))))} />
            </label>
            <div className="mt-2"><SpacePicker ids={tradable(game, me.id)} picked={offerSp} toggle={tog(offerSp, setOS)} game={game} /></div>
          </div>
          <div>
            <h3 className="h-label !text-[color:var(--ink)]">{t('trade.get', { name: partner?.name ?? '' })}</h3>
            <label className="text-sm font-semibold">{t('trade.cash_they', { n: fmt(partner?.cash ?? 0) })}
              <input type="number" className="input mt-1" min={0} max={partner?.cash ?? 0} value={reqCash} onChange={e => setRC(Math.max(0, Math.min(partner?.cash ?? 0, Math.floor(Number(e.target.value) || 0))))} />
            </label>
            <div className="mt-2"><SpacePicker ids={tradable(game, to)} picked={reqSp} toggle={tog(reqSp, setRS)} game={game} /></div>
          </div>
        </div>
        <p className="text-xs mt-3 opacity-70">{t('trade.note')}</p>
        <button className="btn btn-red w-full mt-3" data-testid="trade-send" disabled={empty || !to} onClick={send}>{t('trade.send')}</button>
      </div>
    </Modal>
  );
}

export function TradePrompt({ view }: { view: GameView }) {
  const { t, fmt, space } = useL();
  const { game, me } = view;
  const tr = game.trade;
  if (!tr) return null;
  const from = game.players.find(p => p.id === tr.fromId), to = game.players.find(p => p.id === tr.toId);
  const list = (ids: number[]) => ids.length ? ids.map(id => space(id).name).join(', ') : t('trade.nothing');
  const iAmTo = me?.id === tr.toId, iAmFrom = me?.id === tr.fromId;
  return (
    <Modal title={iAmTo ? t('trade.offer_you') : t('trade.in_progress')} label={t('trade.title')}>
      <div data-testid="trade-prompt">
        <p className="font-semibold">{t('trade.offers', { from: from?.name ?? '', to: to?.name ?? '' })}</p>
        <div className="grid sm:grid-cols-2 gap-3 mt-2">
          <div className="bg-[color:var(--ink)] text-[color:var(--paper)] p-3"><div className="h-label">{t('trade.gives', { name: from?.name ?? '' })}</div><div className="mt-1">{tr.offerCash ? fmt(tr.offerCash) + ' ' + t('trade.and') + ' ' : ''}{list(tr.offerSpaces)}</div></div>
          <div className="bg-[color:var(--ink)] text-[color:var(--paper)] p-3"><div className="h-label">{t('trade.gives', { name: to?.name ?? '' })}</div><div className="mt-1">{tr.requestCash ? fmt(tr.requestCash) + ' ' + t('trade.and') + ' ' : ''}{list(tr.requestSpaces)}</div></div>
        </div>
        {iAmTo && <div className="flex gap-2 mt-4"><button className="btn btn-red flex-1" data-testid="trade-accept" onClick={() => commands.act({ type: 'trade_accept' })}>{t('trade.accept')}</button><button className="btn flex-1" onClick={() => commands.act({ type: 'trade_reject' })}>{t('trade.reject')}</button></div>}
        {iAmFrom && <div className="mt-4"><p className="text-sm mb-2">{t('trade.wait_answer', { name: to?.name ?? '' })}</p><button className="btn w-full" onClick={() => commands.act({ type: 'trade_cancel' })}>{t('trade.cancel')}</button></div>}
        {!iAmTo && !iAmFrom && <p className="mt-3 text-sm">{t('trade.waiting', { name: to?.name ?? '' })}</p>}
      </div>
    </Modal>
  );
}

export function GlossaryModal() {
  const { t, lang } = useL();
  const set = useStore(s => s.set);
  const initial = useStore(s => s.glossaryQuery);
  const [q, setQ] = useState(initial);
  const list = useMemo(() => {
    const needle = fold(q.trim());
    const all = GLOSSARY.map(g => localizedTerm(lang, g.id));
    return needle ? all.filter(g => fold(g.term + ' ' + g.definition).includes(needle)) : all;
  }, [q, lang]);
  return (
    <Modal title={t('gloss.title')} onClose={() => set({ modal: null, glossaryQuery: '' })} wide>
      <input className="input" autoFocus placeholder={t('gloss.search')} value={q} onChange={e => setQ(e.target.value)} aria-label={t('gloss.search')} />
      <ul className="mt-3 flex flex-col gap-3" data-testid="glossary-list">
        {list.map(g => (
          <li key={g.id} className="border-l-4 border-[color:var(--red)] pl-3">
            <h3 className="font-poster text-xl">{g.term}</h3>
            <p className="text-sm">{g.definition}</p>
            <p className="text-sm opacity-70"><b>{t('gloss.example')}</b> {g.example}</p>
          </li>
        ))}
        {!list.length && <li>{t('gloss.nomatch')}</li>}
      </ul>
    </Modal>
  );
}

export function HelpModal() {
  const { t } = useL();
  const set = useStore(s => s.set);
  return (
    <Modal title={t('help.title')} onClose={() => set({ modal: null })}>
      <ol className="list-decimal pl-5 flex flex-col gap-2 text-sm">
        <li>{t('help.1')}</li><li>{t('help.2')}</li><li>{t('help.3')}</li><li>{t('help.4')}</li><li>{t('help.5')}</li><li>{t('help.6')}</li><li>{t('help.7')}</li>
      </ol>
    </Modal>
  );
}

export function ResultModal({ view }: { view: GameView }) {
  const L = useL();
  const { t, fmt } = L;
  const { game } = view;
  const res = game.result;
  const set = useStore(s => s.set);
  const asked = useRef(false);
  const chat = useStore(s => s.chat);
  useEffect(() => {
    if (res && !asked.current) { asked.current = true; void commands.ask('advisor', t('result.review_q')); }
  }, [res, t]);
  if (!res) return null;
  const review = [...chat].reverse().find(m => m.role === 'ai' && m.source);
  const winner = game.players.find(p => p.id === res.winnerId);
  return (
    <Modal title={winner ? t('result.wins', { name: winner.name }) : t('result.over')} wide label={t('result.label')}>
      <div data-testid="result">
        <p className="text-sm font-semibold">{t('result.line', { mode: t(`mode.${res.mode}` as const), reason: res.reason === 'last_standing' ? t('result.last') : t('result.limit'), n: res.round })}</p>
        <ol className="mt-3 flex flex-col gap-3">
          {res.standings.map(s => {
            const p = game.players.find(x => x.id === s.playerId)!;
            const i = game.players.indexOf(p);
            const bars: [string, number, string][] = [[t('result.wealth'), s.scores.financial, '#c9962b'], [t('result.social'), s.scores.social, '#d9b21f'], [t('result.technology'), s.scores.technology, '#3aa6c9'], [t('result.sustainability'), s.scores.sustainability, '#2f9d6b']];
            return (
              <li key={s.playerId} className="border-2 border-[color:var(--ink)] p-3" style={{ borderLeftWidth: 8, borderLeftColor: PLAYER_COLORS[i % 4] }}>
                <div className="flex items-center gap-3">
                  <span className="font-poster text-3xl w-8">{s.rank}</span>
                  <Avatar idx={p.avatar} size={36} />
                  <div className="flex-1 min-w-0"><div className="font-poster text-xl truncate">{p.name}{s.bankrupt ? ' ' + t('result.bankrupt') : ''}</div><div className="text-sm">{t('result.net_worth', { n: fmt(s.netWorth) })}</div></div>
                  <div className="text-right"><div className="font-poster text-2xl">{s.scores.total.toFixed(1)}</div><div className="text-[10px] uppercase tracking-widest">{t('result.score')}</div></div>
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
        <h3 className="h-label !text-[color:var(--ink)] mt-5">{t('result.concepts')}</h3>
        <ul className="mt-1 grid sm:grid-cols-2 gap-2">
          {res.conceptIds.map(id => L.term(id)).filter(Boolean).map(g => (
            <li key={g.id} className="text-sm bg-[color:var(--ink)]/8 border border-[color:var(--ink)]/20 p-2"><b>{g.term}.</b> {g.definition}</li>
          ))}
        </ul>
        {review && <div className="mt-4 p-3 bg-[color:var(--ink)] text-[color:var(--paper)] text-sm whitespace-pre-wrap"><div className="h-label mb-1">{t('result.coach', { who: review.source === 'claude' ? t('chat.src_claude') : t('chat.src_offline') })}</div>{review.text}</div>}
        <div className="flex gap-2 mt-5">
          <button className="btn flex-1" onClick={() => set({ modal: null })}>{t('result.view')}</button>
          <button className="btn btn-red flex-1" onClick={() => commands.leave()}>{t('result.back')}</button>
        </div>
      </div>
    </Modal>
  );
}
