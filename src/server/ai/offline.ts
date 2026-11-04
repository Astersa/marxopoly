import { GROUPS, GROUP_SPACES, SPACES } from '../../shared/board';
import { CARD_MAP } from '../../shared/cards';
import { localizedCard, localizedGroup, localizedSpace, localizedTerm, t, type Lang } from '../../shared/i18n';
import { financials, getPlayer, ownedBy, rentFor } from '../../shared/rules';
import type { GameState, PublicGameState } from '../../shared/types';
import { findCards, findSpaces, retrieveGlossary } from './context';
import type { AiContext, AiProvider, CompleteRequest } from './provider';

function tutor(ctx: AiContext, lang: Lang): string {
  const q = ctx.question ?? '';
  const out: string[] = [];
  const spaces = ctx.spaceId != null ? [SPACES[ctx.spaceId]] : findSpaces(q);
  for (const s of spaces) {
    const ls = localizedSpace(lang, s.id);
    out.push(t(lang, 'ai.tutor_space', { name: ls.name, definition: ls.definition, explanation: ls.explanation, example: ls.example, mechanic: ls.mechanic }));
    if (s.glossary) { const g = localizedTerm(lang, s.glossary); if (g) out.push(t(lang, 'ai.tutor_concept', { term: g.term, definition: g.definition })); }
  }
  for (const c of findCards(q)) { const lc = localizedCard(lang, c.id); out.push(t(lang, 'ai.tutor_card', { name: lc.name, explanation: lc.explanation, example: lc.example })); }
  for (const g of retrieveGlossary(q, spaces.length ? 1 : 2)) { const e = localizedTerm(lang, g.id); out.push(t(lang, 'ai.tutor_term', { term: e.term, definition: e.definition, example: e.example })); }
  return out.length ? out.join('\n\n') : t(lang, 'ai.tutor_none');
}

function advisor(ctx: AiContext, lang: Lang): string {
  const st = ctx.state as unknown as GameState | undefined;
  const pid = ctx.playerId;
  const me = st && pid ? getPlayer(st, pid) : undefined;
  if (!st || !me) return t(lang, 'ai.adv_join');
  if (me.bankrupt) return t(lang, 'ai.adv_out');
  const tips: string[] = [];
  const f = financials(st, me.id);

  // risk: nearby opponent rent
  let worst = { id: -1, rent: 0 };
  for (let step = 2; step <= 12; step++) {
    const id = (me.position + step) % 40;
    const pr = st.props[id];
    if (pr?.owner && pr.owner !== me.id) {
      const r = rentFor(st, id, 7);
      if (r > worst.rent) worst = { id, rent: r };
    }
  }
  if (worst.rent > 0) tips.push(t(lang, worst.rent >= me.cash * 0.5 ? 'ai.adv_risk_high' : 'ai.adv_risk_low', { space: worst.id, rent: worst.rent, cash: me.cash }));

  // near-complete groups
  for (const g of Object.keys(GROUP_SPACES) as (keyof typeof GROUP_SPACES)[]) {
    const ids = GROUP_SPACES[g];
    const mine = ids.filter(id => st.props[id].owner === me.id);
    const missing = ids.filter(id => st.props[id].owner !== me.id);
    if (mine.length > 0 && missing.length === 1) {
      const owner = st.props[missing[0]].owner;
      tips.push(owner
        ? t(lang, 'ai.adv_group_held', { group: g, space: missing[0], owner: getPlayer(st, owner)?.name ?? t(lang, 'ai.player') })
        : t(lang, 'ai.adv_group_free', { group: g, space: missing[0] }));
      break;
    }
  }

  // development
  const full = (Object.keys(GROUP_SPACES) as (keyof typeof GROUP_SPACES)[]).filter(g => GROUP_SPACES[g].every(id => st.props[id].owner === me.id));
  if (full.length) {
    const g = GROUPS[full[0]];
    tips.push(me.cash - g.buildCost > 200
      ? t(lang, 'ai.adv_dev_ok', { group: g.id, cost: g.buildCost, oc: g.ocLabel, m: Math.round(g.mPrime * 100) })
      : t(lang, 'ai.adv_dev_tight', { group: g.id }));
  }

  const mortgaged = ownedBy(st, me.id).filter(id => st.props[id].mortgaged);
  if (mortgaged.length && me.cash > 600) tips.push(t(lang, 'ai.adv_redeem', { space: mortgaged[0] }));
  if (me.indices.laborRelations < 25) tips.push(t(lang, 'ai.adv_labor'));
  if (st.settings.mode === 'sustainable') {
    const keys = ['technology', 'laborRelations', 'socialContribution', 'sustainability'] as ('technology' | 'laborRelations' | 'socialContribution' | 'sustainability')[];
    const weak = keys.sort((a, b) => me.indices[a] - me.indices[b])[0];
    tips.push(t(lang, 'ai.adv_sus', { index: t(lang, `idx.${weak}` as const), value: me.indices[weak] }));
  }
  if (!tips.length) tips.push(t(lang, 'ai.adv_default', { cash: me.cash, nw: f.netWorth }));
  return tips.slice(0, 4).map(x => '- ' + x).join('\n');
}

function narrator(ctx: AiContext, lang: Lang): string {
  const ev = ctx.events ?? [];
  const names = (id: string) => ctx.state?.players.find(p => p.id === id)?.name ?? t(lang, 'ai.player');
  const card = ev.find(e => e.type === 'card');
  if (card && card.type === 'card') {
    const c = localizedCard(lang, card.cardId);
    return t(lang, 'ai.narr_card', { name: names(card.playerId), card: c.name, explanation: c.explanation });
  }
  const b = ev.find(e => e.type === 'bankrupt');
  if (b && b.type === 'bankrupt') return t(lang, 'ai.narr_bankrupt', { name: names(b.playerId) });
  const g = ev.find(e => e.type === 'gameover');
  if (g && g.type === 'gameover') return g.winnerId ? t(lang, 'ai.narr_win', { name: names(g.winnerId) }) : t(lang, 'ai.narr_over');
  return '';
}

export class OfflineProvider implements AiProvider {
  readonly name = 'offline';
  async complete(req: CompleteRequest): Promise<string> {
    const ctx = req.ctx;
    const lang: Lang = ctx?.lang ?? 'en';
    if (!ctx) return t(lang, 'ai.need_q');
    if (ctx.kind === 'tutor') return tutor(ctx, lang);
    if (ctx.kind === 'advisor') return advisor(ctx as AiContext & { state: PublicGameState }, lang);
    return narrator(ctx, lang);
  }
}

export { CARD_MAP, localizedGroup };
