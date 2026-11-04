import { useState } from 'react';
import { Avatar, PLAYER_COLORS } from '../avatars';
import { LangSwitch } from '../components/LangSwitch';
import { useL } from '../i18n';
import { commands, useStore } from '../store';

export function Lobby() {
  const { t } = useL();
  const { room, session, conn } = useStore();
  const [copied, setCopied] = useState(false);
  const [editName, setEditName] = useState('');
  if (!room || !session) return null;
  const me = room.seats.find(s => s.playerId === session.playerId);
  const isHost = room.hostId === session.playerId;
  const empty = Array.from({ length: Math.max(0, room.maxSeats - room.seats.length) });
  const humansOnline = room.seats.filter(s => !s.isBot && s.connected);
  const unready = humansOnline.filter(s => !s.ready && !s.isHost);
  const problem = humansOnline.length < 2 ? t('lobby.need_players') : unready.length ? t('lobby.wait_ready', { names: unready.map(s => s.name).join(', ') }) : '';
  const set = (patch: object) => void commands.call('room:update-settings', patch);

  const copy = async () => {
    try { await navigator.clipboard.writeText(room.code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard may be blocked */ }
  };

  return (
    <main className="min-h-screen px-4 py-6 md:py-10 flex justify-center">
      <div className="w-full max-w-5xl">
        <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <div className="h-label">{t('lobby.room_code')}</div>
            <div className="flex items-center gap-3">
              <span data-testid="room-code" className="font-poster text-6xl md:text-7xl leading-none tracking-[0.18em] text-[color:var(--paper)]">{room.code}</span>
              <button className="btn btn-sm" onClick={copy}>{copied ? t('lobby.copied') : t('lobby.copy')}</button>
            </div>
            <p className="text-[color:var(--muted)] mt-1">{t('lobby.share', { n: room.maxSeats })}</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <LangSwitch />
            <span className={`tag ${conn === 'online' ? '' : '!bg-[color:var(--red)] !text-[color:var(--paper)]'}`}>{conn === 'online' ? t('lobby.connected') : t('lobby.reconnecting')}</span>
            <button className="btn btn-dark btn-sm" onClick={() => commands.leave()}>{t('lobby.leave')}</button>
          </div>
        </header>

        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
          <section aria-label={t('lobby.seats')} className="grid sm:grid-cols-2 gap-4">
            {room.seats.map((s, i) => (
              <article key={s.playerId} className="panel p-4 flex items-center gap-3" style={{ borderLeftColor: PLAYER_COLORS[i % 4] }} data-testid="seat">
                <Avatar idx={s.avatar} size={56} color={PLAYER_COLORS[i % 4]} />
                <div className="min-w-0 flex-1">
                  <div className="font-poster text-2xl leading-tight truncate">{s.name}</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {s.isHost && <span className="tag !bg-[color:var(--brass)]">{t('lobby.host')}</span>}
                    {s.isBot && <span className="tag">{t('lobby.bot')}</span>}
                    {!s.isBot && <span className={`tag ${s.connected ? '' : '!bg-[color:var(--red)] !text-[color:var(--paper)]'}`}>{s.connected ? t('lobby.online') : t('lobby.offline')}</span>}
                    <span className={`tag ${s.ready ? '!bg-[#6fbf73]' : '!bg-[color:var(--coal3)] !text-[color:var(--muted)]'}`}>{s.ready ? t('lobby.ready') : t('lobby.not_ready')}</span>
                    {s.playerId === session.playerId && <span className="tag !bg-[color:var(--red)] !text-[color:var(--paper)]">{t('lobby.you')}</span>}
                  </div>
                </div>
                {isHost && s.playerId !== session.playerId && (
                  <button className="btn btn-sm btn-dark" aria-label={t('lobby.remove', { name: s.name })} onClick={() => commands.call('room:kick', { playerId: s.playerId })}>X</button>
                )}
              </article>
            ))}
            {empty.map((_, i) => (
              <article key={'e' + i} className="p-4 border-2 border-dashed border-[color:var(--line)] flex items-center justify-between gap-3 min-h-[88px]">
                <span className="font-poster text-xl text-[color:var(--muted)]">{t('lobby.empty_seat')}</span>
                {isHost && <button className="btn btn-sm" data-testid="add-bot" onClick={() => commands.call('room:add-bot')}>{t('lobby.add_bot')}</button>}
              </article>
            ))}
          </section>

          <aside className="panel p-5 flex flex-col gap-4">
            <h2 className="font-poster text-2xl">{t('lobby.settings')}</h2>
            <div>
              <div className="h-label">{t('lobby.mode')}</div>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {(['capitalist', 'sustainable'] as const).map(m => (
                  <button key={m} disabled={!isHost} aria-pressed={room.settings.mode === m} onClick={() => set({ mode: m })}
                    className={`btn btn-sm text-left leading-tight ${room.settings.mode === m ? 'btn-red' : 'btn-dark'}`}>
                    {t(`mode.${m}` as const)}
                  </button>
                ))}
              </div>
              <p className="text-sm text-[color:var(--muted)] mt-2">{room.settings.mode === 'capitalist' ? t('lobby.mode_cap') : t('lobby.mode_sus')}</p>
            </div>
            {room.settings.mode === 'capitalist' && (
              <div>
                <div className="h-label">{t('lobby.round_limit')}</div>
                <div className="flex gap-2 mt-1">
                  {([0, 40, 60] as const).map(n => (
                    <button key={n} disabled={!isHost} aria-pressed={room.settings.roundLimit === n} onClick={() => set({ roundLimit: n })}
                      className={`btn btn-sm flex-1 ${room.settings.roundLimit === n ? 'btn-red' : 'btn-dark'}`}>{n === 0 ? t('lobby.none') : n}</button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <div className="h-label">{t('lobby.timer')}</div>
              <div className="flex gap-2 mt-1">
                {[0, 60, 90, 120].map(n => (
                  <button key={n} disabled={!isHost} aria-pressed={room.settings.turnTimer === n} onClick={() => set({ turnTimer: n })}
                    className={`btn btn-sm flex-1 ${room.settings.turnTimer === n ? 'btn-red' : 'btn-dark'}`}>{n === 0 ? t('lobby.off') : n + 's'}</button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-3 font-semibold">
              <input type="checkbox" className="w-5 h-5 accent-[color:var(--red)]" disabled={!isHost} checked={room.settings.auctions} onChange={e => set({ auctions: e.target.checked })} />
              {t('lobby.auctions')}
            </label>
            <label className="flex items-center gap-3 font-semibold">
              <input type="checkbox" data-testid="room-public" className="w-5 h-5 accent-[color:var(--red)]" disabled={!isHost} checked={room.settings.isPublic} onChange={e => set({ isPublic: e.target.checked })} />
              <span>{t('lobby.public')}<span className="block text-sm font-normal text-[color:var(--muted)]">{t('lobby.public_hint')}</span></span>
            </label>

            <div className="border-t-2 border-[color:var(--line)] pt-4 flex flex-col gap-2">
              {!isHost && me && (
                <button className={`btn w-full ${me.ready ? 'btn-dark' : 'btn-red'}`} data-testid="ready" onClick={() => commands.call('room:ready', { ready: !me.ready })}>{me.ready ? t('lobby.set_not_ready') : t('lobby.im_ready')}</button>
              )}
              {isHost && (
                <>
                  <button className="btn btn-red w-full text-xl pulse" data-testid="start" disabled={!!problem} onClick={() => commands.call('room:start')}>{t('lobby.start')}</button>
                  {problem && <p className="text-sm text-[color:var(--brass)]" role="status">{problem}</p>}
                </>
              )}
              {!isHost && <p className="text-sm text-[color:var(--muted)]">{t('lobby.host_starts')}</p>}
              <div className="flex gap-2 items-center">
                <input className="input" aria-label={t('lobby.change_name')} placeholder={t('lobby.change_name')} maxLength={16} value={editName} onChange={e => setEditName(e.target.value)} />
                <button className="btn btn-sm" disabled={!editName.trim()} onClick={async () => { if (me && (await commands.call('room:update-profile', { name: editName.trim(), avatar: me.avatar }))) setEditName(''); }}>{t('lobby.save')}</button>
              </div>
              <p className="text-xs text-[color:var(--muted)]">{t('lobby.assistant', { who: room.aiProvider === 'claude' ? t('lobby.ai_claude') : t('lobby.ai_offline') })}</p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
