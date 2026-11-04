import { lazy, Suspense, useEffect } from 'react';
import { Home } from './pages/Home';
import { Lobby } from './pages/Lobby';
import { Toasts } from './components/Toasts';
import { initSocket, useStore } from './store';

const Game = lazy(() => import('./pages/Game'));

export function App() {
  const { session, room, booted, game } = useStore();
  useEffect(() => { initSocket(); }, []);

  let page;
  if (!booted) page = <div className="min-h-screen grid place-items-center font-poster text-3xl tracking-widest text-[color:var(--paper)]">MARXOPOLY<span className="text-[color:var(--red)]">...</span></div>;
  else if (!session || !room) page = <Home />;
  else if (room.status === 'WAITING' || room.status === 'STARTING' || !game) page = <Lobby />;
  else page = <Suspense fallback={<div className="min-h-screen grid place-items-center font-poster text-2xl">LOADING BOARD...</div>}><Game /></Suspense>;
  return <>{page}<Toasts /></>;
}
