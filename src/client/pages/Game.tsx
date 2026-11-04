import { useEffect, useRef, useState } from 'react';
import { ActionBar } from '../components/ActionBar';
import { AuctionModal, CardModal, GlossaryModal, HelpModal, ResultModal, TradeComposer, TradePrompt } from '../components/Modals';
import { AdvisorPanel, ActionPanel, LogPanel, PropertyPanel } from '../components/Panels';
import { PlayerList, PlayerStrip } from '../components/PlayerList';
import { boardRef, type BoardApi } from '../boardRef';
import { GfxSwitch } from '../components/GfxSwitch';
import { localizedSpace, t as tr } from '../../shared/i18n';
import { LangSwitch } from '../components/LangSwitch';
import { useGameView } from '../hooks';
import { useL } from '../i18n';
import { BoardGame } from '../phaser/BoardGame';
import { commands, useStore, type Tab } from '../store';

function BoardHost() {
  const { t } = useL();
  const ref = useRef<HTMLDivElement>(null);
  const selected = useStore(s => s.selectedSpace);
  const gfx = useStore(s => s.gfx);
  const fallback = useStore(s => s.gfxFallback);
  const frac = useStore(s => s.loadFrac);
  const mode = fallback ? '2d' : gfx;
  const game = useStore(s => s.game);
  const lang = useStore(s => s.lang);
  const focusId = selected ?? (game ? game.players.find(p => p.id === game.actorId)?.position ?? null : null);
  const focusName = focusId != null ? localizedSpace(lang, focusId).name : '';
  useEffect(() => {
    let board: BoardApi | null = null;
    let cancelled = false;
    const attach = (b: BoardApi) => {
      board = b;
      boardRef.current = b;
      b.onSpaceClick(id => useStore.getState().set({ selectedSpace: id, tab: 'property' }));
      const g = useStore.getState().game;
      if (g) b.sync(g);
      b.setSelected(useStore.getState().selectedSpace);
      b.setLang(useStore.getState().lang);
    };
    const start2d = async () => {
      const b = await BoardGame.create(ref.current!);
      if (cancelled) { b.destroy(); return; }
      attach(b);
    };
    const start3d = async () => {
      try {
        useStore.setState({ loadFrac: 0 });
        const mod = await import('../three/Board3D');
        const b = await mod.Board3D.create(ref.current!, { quality: mode === '3d-low' ? 'low' : 'high', lang: useStore.getState().lang, onProgress: f => useStore.setState({ loadFrac: f }) });
        if (cancelled) { b.destroy(); return; }
        b.onContextLost(() => { useStore.setState({ gfxFallback: true }); useStore.getState().toast('info', tr(useStore.getState().lang, 'gfx.fallback')); });
        attach(b);
        useStore.setState({ loadFrac: null });
      } catch (e) {
        console.warn('3D board unavailable, using 2D', e);
        useStore.setState({ loadFrac: null });
        if (!cancelled) { useStore.setState({ gfxFallback: true }); useStore.getState().toast('info', tr(useStore.getState().lang, 'gfx.fallback')); }
      }
    };
    void (mode === '2d' ? start2d() : start3d());
    return () => { cancelled = true; boardRef.current = null; board?.destroy(); useStore.setState({ loadFrac: null }); };
  }, [mode]);
  useEffect(() => { boardRef.current?.setSelected(selected); }, [selected]);
  return (
    <div className="relative w-full h-full bg-[color:var(--coal)]" data-testid="board-wrap" data-gfx={mode}>
      <div ref={ref} data-testid="board" data-gfx={mode} className="w-full h-full" />
      {frac != null && (
        <div className="absolute inset-0 grid place-items-center bg-[color:var(--coal)]" data-testid="board-loading" role="status">
          <div className="w-64 max-w-[80%] text-center">
            <div className="font-poster text-2xl tracking-widest">{t('gfx.loading')}</div>
            <div className="mt-3 h-3 border-2 border-[color:var(--paper)]"><div className="h-full bg-[color:var(--red)] transition-all" style={{ width: `${Math.round(frac * 100)}%` }} /></div>
            <div className="mt-1 font-poster text-xl text-[color:var(--brass)]">{Math.round(frac * 100)}%</div>
          </div>
        </div>
      )}
      {mode !== '2d' && frac == null && focusId != null && (
        <div data-testid="board-caption" className="absolute left-2 bottom-2 max-w-[78%] bg-[color:var(--paper)] text-[color:var(--ink)] border-2 border-[color:var(--ink)] px-2.5 py-1 font-poster text-sm md:text-base tracking-wide shadow-[3px_3px_0_var(--red)]">{focusName}</div>
      )}
      {mode !== '2d' && frac == null && (
        <button type="button" data-testid="rotate-view" aria-label={t('gfx.rotate')} title={t('gfx.rotate')} onClick={() => boardRef.current?.rotateView?.()}
          className="absolute top-2 right-2 btn btn-sm !min-h-[40px] !px-3 text-xl leading-none">&#x21BB;</button>
      )}
    </div>
  );
}

const TABS: { id: Tab; mobileOnly?: boolean }[] = [
  { id: 'players', mobileOnly: true },
  { id: 'action' },
  { id: 'property' },
  { id: 'advisor' },
  { id: 'log' },
];

export default function Game() {
  const view = useGameView();
  const three = useStore(s => s.gfx !== '2d' && !s.gfxFallback);
  const { t } = useL();
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
  const wide3 = wide && three;
  const boardW = 'min(100%, calc((100vh - 112px) * 1.25))';

  return (
    <div className="min-h-screen lg:h-screen flex flex-col">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 md:px-5 py-2 border-b-2 border-[color:var(--line)] bg-[color:var(--coal)]">
        <span className="font-poster text-2xl tracking-wide">MARX<span className="text-[color:var(--red)]">OPOLY</span></span>
        <span className="tag whitespace-nowrap" data-testid="round-tag">{t('game.round', { n: game.round })}</span>
        <span className="tag hidden sm:inline-block !bg-[color:var(--brass)]">{t(`mode.${game.settings.mode}` as const)}</span>
        <span className="hidden md:inline text-sm text-[color:var(--muted)]">{t('game.room')} <b className="text-[color:var(--paper)] tracking-widest">{room?.code}</b></span>
        <div className="flex-1" />
        <GfxSwitch />
        <LangSwitch />
        <button className="btn btn-sm" onClick={() => set({ modal: 'glossary', glossaryQuery: '' })}>{t('game.glossary')}</button>
        <button className="btn btn-sm btn-dark" onClick={() => { if (game.phase === 'finished' || window.confirm(t('game.leave_confirm'))) void commands.leave(); }}>{t('game.leave')}</button>
      </header>

      <main className={`flex-1 min-h-0 min-w-0 grid gap-3 p-3 grid-cols-[minmax(0,1fr)] ${wide3 ? 'lg:grid-cols-[minmax(0,1fr)_345px]' : 'lg:grid-cols-[270px_minmax(0,1fr)_370px]'} lg:overflow-hidden`}>
        {wide && !three && <aside className="scroll-y lg:max-h-full"><PlayerList view={view} /></aside>}

        <section className="min-w-0 flex flex-col gap-3 lg:overflow-y-auto lg:items-center scroll-y">
          <div className={`w-full shrink-0 overflow-hidden lg:self-center border-4 border-[color:var(--paper)] shadow-[8px_8px_0_var(--red)] ${three ? '' : 'aspect-square lg:aspect-auto'}`} style={three ? (wide ? { width: boardW, aspectRatio: '1.25 / 1' } : { aspectRatio: '1.15 / 1' }) : wide ? { width: 'min(100%, calc(100vh - 215px))', height: 'min(100%, calc(100vh - 215px))', aspectRatio: '1 / 1' } : undefined}>
            <BoardHost />
          </div>
          {narration && !wide3 && <p className="slide-in w-full bg-[color:var(--paper)] text-[color:var(--ink)] px-4 py-2 font-semibold border-l-8 border-[color:var(--red)]" data-testid="narration">{narration}</p>}
          {!wide3 && <div className="w-full" style={wide ? { maxWidth: 'min(100%, calc(100vh - 215px))' } : undefined}><ActionBar view={view} /></div>}
        </section>

        <div className="flex flex-col gap-3 min-h-0 lg:overflow-hidden">
        {wide3 && narration && <p className="slide-in w-full bg-[color:var(--paper)] text-[color:var(--ink)] px-3 py-2 text-sm font-semibold border-l-8 border-[color:var(--red)]" data-testid="narration">{narration}</p>}
        {wide3 && <ActionBar view={view} />}
        {wide3 && <PlayerStrip view={view} />}
        <aside className="panel flex flex-col min-h-[420px] flex-1 lg:min-h-0 lg:overflow-hidden">
          <div role="tablist" className="flex overflow-x-auto border-b-2 border-[color:var(--line)] shrink-0">
            {tabs.map(tb => <button key={tb.id} role="tab" aria-selected={tab === tb.id} className="tab" onClick={() => set({ tab: tb.id })}>{t(`tab.${tb.id}` as const)}</button>)}
          </div>
          <div className="p-3 flex-1 min-h-0 scroll-y" role="tabpanel">
            {tab === 'players' && !wide && <PlayerList view={view} />}
            {tab === 'action' && <ActionPanel view={view} />}
            {tab === 'property' && <PropertyPanel view={view} />}
            {tab === 'advisor' && <AdvisorPanel />}
            {tab === 'log' && <LogPanel view={view} />}
          </div>
        </aside>
        </div>
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
