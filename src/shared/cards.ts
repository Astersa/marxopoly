import { z } from 'zod';
import { GLOSSARY_MAP } from './glossary';

const target = z.enum(['self', 'all', 'others']);
const indexKey = z.enum(['technology', 'laborRelations', 'socialContribution', 'sustainability']);

export const EffectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('cash'), amount: z.number().int(), target: target.optional() }),
  z.object({ type: z.literal('cashPercent'), percent: z.number(), cap: z.number().int().positive(), target: target.optional() }),
  z.object({ type: z.literal('cashPerLevel'), perLevel: z.number().int(), target: target.optional() }),
  z.object({ type: z.literal('collectFromOthers'), amount: z.number().int().positive() }),
  z.object({ type: z.literal('index'), index: indexKey, delta: z.number().int(), target: target.optional() }),
  z.object({ type: z.literal('move'), to: z.number().int().min(0).max(39), collectGo: z.boolean() }),
  z.object({ type: z.literal('moveBy'), steps: z.number().int() }),
  z.object({ type: z.literal('moveToNearest'), kind: z.enum(['station', 'utility']) }),
  z.object({ type: z.literal('jail') }),
  z.object({ type: z.literal('jailFreeCard') }),
  z.object({ type: z.literal('depreciate'), levels: z.number().int().positive() }),
  z.object({ type: z.literal('modifier'), modifier: z.enum(['rent', 'develop_cost', 'go_reward']), multiplier: z.number().positive(), rounds: z.number().int().positive() }),
]);
export type Effect = z.infer<typeof EffectSchema>;

export const CardSchema = z.object({
  id: z.string().min(1),
  deck: z.enum(['objective', 'policy']),
  topic: z.string().refine(t => t in GLOSSARY_MAP, 'topic must be a glossary id'),
  name: z.string().min(1),
  description: z.string().min(1),
  explanation: z.string().min(1),
  example: z.string().min(1),
  effects: z.array(EffectSchema).min(1),
  target: target,
  duration: z.number().int().min(0),
});
export type Card = z.infer<typeof CardSchema>;

type C = Omit<Card, 'deck'>;
const objective: C[] = [
  { id: 'obj-crisis', topic: 'overproduction-crisis', name: 'Economic crisis', target: 'all', duration: 2,
    description: 'A crisis hits. Everyone loses 10% of their cash (max 150 cr) and rents fall by 20% for 2 rounds.',
    explanation: 'Capitalist crises break out when production outruns solvent demand. Sales stall, firms go bankrupt and incomes fall.',
    example: 'The crash of 1929 and the Great Depression.',
    effects: [{ type: 'cashPercent', percent: -10, cap: 150, target: 'all' }, { type: 'modifier', modifier: 'rent', multiplier: 0.8, rounds: 2 }] },
  { id: 'obj-tech', topic: 'industry-4-0', name: 'Technological innovation', target: 'self', duration: 2,
    description: 'Your lab makes a breakthrough. Technology +8 and development costs 20% less for 2 rounds.',
    explanation: 'New technology raises labor productivity and cuts individual value below social value, giving the innovator extra surplus value for a time.',
    example: 'The first firm to adopt electric motors cut its unit costs below its rivals.',
    effects: [{ type: 'index', index: 'technology', delta: 8, target: 'self' }, { type: 'modifier', modifier: 'develop_cost', multiplier: 0.8, rounds: 2 }] },
  { id: 'obj-depreciation', topic: 'depreciation', name: 'Depreciation of fixed capital', target: 'self', duration: 0,
    description: 'A rival invents better machines. Your most developed property loses 1 level to moral depreciation.',
    explanation: 'Fixed capital loses value not only by wear but when newer machines make it obsolete (moral depreciation).',
    example: 'Mechanical typewriters became worthless once computers arrived.',
    effects: [{ type: 'depreciate', levels: 1 }] },
  { id: 'obj-inflation', topic: 'inflation', name: 'Inflation', target: 'all', duration: 0,
    description: 'Prices spiral up. Every player pays 50 cr.',
    explanation: 'When prices rise, money buys less. Costs of materials and living go up for everyone.',
    example: 'Food and energy prices climbing faster than wages.',
    effects: [{ type: 'cash', amount: -50, target: 'all' }] },
  { id: 'obj-overproduction', topic: 'overproduction-crisis', name: 'Overproduction', target: 'all', duration: 3,
    description: 'Warehouses overflow with unsold goods. All rents fall by 25% for 3 rounds.',
    explanation: 'Production grows without limit, but the buying power of working people stays narrow. Goods cannot be sold at a profit.',
    example: 'Mountains of unsold cars and grain in the 1930s.',
    effects: [{ type: 'modifier', modifier: 'rent', multiplier: 0.75, rounds: 3 }] },
  { id: 'obj-capital-export', topic: 'capital-export', name: 'Capital export', target: 'self', duration: 0,
    description: 'Your investment abroad pays off. Collect 80 cr and advance to the nearest port or station.',
    explanation: 'Monopolies with surplus capital invest abroad where labor and raw materials are cheap, earning higher profit.',
    example: 'A foreign car maker opening an assembly plant overseas.',
    effects: [{ type: 'cash', amount: 80, target: 'self' }, { type: 'moveToNearest', kind: 'station' }] },
  { id: 'obj-supply-chain', topic: 'supply-demand', name: 'Supply chain disruption', target: 'all', duration: 2,
    description: 'Shipping stalls. Everyone pays 60 cr and development costs 25% more for 2 rounds.',
    explanation: 'Production depends on a chain of inputs. A break in one link raises costs for everyone downstream.',
    example: 'The 2021 shortage of computer chips halting car factories.',
    effects: [{ type: 'cash', amount: -60, target: 'all' }, { type: 'modifier', modifier: 'develop_cost', multiplier: 1.25, rounds: 2 }] },
  { id: 'obj-expansion', topic: 'expanded-reproduction', name: 'Expanded reproduction', target: 'self', duration: 0,
    description: 'Reinvested profit scales production. Advance to GO and collect your reward.',
    explanation: 'When surplus value is turned into new capital, production grows each cycle.',
    example: 'A company reinvesting profit into a second factory.',
    effects: [{ type: 'move', to: 0, collectGo: true }] },
  { id: 'obj-collective', topic: 'labor-protection', name: 'Collective agreement', target: 'self', duration: 0,
    description: 'A strike is settled in your favor. Keep this card to leave the Labor Strike for free.',
    explanation: 'Workers organized in unions bargain for wages and conditions, softening the conflict with capital.',
    example: 'A union and an employer signing a wage agreement.',
    effects: [{ type: 'jailFreeCard' }] },
  { id: 'obj-strike', topic: 'labor-protection', name: 'General strike', target: 'self', duration: 0,
    description: 'Your workers walk out. Go to the Labor Strike without passing GO.',
    explanation: 'When wages and conditions are neglected, workers stop work. Production halts and profit stops with it.',
    example: 'The 1886 eight-hour day strikes.',
    effects: [{ type: 'jail' }] },
];

const policy: C[] = [
  { id: 'pol-supply-demand', topic: 'supply-demand', name: 'Supply and demand', target: 'self', duration: 3,
    description: 'Demand for your goods surges. Your rents are 20% higher for 3 rounds.',
    explanation: 'When demand exceeds supply, prices rise above value and sellers earn extra.',
    example: 'Rice prices rising after a poor harvest.',
    effects: [{ type: 'modifier', modifier: 'rent', multiplier: 1.2, rounds: 3 }] },
  { id: 'pol-capital-efficiency', topic: 'rate-of-profit', name: 'Capital efficiency', target: 'self', duration: 0,
    description: 'Efficient use of capital pays: collect 20 cr per development level you own.',
    explanation: 'The rate of profit measures return on all capital advanced. Using capital better raises it.',
    example: 'A plant that cuts idle time and wasted material.',
    effects: [{ type: 'cashPerLevel', perLevel: 20, target: 'self' }] },
  { id: 'pol-taxation', topic: 'taxation', name: 'Taxation', target: 'all', duration: 0,
    description: 'A new tax. Every player pays 5% of cash (max 100 cr) and social contribution +1.',
    explanation: 'The state collects taxes to fund public goods and to redistribute income.',
    example: 'Corporate income tax funding roads and schools.',
    effects: [{ type: 'cashPercent', percent: -5, cap: 100, target: 'all' }, { type: 'index', index: 'socialContribution', delta: 1, target: 'all' }] },
  { id: 'pol-welfare', topic: 'social-welfare', name: 'Social welfare', target: 'self', duration: 0,
    description: 'You fund workers\' housing and health. Pay 80 cr; social contribution +6, labor relations +3.',
    explanation: 'Social welfare improves living standards and eases class tension, a goal of socialist-oriented policy.',
    example: 'Employer-funded health insurance and housing for workers.',
    effects: [{ type: 'cash', amount: -80, target: 'self' }, { type: 'index', index: 'socialContribution', delta: 6, target: 'self' }, { type: 'index', index: 'laborRelations', delta: 3, target: 'self' }] },
  { id: 'pol-public-investment', topic: 'public-investment', name: 'Public investment', target: 'self', duration: 0,
    description: 'The state builds infrastructure near you. Collect 100 cr and technology +3.',
    explanation: 'Public investment in roads, grids and research lowers costs for all firms and lifts productivity.',
    example: 'A new highway and power line serving an industrial zone.',
    effects: [{ type: 'cash', amount: 100, target: 'self' }, { type: 'index', index: 'technology', delta: 3, target: 'self' }] },
  { id: 'pol-green', topic: 'green-economy', name: 'Green economy', target: 'self', duration: 2,
    description: 'You switch to clean production. Pay 60 cr; sustainability +8; development costs 15% less for 2 rounds.',
    explanation: 'A green economy cuts emissions and resource use while keeping growth going, with the state subsidizing the shift.',
    example: 'Replacing a coal boiler with solar power and heat pumps.',
    effects: [{ type: 'cash', amount: -60, target: 'self' }, { type: 'index', index: 'sustainability', delta: 8, target: 'self' }, { type: 'modifier', modifier: 'develop_cost', multiplier: 0.85, rounds: 2 }] },
  { id: 'pol-labor', topic: 'labor-protection', name: 'Labor protection', target: 'self', duration: 0,
    description: 'You raise wages and safety. Pay 60 cr; labor relations +8.',
    explanation: 'Labor law limits the exploitation of workers by setting wages, hours and safety standards.',
    example: 'A minimum wage and mandatory safety gear.',
    effects: [{ type: 'cash', amount: -60, target: 'self' }, { type: 'index', index: 'laborRelations', delta: 8, target: 'self' }] },
  { id: 'pol-fin-reg', topic: 'financial-regulation', name: 'Financial regulation', target: 'all', duration: 2,
    description: 'Speculation is curbed. Everyone pays 5% of cash (max 80 cr) and GO rewards are 25% higher for 2 rounds.',
    explanation: 'Regulating banks and markets limits bubbles and keeps credit flowing to productive investment.',
    example: 'Capital requirements introduced after the 2008 crisis.',
    effects: [{ type: 'cashPercent', percent: -5, cap: 80, target: 'all' }, { type: 'modifier', modifier: 'go_reward', multiplier: 1.25, rounds: 2 }] },
  { id: 'pol-subsidy', topic: 'knowledge-economy', name: 'Innovation subsidy', target: 'self', duration: 0,
    description: 'A research grant arrives. Collect 80 cr and technology +4.',
    explanation: 'In the knowledge economy, state funding for research speeds the growth of productive forces.',
    example: 'A grant for a university-industry AI lab.',
    effects: [{ type: 'cash', amount: 80, target: 'self' }, { type: 'index', index: 'technology', delta: 4, target: 'self' }] },
  { id: 'pol-antitrust', topic: 'monopoly', name: 'Anti-monopoly fine', target: 'self', duration: 0,
    description: 'Regulators fine your market dominance. Pay 100 cr and move back 3 spaces.',
    explanation: 'Competition law restrains abuse of monopoly power such as price fixing.',
    example: 'A fine on a cartel for fixing prices.',
    effects: [{ type: 'cash', amount: -100, target: 'self' }, { type: 'moveBy', steps: -3 }] },
  { id: 'pol-solidarity', topic: 'socialist-oriented-market-economy', name: 'Cooperative dividend', target: 'self', duration: 0,
    description: 'Cooperatives share their gains. Collect 30 cr from every other player; social contribution +3.',
    explanation: 'In a socialist-oriented market economy, cooperatives and collective forms share income among members.',
    example: 'A farmers\' cooperative paying a year-end dividend.',
    effects: [{ type: 'collectFromOthers', amount: 30 }, { type: 'index', index: 'socialContribution', delta: 3, target: 'self' }] },
];

export function validateCards(cards: unknown[]): Card[] {
  const parsed = cards.map(c => CardSchema.parse(c));
  const ids = new Set(parsed.map(c => c.id));
  if (ids.size !== parsed.length) throw new Error('duplicate card ids');
  return parsed;
}

export const CARDS: Card[] = validateCards([
  ...objective.map(c => ({ ...c, deck: 'objective' as const })),
  ...policy.map(c => ({ ...c, deck: 'policy' as const })),
]);
export const CARD_MAP: Record<string, Card> = Object.fromEntries(CARDS.map(c => [c.id, c]));
export const deckCards = (deck: 'objective' | 'policy') => CARDS.filter(c => c.deck === deck);
