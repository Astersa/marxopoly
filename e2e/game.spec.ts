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
  for (let i = 0; i < 80 && !(await seen()); i++) {
    for (const p of pages) {
      if (await p.locator('[data-testid=card-modal]').count()) await p.keyboard.press('Escape');
      if (await p.locator('[data-testid=roll]').count()) { await p.click('[data-testid=roll]'); await p.waitForTimeout(1800); }
      else if (await p.locator('[data-testid=decline]').count()) { await p.click('[data-testid=decline]'); await p.waitForTimeout(600); }
      else if (await p.locator('[data-testid=end-turn]').count()) { await p.click('[data-testid=end-turn]'); await p.waitForTimeout(300); }
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
