import { useMemo } from 'react';
import { errorText, format, localizedCard, localizedGroup, localizedSpace, localizedTerm, t as tr, tm, type Key, type Lang } from '../shared/i18n';
import type { Msg, MsgParam } from '../shared/types';
import { useStore } from './store';

export function useL() {
  const lang = useStore(s => s.lang);
  return useMemo(() => ({
    lang,
    t: (key: Key, params?: Record<string, MsgParam>) => tr(lang, key, params),
    msg: (m: Msg) => tm(lang, m),
    space: (id: number) => localizedSpace(lang, id),
    card: (id: string) => localizedCard(lang, id),
    term: (id: string) => localizedTerm(lang, id),
    group: (id: Parameters<typeof localizedGroup>[1]) => localizedGroup(lang, id),
    err: (code: string, fallback?: string) => errorText(lang, code, fallback),
    fmt: (n: number) => `${n.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US')} cr`,
    format: (tpl: string, p?: Record<string, MsgParam>) => format(lang, tpl, p),
  }), [lang]);
}
export type L10n = ReturnType<typeof useL>;
export type { Lang };
