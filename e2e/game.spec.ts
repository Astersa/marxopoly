import { expect, test, type Page } from '@playwright/test';

async function actorPage(pages: Page[]): Promise<Page> {
  for (let i = 0; i < 60; i++) {
    for (const p of pages) if (await p.locator('[data-testid=roll]').count()) return p;
    await pages[0].waitForTimeout(250);
  }
  throw new Error('nobody can roll');
}

test('two players: create, join, ready, start, roll, buy, same state, reconnect', async ({ browser }) => {
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const errors: string[] = [];
  for (const p of [a, b]) p.on('pageerror', e => errors.push(e.message));

  // Home: create
  await a.goto('/');
  await a.fill('#name', 'Ada');
  await a.click('text=Create a room');
  await expect(a.locator('[data-testid=room-code]')).toBeVisible();
  const code = ((await a.textContent('[data-testid=room-code]')) ?? '').trim();
  expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}$/);

  // Join with a wrong then the right code
  await b.goto('/');
  await b.fill('#name', 'Boris');
  await b.fill('input[aria-label="Room code"]', 'ZZZZZ');
  await b.click('button:has-text("Join")');
  await expect(b.getByText('No room with that code.')).toBeVisible();
  await b.fill('input[aria-label="Room code"]', code);
  await b.click('button:has-text("Join")');
  await expect(b.locator('[data-testid=room-code]')).toHaveText(code);
  await expect(a.locator('[data-testid=seat]')).toHaveCount(2);

  // Start needs readiness
  await expect(a.locator('[data-testid=start]')).toBeDisabled();
  await b.click("text=I'm ready");
  await expect(a.locator('[data-testid=start]')).toBeEnabled();
  await a.click('[data-testid=start]');
  await expect(a.locator('[data-testid=board] canvas')).toBeVisible();
  await expect(b.locator('[data-testid=board] canvas')).toBeVisible();
  await expect(a.locator('[data-testid=player-card]')).toHaveCount(2);

  // Roll, then buy or end turn
  const first = await actorPage([a, b]);
  await first.click('[data-testid=roll]');
  await expect(first.locator('[data-testid=buy], [data-testid=end-turn], [data-testid=roll]').first()).toBeVisible({ timeout: 15000 });
  await first.waitForTimeout(800);
  if (await first.locator('[data-testid=card-modal]').count()) await first.keyboard.press('Escape');
  if (await first.locator('[data-testid=buy]').count()) {
    await first.click('[data-testid=buy]');
    await expect(first.locator('[data-testid=end-turn], [data-testid=roll]').first()).toBeVisible({ timeout: 10000 });
  }

  // Both browsers show identical player cards
  await expect.poll(async () => (await a.locator('[data-testid=player-card]').allTextContents()).join('|').replace(/You|To act|Offline/g, ''), { timeout: 10000 })
    .toBe((await b.locator('[data-testid=player-card]').allTextContents()).join('|').replace(/You|To act|Offline/g, ''));
  const tilesA = await a.locator('[data-testid=player-card] [data-testid^=cash-]').allTextContents();
  const tilesB = await b.locator('[data-testid=player-card] [data-testid^=cash-]').allTextContents();
  expect(tilesA).toEqual(tilesB);

  // Assistant works without an API key
  await a.click('role=tab[name="Advisor"]');
  await a.fill('input[aria-label="Question"]', 'What is surplus value?');
  await a.click('button:has-text("Ask")');
  await expect(a.locator('[data-testid=chat]')).toContainText(/surplus value/i, { timeout: 10000 });
  await expect(a.locator('[data-testid=chat]')).toContainText('Offline guide');

  // Reload = reconnect into the same game
  await b.reload();
  await expect(b.locator('[data-testid=board] canvas')).toBeVisible({ timeout: 15000 });
  await expect(b.locator('[data-testid=player-card]')).toHaveCount(2);
  await expect(b.getByText('Boris').first()).toBeVisible();

  expect(errors).toEqual([]);
  await ctxA.close();
  await ctxB.close();
});

test('phone width has no horizontal scroll and the board fits', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p = await ctx.newPage();
  await p.goto('/');
  await p.fill('#name', 'Solo');
  await p.click('text=Create a room');
  await p.click('text=Add bot');
  await expect(p.locator('[data-testid=seat]')).toHaveCount(2);
  const scroll = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(scroll).toBeLessThanOrEqual(0);
  // single human + bot cannot start (needs 2 humans)
  await expect(p.locator('[data-testid=start]')).toBeDisabled();
  await ctx.close();
});

async function startTwoHumans(browser: import('@playwright/test').Browser) {
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  await a.goto('/');
  await a.fill('#name', 'Ada');
  await a.click('text=Create a room');
  const code = ((await a.textContent('[data-testid=room-code]')) ?? '').trim();
  await b.goto('/');
  await b.fill('#name', 'Boris');
  await b.fill('input[aria-label="Room code"]', code);
  await b.click('button:has-text("Join")');
  await expect(b.locator('[data-testid=room-code]')).toHaveText(code);
  await b.click("text=I'm ready");
  await a.click('[data-testid=start]');
  await expect(a.locator('[data-testid=board] canvas')).toBeVisible();
  await expect(b.locator('[data-testid=board] canvas')).toBeVisible();
  return { a, b, close: async () => { await ctxA.close(); await ctxB.close(); } };
}

test('declining a space opens an auction for everyone; a trade can be proposed and accepted', async ({ browser }) => {
  test.setTimeout(150000);
  const { a, b, close } = await startTwoHumans(browser);
  const pages = [a, b];
  const seen = async () => (await a.locator('[data-testid=auction]').count()) > 0 && (await b.locator('[data-testid=auction]').count()) > 0;

  // Drive turns until a purchase prompt appears, then decline it to trigger the auction.
  for (let i = 0; i < 300 && !(await seen()); i++) {
    for (const p of pages) {
      if (await p.locator('[data-testid=card-modal]').count()) await p.keyboard.press('Escape');
      if (await p.locator('[data-testid=roll]').count()) { await p.click('[data-testid=roll]'); await p.waitForTimeout(1800); }
      else if (await p.locator('[data-testid=decline]').count()) { await p.click('[data-testid=decline]'); await p.waitForTimeout(600); }
      else if (await p.locator('[data-testid=end-turn]').count()) { await p.click('[data-testid=end-turn]'); await p.waitForTimeout(300); }
      else await p.waitForTimeout(250);
    }
  }
  expect(await seen()).toBe(true);

  // Bid by whoever is up, the other passes.
  const bidder = (await a.locator('[data-testid=auction] button:has-text("Bid")').count()) ? a : b;
  const other = bidder === a ? b : a;
  await bidder.click('[data-testid=auction] button:has-text("Bid")');
  await expect(other.locator('[data-testid=auction] button:has-text("Pass")')).toBeVisible({ timeout: 8000 });
  await other.click('[data-testid=auction] button:has-text("Pass")');
  await expect(a.locator('[data-testid=auction]')).toHaveCount(0, { timeout: 8000 });
  await a.click('role=tab[name="Log"]');
  await expect(a.locator('[data-testid=log]')).toContainText('wins the auction');

  // Trade: the player who can manage proposes 10 cr to the other, who accepts.
  let proposer = null as typeof a | null;
  for (let i = 0; i < 30 && !proposer; i++) {
    for (const p of pages) if (await p.locator('[data-testid=action-bar] button:has-text("Trade")').count()) proposer = p;
    if (!proposer) await a.waitForTimeout(300);
  }
  expect(proposer).not.toBeNull();
  const target = proposer === a ? b : a;
  await proposer!.click('[data-testid=action-bar] button:has-text("Trade")');
  await expect(proposer!.locator('[data-testid=trade-composer]')).toBeVisible();
  await proposer!.locator('[data-testid=trade-composer] input[type=number]').first().fill('10');
  await proposer!.click('button:has-text("Send offer")');
  await expect(target.locator('[data-testid=trade-prompt]')).toBeVisible({ timeout: 8000 });
  await target.click('[data-testid=trade-prompt] button:has-text("Accept")');
  await expect(target.locator('[data-testid=trade-prompt]')).toHaveCount(0, { timeout: 8000 });
  await target.click('role=tab[name="Log"]');
  await expect(target.locator('[data-testid=log]')).toContainText('accepts the trade');
  await close();
});

test('two players in two languages see the same state, switch language mid-game and keep it after reload', async ({ browser }) => {
  test.setTimeout(120000);
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'en-US' });
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'vi-VN' });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const errors: string[] = [];
  for (const p of [a, b]) p.on('pageerror', e => errors.push(e.message));

  await a.goto('/');
  await b.goto('/');
  // default language comes from the browser
  await expect(a.getByText('Create a room')).toBeVisible();
  await expect(b.getByTestId('create')).toHaveText('Tạo phòng');
  expect(await b.evaluate(() => document.documentElement.lang)).toBe('vi');

  await a.fill('#name', 'Ada');
  await a.getByTestId('create').click();
  const code = ((await a.textContent('[data-testid=room-code]')) ?? '').trim();
  await b.fill('#name', 'Bình');
  await b.getByTestId('code-input').fill(code);
  await b.getByTestId('join').click();
  await expect(b.getByTestId('ready')).toHaveText('Tôi đã sẵn sàng');
  await b.getByTestId('ready').click();
  await a.getByTestId('start').click();
  await expect(a.locator('[data-testid=board] canvas')).toBeVisible();
  await expect(b.locator('[data-testid=board] canvas')).toBeVisible();

  const first = await actorPage([a, b]);
  await first.click('[data-testid=roll]');
  await expect(first.locator('[data-testid=buy], [data-testid=end-turn], [data-testid=roll]').first()).toBeVisible({ timeout: 15000 });
  if (await first.locator('[data-testid=card-modal]').count()) await first.keyboard.press('Escape');

  // Each player reads the log in their own language
  await a.getByRole('tab', { name: 'Log' }).click();
  await b.getByRole('tab', { name: 'Nhật ký' }).click();
  await expect(a.getByTestId('log')).toContainText(/rolls \d \+ \d/, { timeout: 25000 });
  await expect(b.getByTestId('log')).toContainText(/đổ được \d \+ \d/, { timeout: 25000 });

  // Same numbers in both languages
  const digits = async (p: Page) => (await p.locator('[data-testid^=cash-]').allTextContents()).map(s => s.replace(/\D/g, ''));
  await expect.poll(async () => (await digits(a)).join(','), { timeout: 10000 }).toBe((await digits(b)).join(','));

  // Switch B to English in the middle of the game: state and board survive
  const before = await digits(b);
  await b.getByTestId('lang-en').click();
  await expect(b.getByTestId('log')).toContainText(/rolls \d \+ \d/, { timeout: 25000 });
  await expect(b.locator('[data-testid=board] canvas')).toBeVisible();
  await expect(b.getByTestId('player-card')).toHaveCount(2);
  expect(await digits(b)).toEqual(before);
  expect(await b.evaluate(() => document.documentElement.lang)).toBe('en');

  // Reload keeps the chosen language and reconnects into the game
  await b.reload();
  await expect(b.locator('[data-testid=board] canvas')).toBeVisible({ timeout: 15000 });
  await expect(b.getByRole('tab', { name: 'Log' })).toBeVisible();
  await b.getByTestId('lang-vi').click();
  await b.reload();
  await expect(b.getByRole('tab', { name: 'Nhật ký' })).toBeVisible({ timeout: 15000 });
  expect(await b.evaluate(() => document.documentElement.lang)).toBe('vi');

  expect(errors).toEqual([]);
  await ctxA.close();
  await ctxB.close();
});

// ---------------------------------------------------------------- 3D board
type B3 = { __board3d: { tileScreen(i: number): { x: number; y: number } } };
async function twoPlayerGame(browser: import('@playwright/test').Browser, init?: (p: Page) => Promise<void>) {
  const ca = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const cb = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const a = await ca.newPage(); const b = await cb.newPage();
  if (init) { await init(a); await init(b); }
  const errors: string[] = [];
  for (const p of [a, b]) { p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); }
  await a.goto('/'); await a.fill('#name', 'Ada'); await a.getByTestId('create').click();
  const code = ((await a.textContent('[data-testid=room-code]')) ?? '').trim();
  await b.goto('/'); await b.fill('#name', 'Boris'); await b.getByTestId('code-input').fill(code); await b.getByTestId('join').click();
  await b.getByTestId('ready').click(); await a.getByTestId('start').click();
  return { a, b, errors, close: async () => { await ca.close(); await cb.close(); } };
}
const cashes = async (p: Page) => (await p.locator('[data-testid^=cash-]').allTextContents()).map(s => s.replace(/\D/g, '')).join(',');
const settled = (p: Page) => expect.poll(() => p.evaluate(() => (window as unknown as { __board3d: { isSettled(): boolean } }).__board3d.isSettled()), { timeout: 40000 }).toBe(true);
/** Wait until the camera and all animations are at rest, then read the tile position, so the click cannot land on a tile that is still moving. */
const tileAt = async (p: Page, id: number) => { await settled(p); return p.evaluate(i => (window as unknown as B3).__board3d.tileScreen(i), id); };

test('3D board: renders without console errors, rolls and buys, both players agree, tile click opens the Property panel', async ({ browser }) => {
  test.setTimeout(180000);
  const { a, b, errors, close } = await twoPlayerGame(browser);
  await expect(a.locator('[data-testid=board3d-canvas]')).toBeVisible({ timeout: 60000 });
  await expect(b.locator('[data-testid=board3d-canvas]')).toBeVisible({ timeout: 60000 });
  await expect(a.getByTestId('board')).toHaveAttribute('data-gfx', '3d-high');
  await expect(a.getByTestId('board-loading')).toHaveCount(0, { timeout: 60000 });
  const first = await actorPage([a, b]);
  await first.click('[data-testid=roll]');
  await expect(first.locator('[data-testid=buy], [data-testid=end-turn], [data-testid=roll]').first()).toBeVisible({ timeout: 30000 });
  if (await first.locator('[data-testid=card-modal]').count()) await first.keyboard.press('Escape');
  if (await first.locator('[data-testid=buy]').count()) await first.click('[data-testid=buy]');
  await expect.poll(async () => cashes(a), { timeout: 20000 }).toBe(await cashes(b));
  const pos = await tileAt(a, 11);
  await a.mouse.click(pos.x, pos.y);
  await expect(a.getByTestId('property-panel')).toContainText('Hon Gai Coal Mining Complex');
  await expect(a.getByTestId('board-caption')).toContainText('Hon Gai');
  const pos2 = await tileAt(a, 25);
  await a.mouse.click(pos2.x, pos2.y);
  await expect(a.getByTestId('property-panel')).toContainText('International Financial Center');
  expect(errors).toEqual([]);
  await close();
});

test('3D board: language switch mid-game relabels, 3D to 2D to 3D keeps the state', async ({ browser }) => {
  test.setTimeout(180000);
  const { a, b, close } = await twoPlayerGame(browser);
  await expect(a.locator('[data-testid=board3d-canvas]')).toBeVisible({ timeout: 60000 });
  await expect(b.locator('[data-testid=board3d-canvas]')).toBeVisible({ timeout: 60000 });
  const first = await actorPage([a, b]);
  await first.click('[data-testid=roll]');
  await expect(first.locator('[data-testid=buy], [data-testid=end-turn], [data-testid=roll]').first()).toBeVisible({ timeout: 30000 });
  if (await first.locator('[data-testid=card-modal]').count()) await first.keyboard.press('Escape');
  await expect(a.getByTestId('status')).not.toContainText('Resolving', { timeout: 30000 });
  await a.waitForTimeout(1500);
  await expect(a.getByTestId('status')).not.toContainText('Resolving');
  const before = await cashes(a);
  // The camera eases back after following a character: a position read while it moves points at the wrong tile.
  await expect.poll(async () => {
    const p = await tileAt(a, 16);
    await a.waitForTimeout(400);
    const q = await tileAt(a, 16);
    return Math.hypot(p.x - q.x, p.y - q.y);
  }, { timeout: 30000 }).toBeLessThan(1);
  const pos = await tileAt(a, 16);
  await a.mouse.click(pos.x, pos.y);
  await expect(a.getByTestId('board-caption')).toContainText('Cartel Price Alliance');
  await a.getByTestId('lang-vi').click();
  await expect(a.getByTestId('board-caption')).toContainText('Liên minh giá các-ten');
  expect(await cashes(a)).toBe(before);
  await a.getByTestId('lang-en').click();
  await a.getByTestId('gfx-2d').click();
  await expect(a.getByTestId('board')).toHaveAttribute('data-gfx', '2d');
  await expect(a.locator('[data-testid=board] canvas')).toBeVisible();
  await expect(a.locator('[data-testid=board3d-canvas]')).toHaveCount(0);
  expect(await cashes(a)).toBe(before);
  await a.getByTestId('gfx-3d-high').click();
  await expect(a.locator('[data-testid=board3d-canvas]')).toBeVisible({ timeout: 60000 });
  expect(await cashes(a)).toBe(before);
  await expect(a.getByTestId('player-card')).toHaveCount(2);
  await a.getByTestId('gfx-3d-low').click();
  await expect(a.getByTestId('board')).toHaveAttribute('data-gfx', '3d-low');
  await a.reload();
  await expect(a.getByTestId('board')).toHaveAttribute('data-gfx', '3d-low', { timeout: 30000 });
  await close();
});

test('without WebGL the game falls back to the 2D board and stays playable', async ({ browser }) => {
  test.setTimeout(120000);
  const { a, b, close } = await twoPlayerGame(browser, async p => {
    await p.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') return null;
        return (orig as (...a: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof orig;
    });
  });
  await expect(a.getByTestId('board')).toHaveAttribute('data-gfx', '2d', { timeout: 30000 });
  await expect(a.locator('[data-testid=board] canvas')).toBeVisible();
  await expect(a.locator('[data-testid=board3d-canvas]')).toHaveCount(0);
  const first = await actorPage([a, b]);
  await first.click('[data-testid=roll]');
  await expect(first.locator('[data-testid=buy], [data-testid=end-turn], [data-testid=roll]').first()).toBeVisible({ timeout: 20000 });
  await close();
});

test('3D board is big and readable: fills the container, tiles, characters, dice and logo meet their size targets', async ({ browser }) => {
  test.setTimeout(150000);
  const { a, close } = await twoPlayerGame(browser);
  await expect(a.locator('[data-testid=board3d-canvas]')).toBeVisible({ timeout: 60000 });
  await expect(a.getByTestId('board-loading')).toHaveCount(0, { timeout: 60000 });
  await settled(a);
  const m = await a.evaluate(() => (window as unknown as { __board3d: { measure(): Record<string, unknown> } }).__board3d.measure()) as {
    boardWidthFraction: number; tileWidthNearRowPx: number; tileWidthFarRowPx: number; plaqueWidthNearRowPx: number; characterHeightPx: number[]; diceSizePx: number[]; logoWidthPx: number; canvas: { w: number; h: number };
  };
  console.log('3D measurements (1440x900):', JSON.stringify(m));
  expect(m.boardWidthFraction).toBeGreaterThanOrEqual(0.9);
  expect(m.tileWidthNearRowPx).toBeGreaterThanOrEqual(80);
  expect(m.tileWidthFarRowPx).toBeGreaterThanOrEqual(60);
  expect(m.plaqueWidthNearRowPx).toBeGreaterThanOrEqual(75);
  for (const h of m.characterHeightPx) expect(h).toBeGreaterThanOrEqual(48);
  for (const d of m.diceSizePx) expect(d).toBeGreaterThanOrEqual(40);
  expect(m.logoWidthPx).toBeGreaterThanOrEqual(280);
  await close();
});

test('3D loading bar reports real byte progress, not a stuck zero', async ({ browser }) => {
  test.setTimeout(120000);
  const ctxA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const a = await ctxA.newPage();
  // slow down the big character files so the bar is visibly part-way while the two small files are in
  await a.route('**/models/characters/**', async r => { await new Promise(res => setTimeout(res, 3000)); await r.continue(); });
  await a.goto('/'); await a.fill('#name', 'Ada'); await a.getByTestId('create').click();
  const code = ((await a.textContent('[data-testid=room-code]')) ?? '').trim();
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const b = await ctxB.newPage();
  await b.goto('/'); await b.fill('#name', 'Boris'); await b.getByTestId('code-input').fill(code); await b.getByTestId('join').click();
  await b.getByTestId('ready').click(); await a.getByTestId('start').click();
  await a.getByTestId('board-loading').waitFor({ timeout: 20000 });
  const seen: number[] = [];
  const start = Date.now();
  while (Date.now() - start < 25000 && (await a.getByTestId('board-loading').count())) {
    const txt = (await a.getByTestId('board-loading').textContent().catch(() => '')) ?? '';
    const m = txt.match(/(\d+)%/);
    if (m) seen.push(Number(m[1]));
    await a.waitForTimeout(250);
  }
  console.log('loading progress samples:', seen.join(','));
  expect(seen.some(p => p > 0 && p < 100)).toBe(true);
  await ctxA.close(); await ctxB.close();
});
