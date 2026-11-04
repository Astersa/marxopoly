import { create } from 'zustand';
import type { Action, GameEvent, PublicGameState } from '../shared/types';
import type { AiAnswer, JoinData, RoomPublic } from '../shared/protocol';
import { boardRef } from './boardRef';
import { detectLang, errorText, t as tr, type Lang } from '../shared/i18n';
import { RequestError, request, sessionStore, socket, type StoredSession } from './socket';

export type Gfx = '3d-high' | '3d-low' | '2d';
export type Tab = 'action' | 'property' | 'advisor' | 'log' | 'players';
export interface ChatMsg { id: number; role: 'user' | 'ai'; text: string; source?: 'claude' | 'offline'; kind?: string }
export interface Toast { id: number; kind: 'error' | 'info'; text: string }

interface Store {
  conn: 'connecting' | 'online' | 'offline';
  booted: boolean;
  session: StoredSession | null;
  room: RoomPublic | null;
  game: PublicGameState | null;
  seq: number;
  animating: boolean;
  selectedSpace: number | null;
  tab: Tab;
  cardShown: { cardId: string; playerId: string } | null;
  narration: string | null;
  toasts: Toast[];
  modal: null | 'trade' | 'glossary' | 'result' | 'help';
  glossaryQuery: string;
  chat: ChatMsg[];
  chatBusy: boolean;
  kickedMsg: boolean;
  lang: Lang;
  /** the player's graphics choice */
  gfx: Gfx;
  /** true when 3D could not start (no WebGL, assets failed, context lost) and the 2D board is used instead */
  gfxFallback: boolean;
  /** 0..1 while the 3D board is loading, null otherwise */
  loadFrac: number | null;

  set: (p: Partial<Store>) => void;
  toast: (kind: Toast['kind'], text: string) => void;
  reset: () => void;
}

function initialLang(): Lang {
  let stored: string | null = null;
  try { stored = localStorage.getItem('marx.lang'); } catch { /* storage may be blocked */ }
  return detectLang(stored, typeof navigator === 'undefined' ? undefined : navigator.language);
}

function initialGfx(): Gfx {
  try { const s = localStorage.getItem('marx.gfx'); if (s === '3d-high' || s === '3d-low' || s === '2d') return s; } catch { /* ignore */ }
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const narrow = typeof window !== 'undefined' && window.innerWidth < 760;
  return narrow || (mem != null && mem <= 4) ? '3d-low' : '3d-high';
}

let toastId = 1;
export const useStore = create<Store>((set, get) => ({
  conn: 'connecting', booted: false, session: null, room: null, game: null, seq: 0, animating: false, selectedSpace: null, tab: 'action',
  cardShown: null, narration: null, toasts: [], modal: null, glossaryQuery: '', chat: [], chatBusy: false, kickedMsg: false, lang: initialLang(), gfx: initialGfx(), gfxFallback: false, loadFrac: null,
  set: p => set(p),
  toast: (kind, text) => {
    const id = toastId++;
    set(s => ({ toasts: [...s.toasts.slice(-3), { id, kind, text }] }));
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), kind === 'error' ? 5000 : 3500);
  },
  reset: () => { queue.length = 0; set({ session: null, room: null, game: null, seq: 0, animating: false, selectedSpace: null, cardShown: null, narration: null, modal: null, chat: [], tab: 'action' }); },
}));

// ---------- update queue ----------
interface QItem { state: PublicGameState; events: GameEvent[]; seq: number }
const queue: QItem[] = [];
let running = false;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function pump() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const item = queue.shift()!;
      const fast = queue.length > 2;
      const animated = item.events.some(e => e.type === 'dice' || e.type === 'move');
      if (animated && boardRef.current && !document.hidden) {
        useStore.setState({ animating: true });
        try { await Promise.race([boardRef.current.play(item.events, fast), sleep(fast ? 2500 : 6000)]); } catch { /* animation must never block state */ }
      }
      const card = item.events.find(e => e.type === 'card');
      useStore.setState({
        game: item.state, seq: item.seq, animating: queue.length > 0 && animated ? true : false,
        ...(card && card.type === 'card' ? { cardShown: { cardId: card.cardId, playerId: card.playerId } } : {}),
      });
      boardRef.current?.sync(item.state);
      if (item.state.phase === 'finished' && useStore.getState().modal !== 'result') useStore.setState({ modal: 'result' });
    }
  } finally {
    running = false;
    useStore.setState({ animating: false });
  }
}

export function applySnapshot(state: PublicGameState, seq: number) {
  queue.length = 0;
  useStore.setState({ game: state, seq, animating: false, ...(state.phase === 'finished' ? { modal: 'result' as const } : {}) });
  boardRef.current?.sync(state);
}

// ---------- socket wiring ----------
let wired = false;
export function initSocket() {
  if (wired) return;
  wired = true;
  const st = useStore;

  const tryResume = async () => {
    const saved = sessionStore.load();
    if (!saved) { st.setState({ booted: true }); return; }
    try {
      const data = await request<JoinData>('game:reconnect', { token: saved.token });
      sessionStore.save({ code: data.code, playerId: data.playerId, token: data.token });
      st.setState({ session: { code: data.code, playerId: data.playerId, token: data.token }, room: data.room, booted: true });
    } catch (e) {
      if (e instanceof RequestError && (e.code === 'INVALID_TOKEN' || e.code === 'ROOM_NOT_FOUND')) { sessionStore.clear(); st.getState().reset(); }
      st.setState({ booted: true });
    }
  };

  socket.on('connect', () => { st.setState({ conn: 'online' }); socket.emit('session:set-lang', { lang: st.getState().lang }); void tryResume(); });
  socket.on('disconnect', () => st.setState({ conn: 'offline' }));
  socket.on('connect_error', () => st.setState({ conn: 'offline', booted: true }));
  socket.on('room:updated', (room: RoomPublic) => st.setState({ room }));
  socket.on('room:kicked', () => { sessionStore.clear(); st.getState().reset(); st.setState({ kickedMsg: true }); });
  socket.on('session:replaced', () => { sessionStore.clear(); st.getState().reset(); st.getState().toast('info', tr(st.getState().lang, 'toast.replaced')); });
  socket.on('game:snapshot', (p: { state: PublicGameState; seq: number }) => applySnapshot(p.state, p.seq));
  socket.on('game:state-updated', (p: { state: PublicGameState; events: GameEvent[]; seq: number }) => {
    if (p.seq <= useStore.getState().seq && !queue.length) return;
    queue.push(p);
    void pump();
  });
  socket.on('ai:narration', (p: { text: string }) => {
    st.setState({ narration: p.text });
    setTimeout(() => { if (st.getState().narration === p.text) st.setState({ narration: null }); }, 15000);
  });
  socket.connect();
}

// ---------- commands ----------
const fail = (e: unknown) => {
  const lang = useStore.getState().lang;
  useStore.getState().toast('error', e instanceof RequestError ? errorText(lang, e.code, e.message) : tr(lang, 'err.generic'));
};

function adopt(d: JoinData) {
  const s = { code: d.code, playerId: d.playerId, token: d.token };
  sessionStore.save(s);
  useStore.setState({ session: s, room: d.room, game: null, seq: 0, kickedMsg: false });
}

export function setGfx(gfx: Gfx) {
  try { localStorage.setItem('marx.gfx', gfx); } catch { /* ignore */ }
  useStore.setState({ gfx, gfxFallback: false });
}

export function setLang(lang: Lang) {
  try { localStorage.setItem('marx.lang', lang); } catch { /* ignore */ }
  document.documentElement.lang = lang;
  useStore.setState({ lang });
  boardRef.current?.setLang(lang);
  if (socket.connected) socket.emit('session:set-lang', { lang });
}

export const commands = {
  async create(name: string, avatar: number) {
    try { adopt(await request<JoinData>('room:create', { name, avatar })); sessionStore.saveProfile({ name, avatar }); } catch (e) { fail(e); }
  },
  async join(code: string, name: string, avatar: number) {
    try { adopt(await request<JoinData>('room:join', { code: code.trim().toUpperCase(), name, avatar })); sessionStore.saveProfile({ name, avatar }); } catch (e) { fail(e); }
  },
  async rejoin() {
    const last = sessionStore.last();
    if (!last) return;
    try {
      const d = await request<JoinData>('game:reconnect', { token: last.token });
      adopt(d);
    } catch (e) { sessionStore.forgetLast(); fail(e); }
  },
  async leave() {
    try { await request('room:leave'); } catch { /* ignore */ }
    sessionStore.clear(); sessionStore.forgetLast(); useStore.getState().reset();
  },
  async call(event: Parameters<typeof request>[0], payload?: unknown) {
    try { await request(event, payload); return true; } catch (e) { fail(e); return false; }
  },
  async act(action: Action): Promise<boolean> {
    const actionId = crypto.randomUUID?.() ?? String(Date.now()) + Math.random();
    try { await request('game:action', { actionId, action }); return true; } catch (e) { fail(e); return false; }
  },
  async ask(kind: 'tutor' | 'advisor', question: string, spaceId?: number) {
    const s = useStore.getState();
    const id = Date.now();
    useStore.setState({ chat: [...s.chat, { id, role: 'user', text: question, kind }], chatBusy: true });
    try {
      const lang = useStore.getState().lang;
      const a = await request<AiAnswer>('ai:ask', { kind, question, spaceId, lang });
      useStore.setState(x => ({ chat: [...x.chat, { id: id + 1, role: 'ai', text: a.text, source: a.source, kind }], chatBusy: false }));
    } catch (e) {
      useStore.setState(x => ({ chat: [...x.chat, { id: id + 1, role: 'ai', text: e instanceof RequestError ? errorText(useStore.getState().lang, e.code, e.message) : tr(useStore.getState().lang, 'err.AI_UNAVAILABLE'), kind }], chatBusy: false }));
    }
  },
};
