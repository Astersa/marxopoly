import { useState } from 'react';
import { SPACES } from '../../shared/board';
import { JAIL_FINE } from '../../shared/board';
import { useCountdown, fmt, type GameView } from '../hooks';
import { commands, useStore } from '../store';

export function ActionBar({ view }: { view: GameView }) {
  const { game, me, actor, isActor, has, locked } = view;
  const countdown = useCountdown(game.deadline);
  const [confirmBk, setConfirmBk] = useState(false);
  const act = commands.act;
  const debt = game.debts[0];
  const pend = game.pendingPurchase;
  const sp = pend ? SPACES[pend.spaceId] : null;

  let status = '';
  if (game.phase === 'finished') status = 'The game is over.';
  else if (locked) status = 'Resolving moves...';
  else if (isActor) {
    status = ({
      roll: me?.inJail ? 'You are in the Labor Strike. Pay, use a card, or roll for doubles.' : 'Your turn. Roll the dice.',
      buy: sp ? `Buy ${sp.name} for ${fmt(sp.price!)}?` : '',
      auction: 'Auction: place a bid or pass.',
      debt: debt ? `You owe ${fmt(debt.amount)} (${debt.reason}). Raise cash, then pay.` : '',
      post_roll: 'Manage your assets or end your turn.',
      finished: '',
    } as Record<string, string>)[game.phase];
    if (game.trade) status = 'Answer the trade offer.';
  } else status = `Waiting for ${actor?.name ?? 'another player'}...`;

  return (
    <div className="panel p-3 md:p-4 flex flex-wrap items-center gap-3" data-testid="action-bar">
      <div className="min-w-0 flex-1 basis-48">
        <div className="h-label">{isActor ? 'Your move' : 'Waiting'}</div>
        <p className="font-semibold leading-snug" data-testid="status">{status}</p>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        {has('roll') && <button className="btn btn-red pulse text-xl px-6" data-testid="roll" onClick={() => act({ type: 'roll' })}>Roll dice</button>}
        {has('jail_pay') && <button className="btn" onClick={() => act({ type: 'jail_pay' })}>Pay {JAIL_FINE} cr</button>}
        {has('jail_card') && <button className="btn" onClick={() => act({ type: 'jail_card' })}>Use card</button>}
        {has('buy') && <button className="btn btn-red pulse" data-testid="buy" onClick={() => act({ type: 'buy' })}>Buy {sp ? fmt(sp.price!) : ''}</button>}
        {has('decline') && <button className="btn btn-dark" data-testid="decline" onClick={() => act({ type: 'decline' })}>{game.settings.auctions ? 'Auction' : 'Pass'}</button>}
        {has('pay_debt') && <button className="btn btn-red" onClick={() => act({ type: 'pay_debt' })}>Pay {debt ? fmt(debt.amount) : ''}</button>}
        {has('declare_bankruptcy') && !confirmBk && <button className="btn btn-dark" onClick={() => setConfirmBk(true)}>Declare bankruptcy</button>}
        {has('declare_bankruptcy') && confirmBk && (
          <>
            <button className="btn btn-red" onClick={() => { setConfirmBk(false); void act({ type: 'declare_bankruptcy' }); }}>Confirm: I am bankrupt</button>
            <button className="btn btn-dark btn-sm" onClick={() => setConfirmBk(false)}>Cancel</button>
          </>
        )}
        {has('end_turn') && <button className="btn" data-testid="end-turn" onClick={() => act({ type: 'end_turn' })}>End turn</button>}
        {view.canTrade && <button className="btn btn-dark" onClick={() => useStore.getState().set({ modal: 'trade' })}>Trade</button>}
        {countdown != null && game.phase !== 'finished' && (
          <span className={`font-poster text-2xl tabular-nums ${countdown <= 10 ? 'text-[color:var(--red)]' : 'text-[color:var(--brass)]'}`} aria-label={`${countdown} seconds left`} title="Time left before auto-play">{countdown}s</span>
        )}
      </div>
    </div>
  );
}
