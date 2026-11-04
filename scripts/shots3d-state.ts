// 3D screenshots from a prepared mid-game state (many buildings, mortgages) plus measurements.
// Usage: npx tsx scripts/shots3d-state.ts <outDir>   (needs `npm run build` first)
// Headless Chromium renders WebGL in software, so the fps it prints is NOT representative of a real GPU.
import { chromium } from '@playwright/test';
import { createApp } from '../src/server/app';
import path from 'node:path';

const out = process.argv[2] || 'docs/screenshots';
const { server, mgr, close } = createApp({ clientDir: path.resolve('dist/client') });
await new Promise<void>(r => server.listen(3298, '127.0.0.1', r));
const base = 'http://127.0.0.1:3298';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });

for (const lang of ['en', 'vi'] as const) {
  for (const size of [{ n: '1440x900', w: 1440, h: 900 }, { n: '390x844', w: 390, h: 844 }]) {
    const opts = { viewport: { width: size.w, height: size.h }, locale: lang === 'vi' ? 'vi-VN' : 'en-US' };
    const ca = await browser.newContext(opts), cb = await browser.newContext(opts);
    const gfx = size.w < 700 ? '3d-low' : '3d-high';
    for (const c of [ca, cb]) await c.addInitScript((g: string) => { try { localStorage.setItem('marx.gfx', g); } catch { /* */ } }, gfx);
    const a = await ca.newPage(), b = await cb.newPage();
    const errs: string[] = [];
    a.on('pageerror', e => errs.push(e.message)); a.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    // slow only the big character files so the progress bar is caught part-way
    await a.route('**/models/characters/**', async r => { await new Promise(res => setTimeout(res, 1800)); await r.continue(); });
    const names = lang === 'vi' ? ['An', 'Bình'] : ['Ada', 'Boris'];
    await a.goto(base); await a.fill('#name', names[0]); await a.getByTestId('create').click();
    await a.waitForSelector('[data-testid=room-code]');
    const code = ((await a.textContent('[data-testid=room-code]')) ?? '').trim();
    await b.goto(base); await b.fill('#name', names[1]); await b.getByTestId('code-input').fill(code); await b.getByTestId('join').click();
    await a.getByTestId('add-bot').first().click(); await b.getByTestId('ready').click(); await a.getByTestId('start').click();
    await a.waitForSelector('[data-testid=board-loading]', { timeout: 8000 }).then(async () => { await a.waitForFunction(() => { const m = (document.querySelector('[data-testid=board-loading]')?.textContent ?? '').match(/(d+)%/); return !!m && Number(m[1]) > 0 && Number(m[1]) < 100; }, null, { timeout: 8000 }).catch(() => undefined); await a.screenshot({ path: `${out}/3d-loading-${lang === 'vi' ? 'vi-' : ''}${size.n}.png` }); }).catch(() => undefined);
    if (process.env.LOADING_ONLY) { await ca.close(); await cb.close(); continue; }
    await a.waitForSelector('[data-testid=board3d-canvas]', { timeout: 90000 });
    await a.waitForTimeout(2500);
    const room = mgr.rooms.get(code)!; const s = room.session!; const st = s.state;
    const pa = st.players.find(p => p.name === names[0])!, pb = st.players.find(p => p.name === names[1])!;
    const give = (p: typeof pa, ids: number[], levels: number[] = []) => ids.forEach((id, i) => { st.props[id].owner = p.id; st.props[id].level = levels[i] ?? 0; });
    give(pa, [11, 12, 13], [5, 3, 2]); give(pa, [31, 32, 34], [1, 0, 4]); give(pa, [37, 38, 39], [5, 5, 3]); give(pa, [5, 9]);
    give(pb, [16, 18, 19], [2, 1, 0]); give(pb, [21, 23, 24], [3, 5, 1]); give(pb, [1, 3], [1, 0]); give(pb, [15, 25]);
    st.props[37].mortgaged = true; st.props[3].mortgaged = true; st.props[24].mortgaged = true;
    pa.position = 12; pb.position = 23; st.round = 9; st.phase = 'post_roll'; st.rollAgain = false; st.turn = st.players.indexOf(pa);
    pa.cash = 2210; pb.cash = 840;
    s.setConnected(pa.id, false); s.setConnected(pa.id, true);
    await a.waitForFunction(() => (window as unknown as { __board3d: { isSettled(): boolean } }).__board3d.isSettled(), null, { timeout: 30000 });
    await a.waitForTimeout(6000);
    await a.screenshot({ path: `${out}/3d-buildings-${lang === 'vi' ? 'vi-' : ''}${size.n}.png`, fullPage: true });
    const m = await a.evaluate(() => (window as unknown as { __board3d: { measure(): unknown; getFps(): number } }).__board3d.measure());
    const fps = await a.evaluate(() => (document.querySelector('[data-testid=board]') as HTMLElement).dataset.fps);
    console.log(lang, size.n, 'fps', fps, 'errors', errs.slice(0, 3), JSON.stringify(m));
    await ca.close(); await cb.close();
  }
}
await browser.close(); await close(); server.close();
process.exit(0);
