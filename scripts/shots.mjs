// Takes lobby and game screenshots at desktop and phone sizes against a running server.
// Usage: PORT=3217 node scripts/shots.mjs [outDir]
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const base = `http://localhost:${process.env.PORT || 3217}`;
const out = path.resolve(process.argv[2] || 'docs/screenshots');
fs.mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const sizes = [{ name: '1440x900', width: 1440, height: 900 }, { name: '390x844', width: 390, height: 844 }];

for (const size of sizes) {
  const ctxA = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1 });
  const ctxB = await browser.newContext({ viewport: { width: size.width, height: size.height } });
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  a.on('pageerror', e => console.log('pageerror A', e.message));
  b.on('pageerror', e => console.log('pageerror B', e.message));
  await a.goto(base);
  await a.waitForSelector('#name');
  await a.screenshot({ path: path.join(out, `home-${size.name}.png`) });
  await a.fill('#name', 'Ada');
  await a.click('text=Create a room');
  await a.waitForSelector('[data-testid=room-code]');
  const code = (await a.textContent('[data-testid=room-code]')).trim();
  await b.goto(base);
  await b.fill('#name', 'Boris');
  await b.fill('input[aria-label="Room code"]', code);
  await b.click('button:has-text("Join")');
  await b.waitForSelector('[data-testid=room-code]');
  await a.click('text=Add bot');
  await b.click("text=I'm ready");
  await a.waitForTimeout(400);
  await a.screenshot({ path: path.join(out, `lobby-${size.name}.png`), fullPage: true });
  await a.click('[data-testid=start]');
  await a.waitForSelector('[data-testid=board] canvas');
  await a.waitForTimeout(2500);
  await a.screenshot({ path: path.join(out, `game-${size.name}.png`), fullPage: true });
  // play a few moves so tokens, ownership and cards show up
  for (let i = 0; i < 14; i++) {
    for (const p of [a, b]) {
      const roll = p.locator('[data-testid=roll]');
      if (await roll.count()) { await roll.click().catch(() => {}); await p.waitForTimeout(2200); }
      const buy = p.locator('[data-testid=buy]');
      if (await buy.count()) { await buy.click().catch(() => {}); await p.waitForTimeout(500); }
      const end = p.locator('[data-testid=end-turn]');
      if (await end.count()) { await end.click().catch(() => {}); await p.waitForTimeout(500); }
      const dismiss = p.locator('[data-testid=card-modal]');
      if (await dismiss.count()) { await p.keyboard.press('Escape'); }
    }
  }
  await a.waitForTimeout(1500);
  await a.screenshot({ path: path.join(out, `game-played-${size.name}.png`), fullPage: true });
  console.log(size.name, 'scrollWidth', await a.evaluate(() => document.documentElement.scrollWidth), 'clientWidth', await a.evaluate(() => document.documentElement.clientWidth));
  await ctxA.close();
  await ctxB.close();
}
await browser.close();
