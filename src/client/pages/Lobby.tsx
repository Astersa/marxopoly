import { useState } from 'react';
import { Avatar, PLAYER_COLORS } from '../avatars';
import { commands, useStore } from '../store';

export function Lobby() {
  const { room, session, conn } = useStore();
  const [copied, setCopied] = useState(false);
  const [editName, setEditName] = useState('');
  if (!room || !session) return null;
  const me = room.seats.find(s => s.playerId === session.playerId);
  const isHost = room.hostId === session.playerId;
  const empty = Array.from({ length: Math.max(0, room.maxSeats - room.seats.length) });
  const humansOnline = room.seats.filter(s => !s.isBot && s.connected);
  const unready = humansOnline.filter(s => !s.ready && !s.isHost);
  const problem = humansOnline.length < 2 ? 'Waiting for at least 2 human players.' : unready.length ? `Waiting for ${unready.map(s => s.name).join(', ')} to get ready.` : '';
  const set = (patch: object) => void commands.call('room:update-settings', patch);

  const copy = async () => {
    try { await navigator.clipboard.writeText(room.code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard may be blocked */ }
  };

  return (
    <main className="min-h-screen px-4 py-6 md:py-10 flex justify-center">
      <div className="w-full max-w-5xl">
        <header className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <div className="h-label">Room code</div>
            <div className="flex items-center gap-3">
              <span data-testid="room-code" className="font-poster text-6xl md:text-7xl leading-none tracking-[0.18em] text-[color:var(--paper)]">{room.code}</span>
              <button className="btn btn-sm" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
            </div>
            <p className="text-[color:var(--muted)] mt-1">Share this code. Up to {room.maxSeats} players, bots fill empty seats.</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`tag ${conn === 'online' ? '' : '!bg-[color:var(--red)] !text-[color:var(--paper)]'}`}>{conn === 'online' ? 'Connected' : 'Reconnecting'}</span>
            <button className="btn btn-dark btn-sm" onClick={() => commands.leave()}>Leave</button>
          </div>
        </header>

        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-6">
          <section aria-label="Seats" className="grid sm:grid-cols-2 gap-4">
            {room.seats.map((s, i) => (
              <article key={s.playerId} className="panel p-4 flex items-center gap-3" style={{ borderLeftColor: PLAYER_COLORS[i % 4] }} data-testid="seat">
                <Avatar idx={s.avatar} size={56} color={PLAYER_COLORS[i % 4]} />
                <div className="min-w-0 flex-1">
                  <div className="font-poster text-2xl leading-tight truncate">{s.name}</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {s.isHost && <span className="tag !bg-[color:var(--brass)]">Host</span>}
                    {s.isBot && <span className="tag">Bot</span>}
                    {!s.isBot && <span className={`tag ${s.connected ? '' : '!bg-[color:var(--red)] !text-[color:var(--paper)]'}`}>{s.connected ? 'Online' : 'Offline'}</span>}
                    <span className={`tag ${s.ready ? '!bg-[#6fbf73]' : '!bg-[color:var(--coal3)] !text-[color:var(--muted)]'}`}>{s.ready ? 'Ready' : 'Not ready'}</span>
                    {s.playerId === session.playerId && <span className="tag !bg-[color:var(--red)] !text-[color:var(--paper)]">You</span>}
                  </div>
                </div>
                {isHost && s.playerId !== session.playerId && (
                  <button className="btn btn-sm btn-dark" aria-label={`Remove ${s.name}`} onClick={() => commands.call('room:kick', { playerId: s.playerId })}>X</button>
                )}
              </article>
            ))}
            {empty.map((_, i) => (
              <article key={'e' + i} className="p-4 border-2 border-dashed border-[color:var(--line)] flex items-center justify-between gap-3 min-h-[88px]">
                <span className="font-poster text-xl text-[color:var(--muted)]">EMPTY SEAT</span>
                {isHost && <button className="btn btn-sm" onClick={() => commands.call('room:add-bot')}>Add bot</button>}
              </article>
            ))}
          </section>

          <aside className="panel p-5 flex flex-col gap-4">
            <h2 className="font-poster text-2xl">GAME SETTINGS</h2>
            <div>
              <div className="h-label">Mode</div>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {(['capitalist', 'sustainable'] as const).map(m => (
                  <button key={m} disabled={!isHost} aria-pressed={room.settings.mode === m} onClick={() => set({ mode: m })}
                    className={`btn btn-sm text-left leading-tight ${room.settings.mode === m ? 'btn-red' : 'btn-dark'}`}>
                    {m === 'capitalist' ? 'Capitalist Competition' : 'Sustainable Development'}
                  </button>
                ))}
              </div>
              <p className="text-sm text-[color:var(--muted)] mt-2">
                {room.settings.mode === 'capitalist' ? 'Last player standing wins. Optional round limit decides by net worth.' : '30 rounds. Score = 35% wealth, 25% social, 20% technology, 20% sustainability.'}
              </p>
            </div>
            {room.settings.mode === 'capitalist' && (
              <div>
                <div className="h-label">Round limit</div>
                <div className="flex gap-2 mt-1">
                  {([0, 40, 60] as const).map(n => (
                    <button key={n} disabled={!isHost} aria-pressed={room.settings.roundLimit === n} onClick={() => set({ roundLimit: n })}
                      className={`btn btn-sm flex-1 ${room.settings.roundLimit === n ? 'btn-red' : 'btn-dark'}`}>{n === 0 ? 'None' : n}</button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <div className="h-label">Turn timer</div>
              <div className="flex gap-2 mt-1">
                {[0, 60, 90, 120].map(n => (
                  <button key={n} disabled={!isHost} aria-pressed={room.settings.turnTimer === n} onClick={() => set({ turnTimer: n })}
                    className={`btn btn-sm flex-1 ${room.settings.turnTimer === n ? 'btn-red' : 'btn-dark'}`}>{n === 0 ? 'Off' : n + 's'}</button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-3 font-semibold">
              <input type="checkbox" className="w-5 h-5 accent-[color:var(--red)]" disabled={!isHost} checked={room.settings.auctions} onChange={e => set({ auctions: e.target.checked })} />
              Auctions when a space is declined
            </label>

            <div className="border-t-2 border-[color:var(--line)] pt-4 flex flex-col gap-2">
              {!isHost && me && (
                <button className={`btn w-full ${me.ready ? 'btn-dark' : 'btn-red'}`} onClick={() => commands.call('room:ready', { ready: !me.ready })}>{me.ready ? 'Not ready' : "I'm ready"}</button>
              )}
              {isHost && (
                <>
                  <button className="btn btn-red w-full text-xl pulse" data-testid="start" disabled={!!problem} onClick={() => commands.call('room:start')}>Start game</button>
                  {problem && <p className="text-sm text-[color:var(--brass)]" role="status">{problem}</p>}
                </>
              )}
              {!isHost && <p className="text-sm text-[color:var(--muted)]">The host starts the game.</p>}
              <div className="flex gap-2 items-center">
                <input className="input" aria-label="Change name" placeholder="Change name" maxLength={16} value={editName} onChange={e => setEditName(e.target.value)} />
                <button className="btn btn-sm" disabled={!editName.trim()} onClick={async () => { if (me && (await commands.call('room:update-profile', { name: editName.trim(), avatar: me.avatar }))) setEditName(''); }}>Save</button>
              </div>
              <p className="text-xs text-[color:var(--muted)]">Assistant: {room.aiProvider === 'claude' ? 'Claude' : 'built-in offline guide'}</p>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
