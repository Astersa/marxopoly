# MARXOPOLY rules

All game text is in English. Money is in credits (`cr`). The server is the only authority: every change goes through `applyAction` in `src/shared/engine.ts`.

## Board

40 spaces, clockwise. GO is the top-left corner; the top row runs left to right (0 to 10), the right column runs down (10 to 20), the bottom row runs right to left (20 to 30), the left column runs up (30 to 0). Corners are 0 GO, 10 Labor Strike (jail), 20 Free Market, 30 Anti-Monopoly Probe (go to jail).

22 properties in 8 groups, 4 stations, 2 utilities, 3 Objective Event spaces, 3 Policy spaces, 2 taxes.

| Group | Name | Prices | Level cost | c:v | m' | Indices per level (tech / labor / social / green) |
|---|---|---|---|---|---|---|
| G1 | Primitive Production | 60, 80 | 50 | 1:3 | 50% | 0 / +1 / +1 / +1 |
| G2 | Market Economy | 100, 120 | 50 | 2:1 | 80% | +1 / 0 / +1 / 0 |
| G3 | Heavy Industry | 140, 150, 170 | 100 | 5:1 | 100% | +2 / -1 / +1 / -3 |
| G4 | Monopoly Organizations | 180, 190, 210 | 100 | 6:1 | 150% | +1 / -3 / -2 / -1 |
| G5 | Financial Capital | 220, 230, 250 | 150 | 8:1 | 180% | +1 / -2 / -2 / 0 |
| G6 | State Monopoly Capitalism | 260, 270, 290 | 150 | 6:1 | 120% | +1 / 0 / +2 / -1 |
| G7 | Socialist-Oriented Market Economy | 300, 310, 330 | 200 | 4:1 | 90% | +1 / +3 / +4 / +2 |
| G8 | Industry 4.0 and Knowledge Economy | 350, 370, 400 | 200 | 9:1 | 200% | +5 / -1 / +1 / +2 |

Buying a property also applies the group's index change once.

## Rent

- Property: `base = round(price * (0.05 + price/400 * 0.07))`; level 1 to 5 rent is `base * [4, 11, 28, 38, 46]` rounded to a multiple of 5. Level 0 rent is `base`, doubled when the owner holds the whole group.
- Station (price 200): `25 * 2^(n-1)` for n stations held by the owner.
- Utility (price 150): dice total x 4, or x 10 with both utilities.
- Mortgaged spaces collect nothing. Active `rent` modifiers multiply the owner's income. If the owner's labor relations are below 25, rent is x0.85.

## Setup and turn

Each player starts with 1500 cr and indices technology 10, labor relations 50, social contribution 10, sustainability 50 (clamped to 0 to 100).

A turn flows: `roll`, then any of `buy` / `auction` / `debt`, then `roll` again if doubles were rolled, otherwise `post_roll` and `end_turn`. Phase is recomputed after every action:

```
finished -> stays finished
debts not empty -> debt
auction running -> auction
pending purchase -> buy
rollAgain and not bankrupt -> roll
otherwise -> post_roll
```

Passing or landing on GO pays 200 cr (affected by `go_reward` modifiers).

### Doubles and the Labor Strike

Doubles let you roll again. Three doubles in a row send you to the Labor Strike. Landing on space 30 sends you there without passing GO. In the strike you may pay 50 cr, use a get-out card, or roll: doubles free you and you move by the dice (no extra roll); otherwise your attempts increase, and on the third failure you pay 50 cr and move by the dice.

### Buying and auctions

Landing on a free space opens the buy phase. `decline` starts an auction (if enabled in settings) beginning with the player after the one whose turn it is, including the decliner. Bids must be at least the current bid + 10 and not more than your cash. Passing leaves the auction. It ends when one bidder remains and holds the highest bid, or nobody is left (then the space stays free).

### Development

Levels 0 to 5 (level 5 is the Transnational Corporation / Industrial Conglomerate). You need the whole group, no mortgaged space in it, and build evenly (levels in a group differ by at most 1). Only on your own turn in `roll` or `post_roll`. Cost is the group's level cost, 10% cheaper with technology 60 or more, times `develop_cost` modifiers. Selling a level refunds 50% of the base level cost, keeps the even-build rule and reverses the index change.

### Mortgage

Mortgage pays 50% of price and needs the whole group at level 0. Redeeming costs 55% of price. Mortgaged spaces move as they are in trades.

### Trades

The player who can manage assets proposes (up to 3 trades per turn, one pending at a time). A trade may include cash and spaces, but not spaces in groups that have any development. It is validated again when accepted. The recipient accepts or rejects; the proposer may cancel.

### Taxes

Space 4 charges 100 cr. Space 36 charges 10% of net worth, at most 300 cr. Paying tax adds +1 social contribution.

### Debt and bankruptcy

`payOrDebt` pays at once if you can, otherwise queues a debt (first in, first out). A debtor may sell development, mortgage, trade, then `pay_debt`, or `declare_bankruptcy`. Bankruptcy liquidates development (50% into the debtor's cash), gives all cash to the creditor, and gives the creditor the spaces (mortgage status kept). A debt to the bank frees the spaces. Jail cards go back to their deck, trades and auction seats are cancelled. One survivor ends the game.

### Rounds and modifiers

The round counter rises each time the turn passes back to the first player in order. Each new round reduces every modifier's remaining rounds and removes expired ones.

## Cards

Two decks (Objective: 11 cards, Policy: 11 cards), shuffled at the start and reshuffled from the discard when empty. Effects: `cash`, `cashPercent`, `cashPerLevel`, `collectFromOthers`, `index`, `move`, `moveBy`, `moveToNearest`, `jail`, `jailFreeCard`, `depreciate`, `modifier`. A move effect resolves the new space too (depth limited to 3). Every card carries an educational explanation and example.

## Financials

- assets = cash + purchase price of owned spaces + base cost of every level
- liabilities = mortgage principal (50% of price) + pending debts
- net worth = assets - liabilities
- productive capital = sum of K over unmortgaged properties

## Educational indicators (not game currency)

For a property: `K = price + level * levelCost`, `c = K * o/(o+1)`, `v = K/(o+1)` where `o` is the group's c:v, `s = v * m'`, `p' = s / (c + v)`. The UI labels this "Educational indicator, not game currency".

## Modes and scoring

**Capitalist Competition**: last survivor wins. Optional round limit (40 or 60): when it ends, highest net worth wins.

**Sustainable Development**: 30 rounds. Per player:

- Financial = `min(100, netWorth / max(netWorth of survivors) * 100)`, at least 0
- Social = `0.7 * socialContribution + 0.3 * laborRelations`
- Technology = technology, Sustainability = sustainability
- **Total = 0.35 Financial + 0.25 Social + 0.20 Technology + 0.20 Sustainability**

Ties are broken by net worth. Bankrupt players rank last and cannot win. The final screen lists the standings, the four pillar scores and the glossary concepts met during the game.

## Rooms, timers and autopilot

Rooms hold 4 seats (humans and bots). Starting needs at least 2 connected human players, everyone connected ready and the host connected. Bots act 1.2 to 1.8 s after their turn begins. A disconnected player is auto-played after 30 s; a connected player after the turn timer (default 90 s, can be off); a pending trade offer after 30 s. Autopilot is conservative: roll, decline purchases, pass auctions, reject trades, end turn, and when in debt liquidate then pay or go bankrupt.
