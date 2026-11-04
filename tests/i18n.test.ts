import { describe, expect, it } from 'vitest';
import { GROUPS, SPACES } from '../src/shared/board';
import { CARDS } from '../src/shared/cards';
import { GLOSSARY } from '../src/shared/glossary';
import { botAction } from '../src/shared/bot';
import { applyAction, createGame, currentActor } from '../src/shared/engine';
import { CARDS_VI, GLOSSARY_VI, GROUPS_VI, SPACES_VI } from '../src/shared/i18n/content.vi';
import { en } from '../src/shared/i18n/en';
import { vi } from '../src/shared/i18n/vi';
import { detectLang, errorText, fold, localizedCard, localizedSpace, localizedTerm, t, tm } from '../src/shared/i18n';
import { DEFAULT_SETTINGS } from '../src/shared/types';
import { OfflineProvider } from '../src/server/ai/offline';
import { buildPrompt, retrieveGlossary } from '../src/server/ai/context';
import { createAiService } from '../src/server/ai/service';
import { toPublic } from '../src/shared/engine';
import { give, mulberry, newGame } from './helpers';

const params = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map(m => m[1]).sort().join(',');
const enRec = en as Record<string, string>;
const viRec = vi as Record<string, string>;

describe('UI strings', () => {
  it('every English key exists in Vietnamese and the other way round', () => {
    expect(Object.keys(viRec).sort()).toEqual(Object.keys(enRec).sort());
  });
  it('placeholders match between languages and no string is empty', () => {
    for (const k of Object.keys(enRec)) {
      expect(enRec[k].length, k).toBeGreaterThan(0);
      expect(viRec[k].length, k).toBeGreaterThan(0);
      expect(params(viRec[k]), `params of ${k}`).toBe(params(enRec[k]));
    }
  });
  it('Vietnamese strings are not left in English (except a short allow-list)', () => {
    const same = new Set(['lang.en', 'lang.vi', 'lobby.bot', 'player.bot', 'lobby.ai_claude', 'chat.src_claude', 'reason.go', 'reason.card', 'reason.tax', 'idx.t', 'idx.l', 'gfx.2d']);
    const identical = Object.keys(enRec).filter(k => enRec[k] === viRec[k] && !same.has(k));
    expect(identical).toEqual([]);
  });
  it('uses the mandated terminology', () => {
    expect(viRec['mode.capitalist']).toBe('Cạnh tranh tư bản');
    expect(viRec['mode.sustainable']).toBe('Phát triển bền vững');
    expect(SPACES_VI[0].name).toBe('Tái sản xuất mở rộng');
    expect(SPACES_VI[10].name).toBe('Đình công');
    expect(SPACES_VI[20].name).toBe('Thị trường cạnh tranh tự do');
    expect(SPACES_VI[30].name).toBe('Điều tra chống độc quyền');
    expect(SPACES_VI[11].name).toBe('Tổ hợp khai thác than Hòn Gai');
    expect(GLOSSARY_VI['surplus-value'].term.toLowerCase()).toContain('giá trị thặng dư');
    expect(GLOSSARY_VI['constant-capital'].term.toLowerCase()).toContain('tư bản bất biến');
    expect(GLOSSARY_VI['variable-capital'].term.toLowerCase()).toContain('tư bản khả biến');
    expect(GLOSSARY_VI['organic-composition'].term.toLowerCase()).toContain('cấu tạo hữu cơ của tư bản');
    expect(GLOSSARY_VI['rate-of-profit'].term.toLowerCase()).toContain('tỷ suất lợi nhuận');
    expect(GLOSSARY_VI['cartel'].term).toBe('Các-ten');
    expect(GLOSSARY_VI['syndicate'].term).toBe('Xanh-đi-ca');
    expect(GLOSSARY_VI['trust'].term).toBe('Tờ-rớt');
    expect(GLOSSARY_VI['socialist-oriented-market-economy'].term).toBe('Kinh tế thị trường định hướng xã hội chủ nghĩa');
    expect(GLOSSARY_VI['industry-4-0'].term).toBe('Cách mạng công nghiệp 4.0');
  });
});

describe('game content', () => {
  const exceptions = new Set(['GO']);
  it('all 40 spaces are translated, differ from English, and short names fit', () => {
    expect(Object.keys(SPACES_VI)).toHaveLength(40);
    for (const sp of SPACES) {
      const v = localizedSpace('vi', sp.id);
      const e = localizedSpace('en', sp.id);
      for (const f of ['name', 'shortName', 'definition', 'explanation', 'example', 'mechanic'] as const) {
        expect(v[f].length, `${sp.id}.${f}`).toBeGreaterThan(0);
        if (!exceptions.has(v[f])) expect(v[f], `${sp.id}.${f}`).not.toBe(e[f]);
      }
      expect(v.shortName.length, `shortName ${sp.id}`).toBeLessThanOrEqual(24);
    }
  });
  it('all groups, cards and glossary terms are translated', () => {
    for (const g of Object.keys(GROUPS)) { expect(GROUPS_VI[g as keyof typeof GROUPS].name.length).toBeGreaterThan(0); }
    for (const c of CARDS) {
      const v = localizedCard('vi', c.id), e = localizedCard('en', c.id);
      for (const f of ['name', 'description', 'explanation', 'example'] as const) { expect(v[f].length).toBeGreaterThan(0); expect(v[f]).not.toBe(e[f]); }
    }
    expect(Object.keys(CARDS_VI)).toHaveLength(CARDS.length);
    for (const g of GLOSSARY) {
      const v = localizedTerm('vi', g.id);
      for (const f of ['term', 'definition', 'example'] as const) { expect(v[f].length).toBeGreaterThan(0); expect(v[f]).not.toBe(g[f]); }
    }
    expect(Object.keys(GLOSSARY_VI)).toHaveLength(GLOSSARY.length);
  });
  it('English content is unchanged', () => {
    expect(localizedSpace('en', 11).name).toBe('Hon Gai Coal Mining Complex');
    expect(localizedCard('en', 'obj-inflation').name).toBe('Inflation');
  });
});

describe('structured messages', () => {
  it('detects language: stored value, then navigator, then English', () => {
    expect(detectLang('vi', 'en-US')).toBe('vi');
    expect(detectLang(null, 'vi-VN')).toBe('vi');
    expect(detectLang(null, 'en-GB')).toBe('en');
    expect(detectLang('xx', undefined)).toBe('en');
  });
  it('error codes translate with an English fallback', () => {
    expect(errorText('vi', 'NOT_YOUR_TURN')).toBe('Chưa đến lượt bạn.');
    expect(errorText('en', 'NOT_YOUR_TURN')).toBe('It is not your turn to act.');
    expect(errorText('vi', 'SOMETHING_NEW', 'fallback text')).toBe('fallback text');
  });
  it('engine log entries and debt reasons render in both languages, with no leftover placeholders', () => {
    const rng = mulberry(5);
    let s = createGame(Array.from({ length: 3 }, (_, i) => ({ id: 'b' + i, name: 'Bot' + i, avatar: i, isBot: true })), { ...DEFAULT_SETTINGS, mode: 'sustainable' }, rng);
    const keys = new Set<string>();
    const render = (key: string, params: Record<string, never> | undefined) => {
      keys.add(key);
      for (const lang of ['en', 'vi'] as const) {
        const text = tm(lang, { key, params: params as never });
        expect(text, key).not.toBe(key);
        expect(text, `${lang} ${key}`).not.toMatch(/\{\w+\}/);
        expect(text, `${lang} ${key}`).not.toContain('undefined');
      }
    };
    for (let i = 0; i < 4000 && s.phase !== 'finished'; i++) {
      const actor = currentActor(s)!;
      const r = applyAction(s, actor, botAction(s, actor)!, rng);
      s = r.state;
      for (const e of r.events) if (e.type === 'log') render(e.key, e.params as never);
      for (const d of s.debts) render(d.reason.key, d.reason.params as never);
    }
    for (const l of s.log) render(l.key, l.params as never);
    expect(keys.size).toBeGreaterThan(12);
    expect(tm('vi', { key: 'log.buy', params: { name: 'An', space: 1, price: 60 } })).toBe('An mua Xưởng thủ công với giá 60 cr.');
    expect(tm('en', { key: 'log.buy', params: { name: 'An', space: 1, price: 60 } })).toBe('An buys Handicraft Workshop for 60 cr.');
    expect(tm('vi', { key: 'log.owes', params: { name: 'An', amount: 25, reason: { key: 'reason.rent', params: { space: 5 } } } })).toContain('Tiền thuê Đường sắt cơ khí hóa');
  });
  it('the engine no longer emits display text in messages', () => {
    const s = newGame(2);
    s.players[0].position = 39;
    const r = applyAction(s, 'p0', { type: 'roll' }, () => 0.01);
    for (const e of r.events) if (e.type === 'log') expect(e.key).toMatch(/^log\./);
    expect(r.state.log.every(l => l.key.startsWith('log.'))).toBe(true);
    expect(give).toBeTruthy();
  });
});

describe('offline assistant in two languages', () => {
  const off = new OfflineProvider();
  const ask = (question: string, lang: 'en' | 'vi', spaceId?: number) => off.complete({ system: '', prompt: '', maxTokens: 1, ctx: { kind: 'tutor', lang, question, spaceId } });
  it('tutor matches with diacritics, without diacritics and in English', async () => {
    expect(fold('Giá trị thặng dư')).toBe('gia tri thang du');
    expect(await ask('giá trị thặng dư là gì?', 'vi')).toContain('Giá trị thặng dư');
    expect(await ask('gia tri thang du la gi', 'vi')).toContain('Giá trị thặng dư');
    expect(await ask('What is surplus value?', 'en')).toContain('Surplus value');
    // asking in Vietnamese but reading in English still finds the concept
    expect(await ask('gia tri thang du', 'en')).toContain('Surplus value');
    expect(await ask('cau tao huu co cua tu ban', 'vi')).toContain('Cấu tạo hữu cơ');
    expect(await ask('xanh-di-ca la gi', 'vi')).toContain('Xanh-đi-ca');
  });
  it('tutor answers about a space in the requested language', async () => {
    expect(await ask('giải thích', 'vi', 16)).toContain('Liên minh giá các-ten');
    expect(await ask('explain', 'en', 16)).toContain('Cartel Price Alliance');
    expect(await ask('qqqq zzzz', 'vi')).toContain('Tôi không tìm thấy');
  });
  it('retrieval works for ranked results', () => {
    expect(retrieveGlossary('gia tri thang du')[0].id).toBe('surplus-value');
    expect(retrieveGlossary('tu ban bat bien')[0].id).toBe('constant-capital');
  });
  it('advisor and narrator follow the language', async () => {
    const s = newGame(2); give(s, 'p0', [11, 12]); give(s, 'p1', [13]); s.players[0].position = 9;
    const state = toPublic(s, { deadline: null });
    const a = await off.complete({ system: '', prompt: '', maxTokens: 1, ctx: { kind: 'advisor', lang: 'vi', state, playerId: 'p0' } });
    expect(a).toContain('Công nghiệp nặng');
    const n = await off.complete({ system: '', prompt: '', maxTokens: 1, ctx: { kind: 'narrator', lang: 'vi', state, events: [{ type: 'card', playerId: 'p0', cardId: 'obj-inflation', deck: 'objective' }] } });
    expect(n).toContain('Lạm phát');
  });
  it('Claude prompts carry the language and terminology per request while the system prompt stays stable', () => {
    const vi1 = buildPrompt({ kind: 'tutor', lang: 'vi', question: 'giá trị thặng dư' });
    const en1 = buildPrompt({ kind: 'tutor', lang: 'en', question: 'surplus value' });
    expect(vi1.system).toBe(en1.system);
    expect(vi1.prompt).toContain('Vietnamese');
    expect(vi1.prompt).toContain('cấu tạo hữu cơ của tư bản');
    expect(en1.prompt).toContain('Answer in English');
  });
  it('narration costs no room budget offline, and counts when Claude is used', async () => {
    const room = { aiCount: 0, session: null } as never as { aiCount: number; session: null };
    const svc = createAiService({ maxPerRoom: 5 });
    await svc.narrate(room as never, newGame(2), [{ type: 'gameover', winnerId: null }], 'vi');
    expect(room.aiCount).toBe(0);
    const svc2 = createAiService({ maxPerRoom: 5, remote: { name: 'claude', complete: async () => 'ok' } });
    await svc2.narrate(room as never, newGame(2), [{ type: 'gameover', winnerId: null }], 'en');
    expect(room.aiCount).toBe(1);
    expect(t('vi', 'status.roll')).toContain('xúc xắc');
  });
});
