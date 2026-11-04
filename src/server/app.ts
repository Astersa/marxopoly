import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { DEFAULT_LIMITS, RoomManager, type RoomLimits } from './rooms';
import type { Timing } from './session';
import { attachSockets, type AiHooks } from './sockets';

export interface AppOptions {
  ai?: AiHooks;
  limits?: Partial<RoomLimits>;
  timing?: Timing;
  clientDir?: string;
}

export function createApp(opts: AppOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.get('/healthz', (_req, res) => { res.json({ ok: true, rooms: mgr.rooms.size }); });

  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [opts.clientDir, path.resolve(here, '../client'), path.resolve(process.cwd(), 'dist/client')].filter(d => d && !fs.existsSync(path.join(d, 'main.tsx'))).filter(Boolean) as string[];
  const clientDir = candidates.find(d => fs.existsSync(path.join(d, 'index.html')));
  if (clientDir) {
    app.use(express.static(clientDir, { maxAge: '1h', index: false }));
    app.get(/^\/(?!socket\.io|healthz).*/, (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));
  } else {
    app.get('/', (_req, res) => { res.type('text').send('MARXOPOLY server is running. Build the client with `npm run build`, or use `npm run dev`.'); });
  }

  const server = http.createServer(app);
  const io = new Server(server, { serveClient: false, pingInterval: 10000, pingTimeout: 15000, maxHttpBufferSize: 1e5 });
  const mgr = new RoomManager({ ...DEFAULT_LIMITS, ...opts.limits }, opts.timing);
  attachSockets(io, mgr, opts.ai);

  const sweeper = setInterval(() => {
    const changed = mgr.sweep();
    for (const r of changed) io.to(r.code).emit('room:updated', mgr.publicRoom(r, opts.ai?.name));
  }, 15000);
  sweeper.unref();

  const close = () => new Promise<void>(resolve => {
    clearInterval(sweeper);
    for (const r of [...mgr.rooms.values()]) mgr.deleteRoom(r);
    io.close(() => resolve());
  });
  return { app, server, io, mgr, close, clientDir };
}
