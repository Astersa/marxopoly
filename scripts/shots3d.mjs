// 3D board screenshots + fps. Usage: PORT=3217 [LANG_UI=vi] [QUALITY=3d-high|3d-low] node scripts/shots3d.mjs [outDir]
// Headless Chromium renders WebGL in software (SwiftShader), so the fps it reports is NOT representative of a real GPU.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const base = `http://localhost:${process.env.PORT || 3217}`;
const lang = process.env.LANG_UI === 'vi' ? 'vi' : 'en';
const quality = process.env.QUALITY || '3d-high';
const out = path.resolve(process.argv[2] || 'docs/screenshots');
fs.mkdirSync(out, { recursive: true });
const tag = lang === 'vi' ? 'vi-' : '';
const names = lang === 'vi' ? ['An', 'Bình'] : ['Ada', 'Boris'];

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const sizes = [{ name: '1440x900', width: 1440, height: 900 }, { name: '390x844', width: 390, height: 844 }];
const only = process.env.SIZE;

for (const size of sizes) {
  if (only && only !== size.name) continue;
  const opts = { deviceScaleFactor: Number(process.env.DSF || 1), viewport: { width: size.width, height: size.height }, locale: lang === 'vi' ? 'vi-VN' : 'en-US' };
  const ctxA = await browser.newContext(opts);
  const ctxB = await browser.newContext(opts);
  for (const c of [ctxA, ctxB]) await c.addInitScript(q => { try { localStorage.setItem('marx.gfx', q); } catch {} }, quality);
  const a = await ctxA.newPage();
  const b = await ctxB.newPage();
  const errors = [];
  for (const p of [a, b]) { p.on('pageerror', e => errors.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ' ' + m.text()); }); }
  await a.goto(base);
  await a.fill('#name', names[0]);
  await a.getByTestId('create').click();
  await a.waitForSelector('[data-testid=room-code]');
  const code = (await a.textContent('[data-testid=room-code]')).trim();
  await b.goto(base);
  await b.fill('#name', names[1]);
  await b.getByTestId('code-input').fill(code);
  await b.getByTestId('join').click();
  await b.waitForSelector('[data-testid=room-code]');
  await a.getByTestId('add-bot').first().click();
  await b.getByTestId('ready').click();
  await a.getByTestId('start').click();
  // loading screen
  await a.waitForSelector('[data-testid=board-loading]', { timeout: 5000 }).then(() => a.screenshot({ path: path.join(out, `3d-loading-${tag}${size.name}.png`) })).catch(() => {});
  await a.waitForSelector('[data-testid=board3d-canvas]', { timeout: 60000 });
  await a.waitForTimeout(4000);
  await a.screenshot({ path: path.join(out, `3d-board-${tag}${size.name}.png`), fullPage: true });
  console.log(size.name, 'measure', JSON.stringify(await a.evaluate(() => window.__board3d.measure())));
  console.log(size.name, 'fps (idle):', await a.evaluate(() => document.querySelector('[data-testid=board]')?.dataset.fps));
  let movedShot = false;
  // play some turns
  for (let i = 0; i < 12; i++) {
    for (const p of [a, b]) {
      const roll = p.locator('[data-testid=roll]');
      if (await roll.count()) { await roll.click().catch(() => {}); await p.waitForTimeout(1500); if (!movedShot) { movedShot = true; await a.screenshot({ path: path.join(out, `3d-moving-${tag}${size.name}.png`), fullPage: true }); } await p.waitForTimeout(3500); }
      const buy = p.locator('[data-testid=buy]');
      if (await buy.count()) { await buy.click().catch(() => {}); await p.waitForTimeout(1200); }
      const end = p.locator('[data-testid=end-turn]');
      if (await end.count()) { await end.click().catch(() => {}); await p.waitForTimeout(400); }
      if (await p.locator('[data-testid=card-modal]').count()) await p.keyboard.press('Escape');
    }
  }
  await a.waitForTimeout(1500);
  await a.screenshot({ path: path.join(out, `3d-played-${tag}${size.name}.png`), fullPage: true });
  console.log(size.name, 'fps (after play):', await a.evaluate(() => document.querySelector('[data-testid=board]')?.dataset.fps), 'scroll', await a.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth));
  console.log('console problems:', errors.slice(0, 8));
  await ctxA.close(); await ctxB.close();
}
await browser.close();
