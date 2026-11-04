import { GROUPS, SPACES, type Space } from '../board';
import { CARD_MAP, type Card } from '../cards';
import { GLOSSARY_MAP, type GlossaryEntry } from '../glossary';
import type { GroupId, Msg, MsgParam } from '../types';
import { CARDS_VI, GLOSSARY_VI, GROUPS_VI, SPACES_VI } from './content.vi';
import { en, type Key } from './en';
import { vi } from './vi';

export type Lang = 'en' | 'vi';
export const LANGS: Lang[] = ['en', 'vi'];
export type { Key };

const TABLE: Record<Lang, Record<Key, string>> = { en, vi };

export const isLang = (v: unknown): v is Lang => v === 'en' || v === 'vi';

/** Lower-case and strip diacritics, so "giá trị thặng dư" matches "gia tri thang du". */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}

// ---- localized content ----
export type LocalSpace = Omit<Space, 'group' | 'price' | 'kind' | 'id' | 'glossary'>;

export function localizedSpace(lang: Lang, id: number): LocalSpace & { id: number } {
  const sp = SPACES[id];
  if (lang === 'en') return { id, name: sp.name, shortName: sp.shortName, definition: sp.definition, explanation: sp.explanation, example: sp.example, mechanic: sp.mechanic };
  const v = SPACES_VI[id];
  const g = sp.group ? GROUPS_VI[sp.group] : null;
  return { id, name: v.name, shortName: v.shortName, definition: v.definition, example: v.example, explanation: v.explanation ?? g?.explanation ?? '', mechanic: v.mechanic ?? g?.mechanic ?? '' };
}

export function localizedGroup(lang: Lang, id: GroupId) {
  const g = GROUPS[id];
  return lang === 'en' ? { name: g.name, explanation: g.explanation, mechanic: g.mechanic } : GROUPS_VI[id];
}

export function localizedCard(lang: Lang, id: string): Card & { name: string } {
  const c = CARD_MAP[id];
  if (!c) return { id, name: id } as Card & { name: string };
  if (lang === 'en') return c;
  const v = CARDS_VI[id];
  return { ...c, name: v.name, description: v.description, explanation: v.explanation, example: v.example };
}

export function localizedTerm(lang: Lang, id: string): GlossaryEntry {
  const g = GLOSSARY_MAP[id];
  if (!g || lang === 'en') return g;
  const v = GLOSSARY_VI[id];
  return { id, term: v.term, definition: v.definition, example: v.example };
}

export const levelName = (lang: Lang, level: number) => TABLE[lang][`level.${level}` as Key];

// ---- translation ----
function render(lang: Lang, v: MsgParam, key: string): string {
  if (typeof v === 'object') return tm(lang, v);
  if (key === 'space' || key.startsWith('space')) return localizedSpace(lang, Number(v)).name;
  if (key === 'card') return localizedCard(lang, String(v)).name;
  if (key === 'group') return localizedGroup(lang, v as GroupId).name;
  if (key === 'source' && CARD_MAP[String(v)]) return localizedCard(lang, String(v)).name;
  return String(v);
}

export function format(lang: Lang, template: string, params?: Record<string, MsgParam>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? render(lang, params[k], k) : m));
}

/** Typed translation for keys known at compile time. */
export function t(lang: Lang, key: Key, params?: Record<string, MsgParam>): string {
  return format(lang, TABLE[lang][key] ?? en[key], params);
}

/** Translation for keys that arrive from the server at runtime. Unknown keys fall back to the key itself. */
export function tm(lang: Lang, msg: Msg): string {
  const tpl = (TABLE[lang] as Record<string, string>)[msg.key] ?? (en as Record<string, string>)[msg.key];
  return tpl === undefined ? msg.key : format(lang, tpl, msg.params);
}

export function errorText(lang: Lang, code: string, fallback?: string): string {
  const k = `err.${code}`;
  const tpl = (TABLE[lang] as Record<string, string>)[k];
  return tpl ?? fallback ?? t(lang, 'err.generic');
}

export function detectLang(stored: string | null, navLang: string | undefined): Lang {
  if (isLang(stored)) return stored;
  return (navLang ?? '').toLowerCase().startsWith('vi') ? 'vi' : 'en';
}
