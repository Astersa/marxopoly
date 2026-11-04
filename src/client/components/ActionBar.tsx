import { useState } from 'react';
import { JAIL_FINE } from '../../shared/board';
import { useCountdown, type GameView } from '../hooks';
import { useL } from '../i18n';
import { commands, useStore } from '../store';

export function ActionBar({ view }: { view: GameView }) {
  const { t, fmt, msg } = useL();
  const { game, me, actor, isActor, has, locked } = view;
  const countdown = useCountdown(game.deadline);
  const [confirmBk, setConfirmBk] = useState(false);
  const act = commands.act;
  const debt = game.debts[0];
  const pend = game.pendingPurchase;
  const price = pend ? fmt(priceOf(pend.spaceId)) : '';

  let status = '';
  if (game.phase === 'finished') status = t('status.finished');
  else if (locked) status = t('status.resolving');
  else if (isActor) {
    if (game.trade) status = t('status.trade');
    else if (game.phase === 'roll') status = me?.inJail ? t('status.roll_jail') : t('status.roll');
    else if (game.phase === 'buy' && pend) status = t('status.buy', { space: pend!.spaceId, price });
    else if (game.phase === 'auction') status = t('status.auction');
    else if (game.phase === 'debt' && debt) status = t('status.debt', { amount: fmt(debt.amount), reason: msg(debt.reason) });
    else if (game.phase === 'post_roll') status = t('status.post_roll');
  } else status = t('status.waiting_for', { name: actor?.name ?? t('status.waiting_other') });

  return (
    <div className="panel p-3 md:p-4 flex flex-wrap items-center gap-3" data-testid="action-bar">
      <div className="min-w-0 flex-1 basis-48">
        <div className="h-label">{isActor ? t('bar.your_move') : t('bar.waiting')}</div>
        <p className="font-semibold leading-snug" data-testid="status">{status}</p>
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        {has('roll') && <button className="btn btn-red pulse text-xl px-6" data-testid="roll" onClick={() => act({ type: 'roll' })}>{t('btn.roll')}</button>}
        {has('jail_pay') && <button className="btn" onClick={() => act({ type: 'jail_pay' })}>{t('btn.pay_jail', { amount: JAIL_FINE })}</button>}
        {has('jail_card') && <button className="btn" onClick={() => act({ type: 'jail_card' })}>{t('btn.use_card')}</button>}
        {has('buy') && <button className="btn btn-red pulse" data-testid="buy" onClick={() => act({ type: 'buy' })}>{t('btn.buy', { price })}</button>}
        {has('decline') && <button className="btn btn-dark" data-testid="decline" onClick={() => act({ type: 'decline' })}>{game.settings.auctions ? t('btn.auction') : t('btn.pass')}</button>}
        {has('pay_debt') && <button className="btn btn-red" onClick={() => act({ type: 'pay_debt' })}>{t('btn.pay_debt', { amount: debt ? fmt(debt.amount) : '' })}</button>}
        {has('declare_bankruptcy') && !confirmBk && <button className="btn btn-dark" onClick={() => setConfirmBk(true)}>{t('btn.bankrupt')}</button>}
        {has('declare_bankruptcy') && confirmBk && (
          <>
            <button className="btn btn-red" onClick={() => { setConfirmBk(false); void act({ type: 'declare_bankruptcy' }); }}>{t('btn.bankrupt_confirm')}</button>
            <button className="btn btn-dark btn-sm" onClick={() => setConfirmBk(false)}>{t('btn.cancel')}</button>
          </>
        )}
        {has('end_turn') && <button className="btn" data-testid="end-turn" onClick={() => act({ type: 'end_turn' })}>{t('btn.end_turn')}</button>}
        {view.canTrade && <button className="btn btn-dark" data-testid="trade-btn" onClick={() => useStore.getState().set({ modal: 'trade' })}>{t('btn.trade')}</button>}
        {countdown != null && game.phase !== 'finished' && (
          <span className={`font-poster text-2xl tabular-nums ${countdown <= 10 ? 'text-[color:var(--red)]' : 'text-[color:var(--brass)]'}`} aria-label={t('bar.seconds_left', { n: countdown })} title={t('bar.timer_title')}>{countdown}s</span>
        )}
      </div>
    </div>
  );
}

import { SPACES } from '../../shared/board';
function priceOf(id: number) { return SPACES[id].price ?? 0; }
