import { GROUPS, GROUP_SPACES, SPACES } from '../../shared/board';
import { CARD_MAP } from '../../shared/cards';
import { GLOSSARY_MAP } from '../../shared/glossary';
import { financials, getPlayer, ownedBy, rentFor } from '../../shared/rules';
import type { GameState, PublicGameState } from '../../shared/types';
import { findCards, findSpaces, retrieveGlossary } from './context';
import type { AiContext, AiProvider, CompleteRequest } from './provider';

function tutor(ctx: AiContext): string {
  const q = ctx.question ?? '';
  const out: string[] = [];
  const spaces = ctx.spaceId != null ? [SPACES[ctx.spaceId]] : findSpaces(q);
  for (const s of spaces) {
    out.push(`${s.name}: ${s.definition} ${s.explanation} Example: ${s.example} In the game: ${s.mechanic}`);
    if (s.glossary && GLOSSARY_MAP[s.glossary]) out.push(`Key concept, ${GLOSSARY_MAP[s.glossary].term}: ${GLOSSARY_MAP[s.glossary].definition}`);
  }
  for (const c of findCards(q)) out.push(`Card "${c.name}": ${c.explanation} Example: ${c.example}`);
  for (const g of retrieveGlossary(q, spaces.length ? 1 : 2)) out.push(`${g.term}: ${g.definition} Example: ${g.example}`);
  if (!out.length) {
    return 'I could not find that in the glossary. Try asking about a concept such as surplus value, organic composition of capital, monopoly, cartel, trust, or expanded reproduction, or click a board space and ask about it.';
  }
  return out.join('\n\n');
}

function advisor(ctx: AiContext): string {
  const st = ctx.state as unknown as GameState | undefined;
  const pid = ctx.playerId;
  const me = st && pid ? getPlayer(st, pid) : undefined;
  if (!st || !me) return 'Join a game to get advice.';
  if (me.bankrupt) return 'You are out of the game. Watch how the others manage their capital.';
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
  if (worst.rent > 0) {
    tips.push(worst.rent >= me.cash * 0.5
      ? `Risk: ${SPACES[worst.id].name} ahead can charge about ${worst.rent} cr, more than half of your ${me.cash} cr. Keep a cash buffer or mortgage something you do not need.`
      : `Watch out for ${SPACES[worst.id].name} ahead: rent could be about ${worst.rent} cr. Your ${me.cash} cr can cover it.`);
  }

  // near-complete groups
  for (const g of Object.keys(GROUP_SPACES) as (keyof typeof GROUP_SPACES)[]) {
    const ids = GROUP_SPACES[g];
    const mine = ids.filter(id => st.props[id].owner === me.id);
    const missing = ids.filter(id => st.props[id].owner !== me.id);
    if (mine.length > 0 && missing.length === 1) {
      const owner = st.props[missing[0]].owner;
      tips.push(`You are one space short of the ${GROUPS[g].name} group (${SPACES[missing[0]].name}${owner ? ' is held by ' + (getPlayer(st, owner)?.name ?? 'another player') : ' is still free'}). Completing it doubles base rent and unlocks development.`);
      break;
    }
  }

  // development
  const full = (Object.keys(GROUP_SPACES) as (keyof typeof GROUP_SPACES)[]).filter(g => GROUP_SPACES[g].every(id => st.props[id].owner === me.id));
  if (full.length) {
    const g = GROUPS[full[0]];
    tips.push(me.cash - g.buildCost > 200
      ? `You own all of ${g.name}. Developing it costs ${g.buildCost} cr per level; its organic composition is ${g.ocLabel} and the rate of surplus value is ${Math.round(g.mPrime * 100)}%, so higher levels raise rent a lot.`
      : `You own all of ${g.name} but cash is tight. Build when you keep more than 200 cr in reserve.`);
  }

  const mortgaged = ownedBy(st, me.id).filter(id => st.props[id].mortgaged);
  if (mortgaged.length && me.cash > 600) tips.push(`You can afford to redeem ${SPACES[mortgaged[0]].name}; mortgaged spaces earn no rent.`);
  if (me.indices.laborRelations < 25) tips.push('Labor relations are below 25: your rents are cut by 15%. A Labor protection policy or socially positive groups can repair it.');
  if (st.settings.mode === 'sustainable') {
    const weak = (['technology', 'laborRelations', 'socialContribution', 'sustainability'] as ('technology' | 'laborRelations' | 'socialContribution' | 'sustainability')[]).sort((a, b) => me.indices[a] - me.indices[b])[0];
    tips.push(`In Sustainable Development, score balances money (35%), social (25%), technology (20%) and sustainability (20%). Your weakest index is ${weak} at ${me.indices[weak]}.`);
  }
  if (!tips.length) tips.push(`You have ${me.cash} cr and a net worth of ${f.netWorth}. Buy spaces that complete a group, and keep about 200 cr in reserve.`);
  return tips.slice(0, 4).map(t => '- ' + t).join('\n');
}

function narrator(ctx: AiContext): string {
  const ev = ctx.events ?? [];
  const names = (id: string) => ctx.state?.players.find(p => p.id === id)?.name ?? 'A player';
  const card = ev.find(e => e.type === 'card');
  if (card && card.type === 'card') {
    const c = CARD_MAP[card.cardId];
    return `${names(card.playerId)} turns over "${c.name}". ${c.explanation}`;
  }
  const b = ev.find(e => e.type === 'bankrupt');
  if (b && b.type === 'bankrupt') return `${names(b.playerId)} has gone bankrupt. In a competitive market, capital that cannot be recovered is swallowed by stronger rivals.`;
  const g = ev.find(e => e.type === 'gameover');
  if (g && g.type === 'gameover') return g.winnerId ? `${names(g.winnerId)} ends the game on top. Check the summary for the concepts you met.` : 'The game is over. Check the summary for the concepts you met.';
  return '';
}

export class OfflineProvider implements AiProvider {
  readonly name = 'offline';
  async complete(req: CompleteRequest): Promise<string> {
    const ctx = req.ctx;
    if (!ctx) return 'The offline assistant needs a question.';
    if (ctx.kind === 'tutor') return tutor(ctx);
    if (ctx.kind === 'advisor') return advisor(ctx as AiContext & { state: PublicGameState });
    return narrator(ctx);
  }
}
