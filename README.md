# MARXOPOLY

A browser-based 2D multiplayer economic board game built around Marxist-Leninist political economy. Private rooms for up to 4 players, server-authoritative rules, optional bots, and an optional AI tutor/advisor that works fully offline.

Stack: Node + Express + Socket.IO + TypeScript on the server; React + Vite + Tailwind + Zustand + Phaser 4 on the client; zod for every socket payload and card definition; vitest and Playwright for tests.

The full plan lives in `docs/PLAN.md` (Vietnamese); the game rules in `docs/RULES.md`.

## Run locally

Requires Node 20 or newer (developed on Node 24).

```bash
npm install
npm run dev        # server on :3000 (tsx watch) + Vite on :5173 with a /socket.io proxy
```

Open http://localhost:5173. Open a second tab (or a private window) to be a second player: sessions are kept per tab in `sessionStorage`.

Production build:

```bash
npm run build      # vite build -> dist/client, esbuild -> dist/server/index.js
PORT=3000 npm start
```

`/healthz` answers `{"ok":true,...}`.

Other scripts: `npm test` (vitest), `npm run typecheck`, `npm run test:e2e` (Playwright; needs `npm run build` first and `npx playwright install chromium` once).

To take the lobby and game screenshots: start the built server on a port and run `PORT=3217 node scripts/shots.mjs docs/screenshots`.

## Environment variables

| Name | Default | Purpose |
|---|---|---|
| `PORT` | 3000 | HTTP port. The server listens on `0.0.0.0`. |
| `ANTHROPIC_API_KEY` | unset | Enables the Claude-backed Tutor, Advisor and Game Master. Without it everything runs on the built-in offline guide. |
| `AI_MODEL` | `claude-sonnet-5-5` | Model id used when a key is set. |
| `AI_MAX_REQUESTS_PER_ROOM` | 100 | Cap on assistant calls per room. Each player is also limited to 10 questions per minute and 500 characters per question. |
| `MAX_ROOMS` | 200 | Maximum concurrent rooms. |

Copy `.env.example` if you use a tool that loads `.env`. The API key is only read by the server and is never sent to the browser.

## AI

The AI never controls dice, money, ownership or state: providers have no tools and return text only. Roles:

- **Tutor**: explains concepts, grounded by glossary/space/card excerpts that the server adds to the prompt.
- **Advisor**: reads the public game state and comments on assets, risks and investments.
- **Game Master**: short narration after card draws, bankruptcies and the end of the game (at most once per 20 s per room).
- **Opponent**: heuristic bots in `src/shared/bot.ts`; they send normal actions through the same engine and never call an LLM.

If the Claude call fails for any reason (rate limit, status error, connection error, refusal, empty reply) the answer silently falls back to the offline provider.

## Deploy to Render (free)

1. Push this folder to a GitHub repository (this project does not run `git` for you).
2. In Render choose **New > Blueprint**, select the repository. `render.yaml` defines one free Web Service: build `npm ci --include=dev && npm run build`, start `npm start`, health check `/healthz`, `NODE_VERSION=24`. (`--include=dev` is needed because Render sets `NODE_ENV=production`.)
3. Optional: set `ANTHROPIC_API_KEY` in the service's Environment tab (it is declared with `sync: false`, so Render asks for it).
4. Open the service URL. One service serves both the static client and the Socket.IO endpoint on the same origin, so no CORS setup is needed.

### Free tier limits that affect play

- The service spins down after 15 minutes without traffic; WebSocket messages count as traffic, so a running game keeps it awake. The first visit after a spin-down takes about a minute (cold start).
- Free instances have 750 hours per month per workspace, a temporary filesystem and a single instance.
- **Game state is in memory.** A restart or spin-down loses every running game. Players who reload after a restart land on the home page.

## Deviations from the original brief

- **In-memory state instead of PostgreSQL/Prisma.** Render's free Postgres expires after 30 days and the MVP does not need persistence. The hand-off point for a database is `src/server/session.ts`.
- **One `game:action` event** replaces per-action events, and server updates are batched as `game:state-updated { state, events[], seq }` so the client can animate in order and there is a single validation path.
- **AI provider:** Anthropic (official SDK) plus an offline provider; OpenAI is not implemented (adding it means one more class implementing `AiProvider`).
- **Anthropic SDK:** the installed SDK (1.4.0) has no `APIStatusError` export, so error handling uses `RateLimitError`, then `APIConnectionError`, then `APIError` (which carries the HTTP status). The request shape from the plan (`output_config`, `betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`) is accepted by the SDK types unchanged.
- `legalActions` lives in `src/shared/engine.ts` (not `rules.ts`) to avoid a circular import; it validates candidates with the real engine so client buttons can never disagree with the server.

## Project layout

```
src/shared/   types board cards glossary rules engine bot scoring protocol
src/server/   index app rooms session sockets ai/{provider,anthropic,offline,context,service}
src/client/   main App store socket avatars hooks pages/ components/ phaser/
tests/        vitest suites (engine, board, cards, scoring, bot simulation, rooms, sockets, ai)
e2e/          Playwright tests
```
