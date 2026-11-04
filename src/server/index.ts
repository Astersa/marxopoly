import { createApp } from './app';
import { createAiHooks } from './ai/service';

const port = Number(process.env.PORT) || 3000;
const ai = createAiHooks();
const { server, mgr } = createApp({
  ai,
  limits: process.env.MAX_ROOMS ? { maxRooms: Number(process.env.MAX_ROOMS) } : undefined,
});

server.listen(port, '0.0.0.0', () => {
  console.log(`MARXOPOLY listening on 0.0.0.0:${port} (assistant: ${ai.name})`);
});

const shutdown = () => { for (const r of mgr.rooms.values()) r.session?.destroy(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 2000).unref(); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
