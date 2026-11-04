import { io } from 'socket.io-client';
import type { Ack, ClientEvent } from '../shared/protocol';

export const socket = io({ autoConnect: false, transports: ['websocket', 'polling'] });

export class RequestError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export function request<T = unknown>(event: ClientEvent, payload: unknown = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    if (!socket.connected) { reject(new RequestError('OFFLINE', 'Not connected to the server.')); return; }
    const timer = setTimeout(() => reject(new RequestError('TIMEOUT', 'The server did not answer.')), 15000);
    socket.emit(event, payload, (ack: Ack<T>) => {
      clearTimeout(timer);
      if (ack.ok) resolve(ack.data); else reject(new RequestError(ack.code, ack.message));
    });
  });
}

export interface StoredSession { code: string; playerId: string; token: string }
const SK = 'marx.session';
const LK = 'marx.last';
const PK = 'marx.profile';

const safe = <T,>(fn: () => T, fallback: T): T => { try { return fn(); } catch { return fallback; } };

export const sessionStore = {
  load: (): StoredSession | null => safe(() => JSON.parse(sessionStorage.getItem(SK) || 'null'), null),
  save: (s: StoredSession) => safe(() => { sessionStorage.setItem(SK, JSON.stringify(s)); localStorage.setItem(LK, JSON.stringify(s)); }, undefined),
  clear: () => safe(() => sessionStorage.removeItem(SK), undefined),
  last: (): StoredSession | null => safe(() => JSON.parse(localStorage.getItem(LK) || 'null'), null),
  forgetLast: () => safe(() => localStorage.removeItem(LK), undefined),
  profile: (): { name: string; avatar: number } => safe(() => JSON.parse(localStorage.getItem(PK) || 'null') ?? { name: '', avatar: 0 }, { name: '', avatar: 0 }),
  saveProfile: (p: { name: string; avatar: number }) => safe(() => localStorage.setItem(PK, JSON.stringify(p)), undefined),
};
