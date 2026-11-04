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

## Languages (English and Vietnamese)

The whole game is bilingual: UI, the 40 board spaces, all cards, the glossary, the game log, error messages, the Phaser board labels and the AI assistant.

- **Per player, not per room.** Each browser stores its own language (`localStorage` key `marx.lang`). Default: the stored choice, else `navigator.language` starting with `vi`, else English. The EN/VI switch is in the header of Home, Lobby and Game; it changes the language instantly, without reload and without touching the game state. Two players in one room can use different languages.
- **The server never sends display text.** Log entries, events and debt reasons are `{ key, params }`; params refer to data by id (`space` is a board id, `card` is a card id, names are player data). Errors keep their `code` and the client translates by code (the English `message` is a fallback). The engine, rules and numbers do not change with the language.
- **Where the text lives.**
  - `src/shared/i18n/en.ts`: UI, log, reason and error strings. This file defines the `Key` type.
  - `src/shared/i18n/vi.ts`: the same keys in Vietnamese. It is typed `Record<Key, string>`, so a missing key fails `npm run typecheck`.
  - `src/shared/i18n/content.vi.ts`: Vietnamese board spaces, groups, cards and glossary, looked up by id. The English content stays in `board.ts`, `cards.ts` and `glossary.ts`.
  - `src/shared/i18n/index.ts`: `t(lang, key, params)`, `tm(lang, msg)` for server keys, and `localizedSpace/Card/Term/Group`.
- **Fonts.** Anton, Barlow Condensed and Barlow all ship a `vietnamese` subset in `@fontsource` and no substitution is needed. Because canvas text does not load `unicode-range` subsets by itself, the board waits for `document.fonts.load(..., "Ệ ầ ơ ư")` before it is drawn.
- **AI.** `ai:ask` carries `lang` (`en` or `vi`, default `en`). For Claude the language and the terminology table are added to the per-request prompt, the system prompt stays stable. The offline Tutor searches both languages and ignores diacritics ("gia tri thang du" finds "giá trị thặng dư"). The Game Master narrates once per language that is in use in the room (`session:set-lang` tells the server each socket's language) and sends only to those sockets. Offline narration costs no room budget.

### Adding a language or fixing a translation

1. Add the language code to `Lang`/`LANGS` in `src/shared/i18n/index.ts` and to the zod enums in `src/shared/protocol.ts`.
2. Copy `vi.ts` to a new file typed `Record<Key, string>`, register it in `TABLE`, and add a content file like `content.vi.ts`.
3. `npm test` checks that every key and placeholder matches, that all 40 spaces, all cards and all terms are translated and differ from English, and that tile short names fit (24 characters).

Vietnamese screenshots are in `docs/screenshots/*-vi-*.png`: `LANG_UI=vi PORT=3217 node scripts/shots.mjs docs/screenshots`.

## 3D board

The board is a Three.js 3D scene (`src/client/three/Board3D.ts`) with rigged, animated characters and buildings that grow with the development level. It implements the same `BoardApi` as the original Phaser board, which is kept as the fallback and as the "2D" option. The engine, server and protocol are unchanged.

- **Graphics option** (header): 3D High, 3D Low, 2D, stored in `localStorage` (`marx.gfx`). Default is 3D High on desktop, 3D Low on narrow screens or when `navigator.deviceMemory <= 4`. 3D Low has no shadows or smoke, a lower pixel ratio and a 30 fps cap. Switching in the middle of a game keeps the state.
- **Fallback.** If WebGL is missing, the models fail to load or the GL context is lost, the game switches to the 2D board automatically and stays playable.
- **Loading.** `three` and the models are loaded lazily when a game starts (a separate chunk of about 0.7 MB, 0.18 MB gzipped, plus 10 MB of models); the lobby and home page do not pay for them. A progress bar is shown.
- **Controls.** Click or tap a tile to open its Property panel; hover shows the full name; the rotate button turns the view by 90 degrees; dragging tilts the view slightly. The page still scrolls on phones (the canvas uses `touch-action: pan-y`).
- **Layout maths** (tile positions, walking paths, level to building plan, dice orientation, clip mapping) lives in `src/client/three/layout3d.ts` with unit tests.
- **Assets:** CC0 packs by Kay Lousberg, see `docs/ASSETS.md`. `node scripts/build-models.mjs <folder with the cloned KayKit repos>` rebuilds `public/models/`.

In 3D mode on wide screens the layout gives the board the whole left column: the action bar and the player cards move to the right column, so the board can be about 980x780 px at 1440x900. `window.__board3d.measure()` (also used by an e2e test) reports the on-screen size of the board, tiles, name plaques, characters, dice and logo.
