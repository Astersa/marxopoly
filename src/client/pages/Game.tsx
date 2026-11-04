import { useEffect, useRef, useState } from 'react';
import { ActionBar } from '../components/ActionBar';
import { AuctionModal, CardModal, GlossaryModal, HelpModal, ResultModal, TradeComposer, TradePrompt } from '../components/Modals';
import { AdvisorPanel, ActionPanel, LogPanel, PropertyPanel } from '../components/Panels';
import { PlayerList } from '../components/PlayerList';
import { boardRef } from '../boardRef';
import { useGameView } from '../hooks';
import { BoardGame } from '../phaser/BoardGame';
import { commands, useStore, type Tab } from '../store';

function BoardHost() {
  const ref = useRef<HTMLDivElement>(null);
  const selected = useStore(s => s.selectedSpace);
  useEffect(() => {
    let board: BoardGame | null = null;
    let cancelled = false;
    void BoardGame.create(ref.current!).then(b => {
      if (cancelled) { b.destroy(); return; }
      board = b;
      boardRef.current = b;
      b.onSpaceClick(id => useStore.getState().set({ selectedSpace: id, tab: 'property' }));
      const g = useStore.getState().game;
      if (g) b.sync(g);
      b.setSelected(useStore.getState().selectedSpace);
    });
    return () => { cancelled = true; boardRef.current = null; board?.destroy(); };
  }, []);
  useEffect(() => { boardRef.current?.setSelected(selected); }, [selected]);
  return <div ref={ref} data-testid="board" className="w-full h-full bg-[color:var(--coal)]" />;
}

const TABS: { id: Tab; label: string; mobileOnly?: boolean }[] = [
  { id: 'players', label: 'Players', mobileOnly: true },
  { id: 'action', label: 'Action' },
  { id: 'property', label: 'Property' },
  { id: 'advisor', label: 'Advisor' },
  { id: 'log', label: 'Log' },
];

export default function Game() {
  const view = useGameView();
  const { tab, modal, room, narration } = useStore();
  const set = useStore(s => s.set);
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const h = () => setWide(mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);
  useEffect(() => { if (wide && useStore.getState().tab === 'players') set({ tab: 'action' }); }, [wide, set]);
  if (!view) return null;
  const { game } = view;
  const tabs = TABS.filter(t => wide ? !t.mobileOnly : true);

  return (
    <div className="min-h-screen lg:h-screen flex flex-col">
      <header className="flex items-center gap-3 px-3 md:px-5 py-2 border-b-2 border-[color:var(--line)] bg-[color:var(--coal)]">
        <span className="font-poster text-2xl tracking-wide">MARX<span className="text-[color:var(--red)]">OPOLY</span></span>
        <span className="tag" data-testid="round-tag">Round {game.round}</span>
        <span className="tag hidden sm:inline-block !bg-[color:var(--brass)]">{game.settings.mode === 'sustainable' ? 'Sustainable' : 'Capitalist'}</span>
        <span className="hidden md:inline text-sm text-[color:var(--muted)]">Room <b className="text-[color:var(--paper)] tracking-widest">{room?.code}</b></span>
        <div className="flex-1" />
        <button className="btn btn-sm" onClick={() => set({ modal: 'glossary', glossaryQuery: '' })}>Glossary</button>
        <button className="btn btn-sm btn-dark" onClick={() => { if (game.phase === 'finished' || window.confirm('Leave the game? Your seat will be auto-played.')) void commands.leave(); }}>Leave</button>
      </header>

      <main className="flex-1 min-h-0 min-w-0 grid gap-3 p-3 grid-cols-[minmax(0,1fr)] lg:grid-cols-[270px_minmax(0,1fr)_370px] lg:overflow-hidden">
        {wide && <aside className="scroll-y lg:max-h-full"><PlayerList view={view} /></aside>}

        <section className="min-w-0 flex flex-col gap-3 lg:overflow-y-auto lg:items-center scroll-y">
          <div className="w-full aspect-square overflow-hidden lg:aspect-auto lg:self-center border-4 border-[color:var(--paper)] shadow-[8px_8px_0_var(--red)]" style={wide ? { width: 'min(100%, calc(100vh - 215px))', height: 'min(100%, calc(100vh - 215px))', aspectRatio: '1 / 1' } : undefined}>
            <BoardHost />
          </div>
          {narration && <p className="slide-in w-full bg-[color:var(--paper)] text-[color:var(--ink)] px-4 py-2 font-semibold border-l-8 border-[color:var(--red)]" data-testid="narration">{narration}</p>}
          <div className="w-full" style={wide ? { maxWidth: 'min(100%, calc(100vh - 215px))' } : undefined}><ActionBar view={view} /></div>
        </section>

        <aside className="panel flex flex-col min-h-[420px] lg:min-h-0 lg:overflow-hidden">
          <div role="tablist" className="flex overflow-x-auto border-b-2 border-[color:var(--line)] shrink-0">
            {tabs.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} className="tab" onClick={() => set({ tab: t.id })}>{t.label}</button>)}
          </div>
          <div className="p-3 flex-1 min-h-0 scroll-y" role="tabpanel">
            {tab === 'players' && !wide && <PlayerList view={view} />}
            {tab === 'action' && <ActionPanel view={view} />}
            {tab === 'property' && <PropertyPanel view={view} />}
            {tab === 'advisor' && <AdvisorPanel />}
            {tab === 'log' && <LogPanel view={view} />}
          </div>
        </aside>
      </main>

      <CardModal />
      <AuctionModal view={view} />
      <TradePrompt view={view} />
      {modal === 'trade' && !game.trade && <TradeComposer view={view} />}
      {modal === 'glossary' && <GlossaryModal />}
      {modal === 'help' && <HelpModal />}
      {modal === 'result' && game.phase === 'finished' && <ResultModal view={view} />}
    </div>
  );
}
