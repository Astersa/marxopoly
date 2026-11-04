import { useState } from 'react';
import { AVATAR_NAMES, Avatar } from '../avatars';
import { sessionStore } from '../socket';
import { commands, useStore } from '../store';

export function Hero() {
  return (
    <svg viewBox="0 0 520 360" className="w-full h-auto" role="img" aria-label="Poster artwork: a gear, a red diagonal and a factory skyline">
      <rect width="520" height="360" fill="#201b15" />
      <polygon points="0,360 0,230 330,0 520,0 520,70 180,360" fill="#d63a1f" />
      <polygon points="0,360 190,360 0,170" fill="#16130f" />
      <polygon points="520,360 330,360 520,170" fill="#efe3c6" opacity="0.9" />
      <g transform="translate(330 170)">
        <circle r="92" fill="#efe3c6" opacity="0.14" />
        {Array.from({ length: 14 }).map((_, i) => <rect key={i} x="-9" y="-112" width="18" height="30" fill="#efe3c6" opacity="0.14" transform={`rotate(${(i * 360) / 14})`} />)}
        <circle r="46" fill="#201b15" stroke="#efe3c6" strokeWidth="5" opacity="0.7" />
      </g>
      <g fill="#16130f"><rect x="40" y="250" width="70" height="80" /><rect x="120" y="215" width="50" height="115" /><rect x="180" y="270" width="90" height="60" /><polygon points="40,250 75,225 75,250" /><rect x="132" y="180" width="14" height="40" /></g>
      <g fill="#efe3c6"><rect x="52" y="268" width="10" height="10" /><rect x="76" y="268" width="10" height="10" /><rect x="132" y="240" width="10" height="10" /><rect x="198" y="286" width="12" height="10" /></g>
      <rect x="0" y="30" width="330" height="48" fill="#16130f" /><text x="22" y="62" fontFamily="Anton, Impact, sans-serif" fontSize="22" fill="#efe3c6" letterSpacing="3">PRODUCE. ACCUMULATE. COMPETE.</text>
    </svg>
  );
}

export function Home() {
  const profile = sessionStore.profile();
  const [name, setName] = useState(profile.name);
  const [avatar, setAvatar] = useState(() => (profile.name ? profile.avatar : Math.floor(Math.random() * 8)));
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const { conn, kickedMsg } = useStore();
  const last = sessionStore.last();
  const ready = name.trim().length > 0 && conn === 'online';

  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };

  return (
    <main className="min-h-screen px-4 py-6 md:py-10 flex items-center justify-center">
      <div className="w-full max-w-5xl grid md:grid-cols-[1.05fr_1fr] gap-6 md:gap-10 items-center">
        <section className="order-2 md:order-1">
          <div className="border-4 border-[color:var(--paper)] shadow-[10px_10px_0_var(--red)] overflow-hidden"><Hero /></div>
          <ul className="mt-6 grid gap-2 text-[color:var(--muted)] text-sm md:text-base">
            <li><b className="text-[color:var(--paper)]">Build capital.</b> Buy workshops, factories and monopolies; collect rent, develop whole groups.</li>
            <li><b className="text-[color:var(--paper)]">Learn as you play.</b> Every space and card explains surplus value, c:v and the rate of profit.</li>
            <li><b className="text-[color:var(--paper)]">2 to 4 players.</b> Private rooms, bots to fill seats, no account needed.</li>
          </ul>
        </section>

        <section className="order-1 md:order-2 panel-paper p-5 md:p-7">
          <h1 className="font-poster text-5xl md:text-6xl leading-none text-[color:var(--ink)]">MARX<span className="text-[color:var(--red)]">OPOLY</span></h1>
          <p className="font-semibold mt-1 text-[color:var(--ink)]/80">The political economy board game.</p>

          {kickedMsg && <p className="mt-3 bg-[color:var(--red)] text-[color:var(--paper)] px-3 py-2 font-semibold">{kickedMsg}</p>}
          {conn !== 'online' && <p className="mt-3 bg-[color:var(--ink)] text-[color:var(--paper)] px-3 py-2 text-sm font-semibold" role="status">{conn === 'connecting' ? 'Connecting to the server...' : 'Server unreachable. Retrying...'}</p>}

          <label className="block mt-5 h-label !text-[color:var(--ink)]" htmlFor="name">Your name</label>
          <input id="name" className="input mt-1" maxLength={16} value={name} onChange={e => setName(e.target.value)} placeholder="Comrade Ada" autoComplete="off" />

          <div className="mt-4 h-label !text-[color:var(--ink)]" id="av">Your emblem</div>
          <div className="mt-1 grid grid-cols-8 gap-1.5" role="radiogroup" aria-labelledby="av">
            {Array.from({ length: 8 }).map((_, i) => (
              <button key={i} type="button" role="radio" aria-checked={avatar === i} aria-label={AVATAR_NAMES[i]} title={AVATAR_NAMES[i]} onClick={() => setAvatar(i)}
                className={`aspect-square grid place-items-center p-0.5 border-2 ${avatar === i ? 'border-[color:var(--red)] bg-[color:var(--ink)]' : 'border-transparent bg-[color:var(--ink)]/10 hover:bg-[color:var(--ink)]/20'}`}>
                <Avatar idx={i} size={36} />
              </button>
            ))}
          </div>

          <button className="btn btn-red w-full mt-5 text-xl" disabled={!ready || busy} onClick={() => run(() => commands.create(name.trim(), avatar))}>Create a room</button>

          <div className="flex items-center gap-3 my-4 text-[color:var(--ink)]/60 font-bold"><span className="flex-1 h-0.5 bg-[color:var(--ink)]/30" />OR<span className="flex-1 h-0.5 bg-[color:var(--ink)]/30" /></div>

          <form className="flex gap-2" onSubmit={e => { e.preventDefault(); if (ready && code.trim()) void run(() => commands.join(code, name.trim(), avatar)); }}>
            <input aria-label="Room code" className="input font-poster tracking-[0.3em] text-center uppercase" maxLength={5} value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="CODE" autoComplete="off" />
            <button className="btn shrink-0" type="submit" disabled={!ready || code.trim().length < 5 || busy}>Join</button>
          </form>

          {last && (
            <button className="btn btn-sm w-full mt-5" disabled={conn !== 'online' || busy} onClick={() => run(() => commands.rejoin())}>Rejoin room {last.code}</button>
          )}
        </section>
      </div>
    </main>
  );
}
