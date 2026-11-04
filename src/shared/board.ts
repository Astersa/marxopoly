import type { GroupId, Indices, SpaceKind } from './types';

export const BOARD_SIZE = 40;
export const JAIL_POS = 10;
export const GO_REWARD = 200;
export const JAIL_FINE = 50;
export const START_CASH = 1500;
export const STATION_PRICE = 200;
export const UTILITY_PRICE = 150;

export interface GroupInfo {
  id: GroupId;
  name: string;
  color: string;
  prices: number[];
  buildCost: number;
  /** organic composition c/v as a number */
  ocValue: number;
  ocLabel: string;
  /** rate of surplus value m' as a ratio (0.5 = 50%) */
  mPrime: number;
  /** effect on [technology, laborRelations, socialContribution, sustainability] per level and on purchase */
  impact: Indices;
  glossary: string;
  explanation: string;
  mechanic: string;
}

const imp = (t: number, l: number, s: number, u: number): Indices => ({ technology: t, laborRelations: l, socialContribution: s, sustainability: u });

export const GROUPS: Record<GroupId, GroupInfo> = {
  G1: { id: 'G1', name: 'Primitive Production', color: '#8b5a2b', prices: [60, 80], buildCost: 50, ocValue: 1 / 3, ocLabel: '1:3', mPrime: 0.5, impact: imp(0, 1, 1, 1), glossary: 'primitive-accumulation',
    explanation: 'Early capitalism rests on small workshops and manufactories where labor does most of the work and machines are few. Capital is scarce and gathered by force and trade.',
    mechanic: 'Cheap to buy and develop, low surplus value, and gentle on labor and the environment. A safe start with low rent.' },
  G2: { id: 'G2', name: 'Market Economy', color: '#3aa6c9', prices: [100, 120], buildCost: 50, ocValue: 2, ocLabel: '2:1', mPrime: 0.8, impact: imp(1, 0, 1, 0), glossary: 'law-of-value',
    explanation: 'Free competition: many producers sell commodities whose prices move around value under supply and demand.',
    mechanic: 'Balanced growth with a small technology gain per level.' },
  G3: { id: 'G3', name: 'Heavy Industry', color: '#e0782b', prices: [140, 150, 170], buildCost: 100, ocValue: 5, ocLabel: '5:1', mPrime: 1.0, impact: imp(2, -1, 1, -3), glossary: 'organic-composition',
    explanation: 'Machine industry raises the organic composition of capital: far more is spent on machines and materials than on wages, and output and pollution grow together.',
    mechanic: 'Strong technology gain and solid rent, but it hurts sustainability and labor relations.' },
  G4: { id: 'G4', name: 'Monopoly Organizations', color: '#c43a54', prices: [180, 190, 210], buildCost: 100, ocValue: 6, ocLabel: '6:1', mPrime: 1.5, impact: imp(1, -3, -2, -1), glossary: 'monopoly',
    explanation: 'Concentration of capital produces cartels, syndicates and trusts that dominate markets and extract monopoly profit.',
    mechanic: 'High rent from market power, paid for with labor relations and social contribution.' },
  G5: { id: 'G5', name: 'Financial Capital', color: '#6a3fa0', prices: [220, 230, 250], buildCost: 150, ocValue: 8, ocLabel: '8:1', mPrime: 1.8, impact: imp(1, -2, -2, 0), glossary: 'financial-capital',
    explanation: 'Banks and industry fuse into financial capital, ruled by a financial oligarchy that profits from loans, shares and speculation.',
    mechanic: 'Very high rent and surplus rate with a social cost.' },
  G6: { id: 'G6', name: 'State Monopoly Capitalism', color: '#2f7d5b', prices: [260, 270, 290], buildCost: 150, ocValue: 6, ocLabel: '6:1', mPrime: 1.2, impact: imp(1, 0, 2, -1), glossary: 'state-monopoly-capitalism',
    explanation: 'The state and big monopolies merge: public procurement, subsidies and state-owned industry support private accumulation.',
    mechanic: 'Reliable rent with positive social contribution and a moderate environmental cost.' },
  G7: { id: 'G7', name: 'Socialist-Oriented Market Economy', color: '#d9b21f', prices: [300, 310, 330], buildCost: 200, ocValue: 4, ocLabel: '4:1', mPrime: 0.9, impact: imp(1, 3, 4, 2), glossary: 'socialist-oriented-market-economy',
    explanation: 'A market economy guided by the state toward equity: state-owned, cooperative and private sectors grow together and share the gains with workers.',
    mechanic: 'Lower profit rate, but big gains in labor relations, social contribution and sustainability. The best group for Sustainable Development.' },
  G8: { id: 'G8', name: 'Industry 4.0 and Knowledge Economy', color: '#1d4f91', prices: [350, 370, 400], buildCost: 200, ocValue: 9, ocLabel: '9:1', mPrime: 2.0, impact: imp(5, -1, 1, 2), glossary: 'industry-4-0',
    explanation: 'Automation, data and AI make knowledge the key productive force; living labor is a small share of capital but surplus value per worker is huge.',
    mechanic: 'The biggest technology gain and the highest rent, at a small cost to labor relations.' },
};

export const GROUP_SPACES: Record<GroupId, number[]> = {
  G1: [1, 3], G2: [6, 8], G3: [11, 12, 13], G4: [16, 18, 19], G5: [21, 23, 24], G6: [26, 27, 29], G7: [31, 32, 34], G8: [37, 38, 39],
};

export interface Space {
  id: number;
  name: string;
  shortName: string;
  kind: SpaceKind;
  group?: GroupId;
  price?: number;
  definition: string;
  explanation: string;
  example: string;
  mechanic: string;
  glossary?: string;
}

const RAW_PROPS: Record<number, [string, string, string, string]> = {
  // id: [name, shortName, definition, example]
  1: ['Handicraft Workshop', 'Handicraft Workshop', 'A small workshop where artisans make goods by hand with simple tools.', 'A family weaving silk at home to sell in the market.'],
  3: ['Mechanized Textile Factory', 'Textile Factory', 'An early factory that replaced hand looms with steam-powered machines.', 'The spinning mills of Manchester in the 1800s.'],
  6: ['Simple Commodity Market', 'Commodity Market', 'A marketplace where independent producers exchange commodities according to their value.', 'A village market where farmers and potters trade directly.'],
  8: ['Production Factors Exchange Center', 'Factors Exchange', 'A market where land, labor, capital and technology are bought and sold as production factors.', 'A labor exchange and a commodity-trading hall.'],
  11: ['Hon Gai Coal Mining Complex', 'Hon Gai Coal Mines', 'A large mining complex supplying coal, a basic energy input of heavy industry.', 'Quang Ninh coal mines feeding power plants and steel mills.'],
  12: ['Mechanical Engineering Factory', 'Engineering Factory', 'A plant producing machines that other industries use as means of production.', 'A factory building lathes and turbines.'],
  13: ['Metallurgical Industrial Zone', 'Metallurgy Zone', 'An industrial zone smelting ore into steel and other metals.', 'A steel complex with blast furnaces.'],
  16: ['Cartel Price Alliance', 'Cartel Alliance', 'A cartel: independent firms agreeing on prices and output to keep profits high.', 'Oil producers setting common output quotas.'],
  18: ['Syndicate Distribution Corporation', 'Syndicate Corp.', 'A syndicate: producers who keep their own factories but sell through one joint office.', 'Steel works selling all output through a shared sales company.'],
  19: ['Trust Production Consortium', 'Trust Consortium', 'A trust: production, sales and finance merged under one management.', 'A company controlling mines, mills and shipping together.'],
  21: ['Stock Exchange', 'Stock Exchange', 'A market where shares and bonds are traded; fictitious capital grows here.', 'Investors buying shares of a railway company.'],
  23: ['Monopoly Banking Corporation', 'Banking Corporation', 'A dominant bank that lends to industry and gains a say in its decisions.', 'A national bank financing and then owning stakes in factories.'],
  24: ['Financial Holding Empire', 'Financial Holding', 'A holding company that controls many firms through chains of shares.', 'A conglomerate owning a bank, an insurer and a steel group.'],
  26: ['Industrial-Agricultural-Service Complex', 'Agri-Industrial Complex', 'A state-backed complex linking farming, processing and services.', 'A state-supported agro-industrial zone with processing plants.'],
  27: ['National Energy Station', 'National Energy', 'A state power and energy facility that supports the whole economy.', 'A state-run hydroelectric plant.'],
  29: ['Public Procurement Center', 'Public Procurement', 'The state buys goods and services from big suppliers, shaping demand.', 'A government contract to build a highway awarded to a large construction group.'],
  31: ['Modern Cooperative', 'Modern Cooperative', 'A collective economic organization whose members share ownership, risks and benefits.', 'A farmers\' cooperative that processes and exports coffee.'],
  32: ['Private Economic Corporation', 'Private Corporation', 'A private company, an important driver of growth under the socialist-oriented market economy.', 'A domestic technology and manufacturing group.'],
  34: ['Strategic State-Owned Enterprise', 'State-Owned Enterprise', 'A state-owned enterprise in a strategic sector, playing the leading role of the state economy.', 'The national power or railway company.'],
  37: ['AI Research Institute', 'AI Research Institute', 'A research center turning knowledge into algorithms and products.', 'A lab training machine-learning models for medicine.'],
  38: ['Big Data Center', 'Big Data Center', 'A facility collecting and analyzing huge data sets, a new means of production.', 'A data center powering a smart-city platform.'],
  39: ['Smart Supply Chain Complex', 'Smart Supply Chain', 'A logistics and production complex coordinated by sensors and software.', 'A fully automated port and warehouse network.'],
};

const OTHERS: Record<number, Omit<Space, 'id'>> = {
  0: { name: 'GO: Expanded Reproduction', shortName: 'GO', kind: 'go', glossary: 'expanded-reproduction',
    definition: 'Production on a growing scale by turning part of surplus value into new capital.',
    explanation: 'Each lap, the economy reinvests its surplus and production grows. Passing GO pays you +200 cr.',
    example: 'A firm uses last year\'s profit to build a new plant.', mechanic: 'Collect 200 cr every time you pass or land on GO.' },
  2: { name: 'Objective Economic Event', shortName: 'Objective Event', kind: 'event', glossary: 'overproduction-crisis',
    definition: 'Objective events are forces of the economy no single firm controls: crises, innovation, inflation.',
    explanation: 'Capitalism develops through cycles and shocks that follow from its own laws, not from anyone\'s plan.',
    example: 'The 2008 financial crisis.', mechanic: 'Draw an Objective Event card. It can help or hurt everyone.' },
  4: { name: 'Turnover Tax', shortName: 'Turnover Tax', kind: 'tax', glossary: 'taxation',
    definition: 'A tax charged on the sales of a business.',
    explanation: 'Taxes fund the state and public goods, and shape how capital is spent.',
    example: 'Value-added tax on goods and services.', mechanic: 'Pay 100 cr. Social contribution +1.' },
  5: { name: 'Mechanized Railway', shortName: 'Mechanized Railway', kind: 'station', glossary: 'law-of-value',
    definition: 'Railways cut the time goods spend in transport, widening the market.',
    explanation: 'Transport is productive labor that adds its cost to the value of commodities.',
    example: 'A steam railway connecting a mine to a port.', mechanic: 'Station: rent is 25 cr x 2^(n-1) for n stations you own.' },
  7: { name: 'Policy and Economic Law Event', shortName: 'Policy Event', kind: 'policy', glossary: 'state-monopoly-capitalism',
    definition: 'State policy and law that steer the economy.',
    explanation: 'Policies rebalance markets, taxes, labor and the environment, changing every player\'s options.',
    example: 'A minimum wage law or a carbon tax.', mechanic: 'Draw a Policy card. Many give a lasting modifier for a few rounds.' },
  9: { name: 'National Electricity Grid', shortName: 'Electricity Grid', kind: 'utility', glossary: 'public-investment',
    definition: 'A national power network, infrastructure used by every sector.',
    explanation: 'Infrastructure is built by public investment because private capital underprovides it.',
    example: 'A national 500 kV transmission line.', mechanic: 'Utility: rent is dice total x 4, or x 10 with both utilities.' },
  10: { name: 'Jail: Labor Strike', shortName: 'Labor Strike', kind: 'jail', glossary: 'labor-protection',
    definition: 'A strike halts production when workers withhold their labor.',
    explanation: 'Strikes show the conflict between wages and profit, and the need for labor protection.',
    example: 'A dock strike stopping port traffic.', mechanic: 'Stuck here? Pay 50 cr, use a card, or roll doubles. Just visiting is safe.' },
  14: { name: 'Objective Economic Event', shortName: 'Objective Event', kind: 'event', glossary: 'inflation',
    definition: 'Objective events are forces of the economy no single firm controls.',
    explanation: 'Prices, crises and technology shift regardless of individual intentions.',
    example: 'A sudden spike in energy prices.', mechanic: 'Draw an Objective Event card.' },
  15: { name: 'FDI Port', shortName: 'FDI Port', kind: 'station', glossary: 'capital-export',
    definition: 'A deep-water port that connects the country to foreign investors.',
    explanation: 'Capital export seeks cheap labor and raw materials abroad; ports are its gateways.',
    example: 'An export-processing port serving foreign factories.', mechanic: 'Station: rent is 25 cr x 2^(n-1) for n stations you own.' },
  17: { name: 'Policy and Economic Law Event', shortName: 'Policy Event', kind: 'policy', glossary: 'financial-regulation',
    definition: 'State policy and law that steer the economy.',
    explanation: 'Regulation corrects market failures and protects stability.',
    example: 'Bank capital rules after a crisis.', mechanic: 'Draw a Policy card.' },
  20: { name: 'Free Parking: Free Competitive Market', shortName: 'Free Market', kind: 'free', glossary: 'competition',
    definition: 'Free competition among many sellers, none able to dominate prices.',
    explanation: 'Free competition is the early stage of capitalism before monopolies take over.',
    example: 'Dozens of small mills selling cloth.', mechanic: 'A free rest stop. Nothing happens.' },
  22: { name: 'Objective Economic Event', shortName: 'Objective Event', kind: 'event', glossary: 'overproduction-crisis',
    definition: 'Objective events are forces of the economy no single firm controls.',
    explanation: 'Crises of overproduction recur because production outgrows effective demand.',
    example: 'Unsold stock piling up after a boom.', mechanic: 'Draw an Objective Event card.' },
  25: { name: 'International Financial Center', shortName: 'Financial Center', kind: 'station', glossary: 'financial-capital',
    definition: 'A hub where banks and funds from many countries lend and invest.',
    explanation: 'Financial capital moves across borders, exporting capital.',
    example: 'London, New York or Singapore.', mechanic: 'Station: rent is 25 cr x 2^(n-1) for n stations you own.' },
  28: { name: 'Internet of Things Network', shortName: 'IoT Network', kind: 'utility', glossary: 'industry-4-0',
    definition: 'Billions of connected sensors and machines exchanging data.',
    explanation: 'The IoT is the nervous system of Industry 4.0 production.',
    example: 'Sensors that report machine wear in real time.', mechanic: 'Utility: rent is dice total x 4, or x 10 with both utilities.' },
  30: { name: 'Go to Jail: Anti-Monopoly Investigation', shortName: 'Anti-Monopoly Probe', kind: 'gotojail', glossary: 'monopoly',
    definition: 'Anti-monopoly law lets the state investigate and break up abusive monopolies.',
    explanation: 'The state can restrain monopoly power through competition law.',
    example: 'Breaking up an oil trust in 1911.', mechanic: 'Go directly to the Labor Strike jail without passing GO.' },
  33: { name: 'Policy and Economic Law Event', shortName: 'Policy Event', kind: 'policy', glossary: 'social-welfare',
    definition: 'State policy and law that steer the economy.',
    explanation: 'Social policy redistributes income and expands equity.',
    example: 'Public health insurance expansion.', mechanic: 'Draw a Policy card.' },
  35: { name: 'Digital Infrastructure', shortName: 'Digital Infrastructure', kind: 'station', glossary: 'knowledge-economy',
    definition: 'Broadband, cloud and data networks that carry the knowledge economy.',
    explanation: 'In the knowledge economy information flows are as vital as railways were before.',
    example: 'Undersea cables and 5G networks.', mechanic: 'Station: rent is 25 cr x 2^(n-1) for n stations you own.' },
  36: { name: 'Capital Gains Levy', shortName: 'Capital Gains Levy', kind: 'tax', glossary: 'taxation',
    definition: 'A tax on profits from capital, designed to share the gains of accumulation.',
    explanation: 'Taxing capital gains redistributes part of surplus value to society.',
    example: 'A tax on profit from selling shares.', mechanic: 'Pay 10% of your net worth, at most 300 cr. Social contribution +1.' },
};

function propSpace(id: number, group: GroupId): Space {
  const [name, shortName, definition, example] = RAW_PROPS[id];
  const g = GROUPS[group];
  const idx = GROUP_SPACES[group].indexOf(id);
  return { id, name, shortName, kind: 'property', group, price: g.prices[idx], definition, explanation: g.explanation, example, mechanic: g.mechanic, glossary: g.glossary };
}

function buildBoard(): Space[] {
  const out: Space[] = [];
  const groupOf: Record<number, GroupId> = {};
  (Object.keys(GROUP_SPACES) as GroupId[]).forEach(g => GROUP_SPACES[g].forEach(id => (groupOf[id] = g)));
  for (let i = 0; i < BOARD_SIZE; i++) {
    if (groupOf[i]) out.push(propSpace(i, groupOf[i]));
    else {
      const o = OTHERS[i];
      const price = o.kind === 'station' ? STATION_PRICE : o.kind === 'utility' ? UTILITY_PRICE : undefined;
      out.push({ id: i, ...o, price });
    }
  }
  return out;
}

export const SPACES: Space[] = buildBoard();
export const OWNABLE_KINDS: SpaceKind[] = ['property', 'station', 'utility'];
export const isOwnable = (id: number) => OWNABLE_KINDS.includes(SPACES[id].kind);
export const STATION_IDS = SPACES.filter(s => s.kind === 'station').map(s => s.id);
export const UTILITY_IDS = SPACES.filter(s => s.kind === 'utility').map(s => s.id);

const MULTS = [4, 11, 28, 38, 46];
/** rent[level] for a property at the given price, computed once at build time */
export function rentTable(price: number): number[] {
  const base = Math.round(price * (0.05 + (price / 400) * 0.07));
  return [base, ...MULTS.map(m => Math.round((base * m) / 5) * 5)];
}
export const RENTS: Record<number, number[]> = Object.fromEntries(
  SPACES.filter(s => s.kind === 'property').map(s => [s.id, rentTable(s.price!)]),
);

export const LEVEL_NAMES = ['Undeveloped', 'Workshop', 'Factory', 'Plant', 'Corporation', 'Conglomerate'];

export function groupSpaces(id: number): number[] {
  const g = SPACES[id].group;
  return g ? GROUP_SPACES[g] : [];
}

/** Educational capital indicators. Not game currency. */
export function capitalIndicators(spaceId: number, level: number) {
  const s = SPACES[spaceId];
  if (s.kind !== 'property' || !s.group) return null;
  const g = GROUPS[s.group];
  const K = s.price! + level * g.buildCost;
  const c = (K * g.ocValue) / (g.ocValue + 1);
  const v = K / (g.ocValue + 1);
  const surplus = v * g.mPrime;
  return { K, c, v, s: surplus, profitRate: surplus / (c + v) };
}
