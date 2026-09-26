# Farm Harvest Economy, Market Square, Skills & Offline Progression

**Status:** Design / implementation plan  
**Scope:** JavaScript Game Factory — `/farm/` and supporting platform APIs  
**Purpose:** Give harvested crops and gathered resources meaningful downstream uses while turning the Farm into a persistent progression pillar of the platform.

---

## 1. Goals

The Farm should not end at:

> plant → wait → harvest → inventory number goes up

Harvested goods need multiple competing uses so players make actual decisions about what to do with what they grow.

The target loop is:

```text
GROW / GATHER
      ↓
HARVEST
      ↓
INVENTORY
 ┌────┼──────────┬───────────┬────────────┐
 ↓    ↓          ↓           ↓            ↓
SELL  ORDERS     COOK        TRADE        PROCESS
 ↓    ↓          ↓           ↓            ↓
TICKETS + XP   FOOD/GOODS   PLAYER      MATERIALS
                                      ↓
                                 CRAFT / BUILD
```

The Farm should support four long-term roles:

1. **Production** — crops, orchards, forestry and later other resource activities.
2. **Progression** — RuneScape-style life skills with meaningful unlocks.
3. **Economy** — raw goods, processed goods, NPC demand and player barter.
4. **Social play** — a shared Market Square reached physically through the Farm's front gate.

---

## 2. Current Farm Baseline

The existing Farm already provides most of the foundation needed for this system:

- persistent account-backed Farm layouts;
- 3D walkable Farm;
- editable plots, greenhouses, trees, buildings and decor;
- crop seed inventory;
- persistent harvested produce;
- crop growth, moisture and tending;
- ticket-wallet integration;
- pets and pet-care systems;
- farm time and naps;
- owner/visitor handling.

The current crop catalog already contains:

- Bean
- Beetroot
- Blueberry
- Cabbage
- Carrot
- Cauliflower
- Corn
- Eggplant
- Garlic
- Potato
- Pumpkin
- Radish
- Strawberry
- Sunflower
- Tomato
- Watermelon

The current crop loop stops after harvested produce is added to the player's Farm inventory.

This plan extends that loop rather than replacing it.

---

# 3. Core Harvest Value Chain

Every harvested item should have several possible uses.

A player should be able to decide:

```text
Harvest
   ├── Sell raw to NPCs
   ├── Fulfill NPC orders
   ├── Cook / process it
   ├── Trade it to another player
   ├── Use it in another Farm system
   └── Keep it for later
```

There should not be one universally correct choice.

Raw selling should be convenient but comparatively low-value.

NPC orders should pay better but require specific combinations.

Cooking and processing should create higher-value items but require player time and skill.

Player trading should create value through scarcity and specialization rather than minting new tickets.

---

# 4. Market Square

## 4.1 Physical Access

The Farm's front gate should become an actual exit.

Flow:

```text
Private Farm
    ↓
Front Gate
    ↓
Shared Market Square
```

Do not implement the Market Square as another menu layered over the Farm.

It should be a walkable 3D social space.

The Market Square becomes the bridge between private Farm production and the wider platform economy.

---

## 4.2 Initial Market Square Layout

The first version only needs a compact, coherent square containing:

- Produce Merchant
- Seed Merchant
- Order Board
- Kitchen / Cook
- Sawmill / Carpenter
- Player Trade Area
- Storage / Bank access if needed

Later additions can include:

- rentable player stalls;
- seasonal merchants;
- rotating festival vendors;
- specialized ingredient merchants;
- leaderboards;
- skill-specific NPCs;
- special-event gathering areas.

---

# 5. NPC Produce Sales

NPC produce buyers provide guaranteed liquidity.

The purpose of NPC buying is:

> "I grew this. I can always turn it into something useful."

NPC selling should **not** be the most profitable use of produce.

The basic rule should be:

```text
Raw Produce → Modest Ticket Profit
```

Crop prices must be calculated from actual production economics rather than assigned arbitrarily.

At minimum, each price should account for:

- seed cost;
- growth duration;
- yield per harvest;
- required care;
- productive plot capacity;
- active player effort;
- offline progression rate.

The important balancing metric is roughly:

```text
expected ticket profit / productive slot / unit of time
```

No normal crop should become the mathematically dominant answer to every situation.

---

# 6. NPC Orders / Contracts

Flat selling alone will become repetitive.

The Market Square should include an order board with rotating requests.

Example:

```text
Martha's Bakery
12 Strawberry
8 Blueberry

Reward:
180 Tickets
Cooking XP or Farming XP
```

Another:

```text
Produce Stall
8 Potato
6 Carrot
2 Garlic

Reward:
115 Tickets
```

Orders should:

- pay better than ordinary raw selling;
- encourage crop diversity;
- rotate periodically;
- sometimes require processed goods;
- sometimes reward skill XP;
- occasionally award cosmetic or seasonal rewards.

Orders are one of the main defenses against a single optimal crop taking over the economy.

---

# 7. Player Trading

## 7.1 Initial Rule

The first player economy should use **inventory-for-inventory barter**.

Example:

```text
PLAYER A
20 Tomato
4 Pumpkin

        ↕ TRADE

PLAYER B
12 Blueberry
8 Corn
```

Do not initially enable unrestricted ticket-for-item trading.

That introduces additional economic risks:

- ticket laundering;
- alt-account farming;
- exploit amplification;
- price manipulation;
- stolen/duplicated inventory conversion;
- more difficult transaction rollback.

NPCs remain the primary item-to-ticket path.

Players create value through item exchange.

Ticket-based player markets can be evaluated later once the inventory economy has proven secure.

---

## 7.2 Trade Transaction Requirements

A player trade must be server-authoritative and atomic.

Required flow:

1. Player A adds items.
2. Player B adds items.
3. Both sides lock their offers.
4. Any offer change unlocks both sides.
5. Both sides confirm.
6. Server locks both inventories.
7. Server verifies both offers still exist.
8. Server removes both offers.
9. Server grants both incoming inventories.
10. Transaction commits.
11. Both clients receive canonical inventory state.

There must be no client-authoritative inventory transfer.

---

# 8. Life Skills

Use a small RuneScape-style skill system rather than adding a large number of shallow skills.

Initial skills:

- **Farming**
- **Cooking**
- **Woodcutting**
- **Carpentry**

Potential future skills:

- Fishing
- Foraging
- Mining
- Smithing
- Beekeeping

Do not add those until the associated gameplay systems exist.

---

## 8.1 Skill Levels

Use a long-term level range such as:

```text
1–99
```

The XP curve should increase with level.

Levels should primarily unlock **new capability**, not just percentage bonuses.

Examples:

### Farming

- additional productive crop capacity;
- new crop families;
- orchard capacity;
- fertilizer;
- irrigation;
- greenhouses;
- rare crop varieties;
- specialist production.

### Woodcutting

- new tree types;
- better axes;
- larger timing windows;
- higher-value timber;
- access to specialist forestry.

### Cooking

- new recipes;
- more difficult preparation methods;
- access to higher-quality dishes;
- advanced kitchen stations.

### Carpentry

- furniture recipes;
- Farm utility objects;
- storage;
- processing structures;
- advanced decor.

Avoid a Trading skill. It would be trivial to exploit through repetitive trades or alt accounts.

---

# 9. Productive Capacity

This is a required economic safeguard.

The current editor treats many objects as permanent decor entitlements that can be placed repeatedly.

That is safe for cosmetic objects.

It is **not safe** when those objects become resource producers.

A player who owns or starts with a Growing Plot must not be able to duplicate it dozens of times and multiply ticket production without limit.

Therefore:

> Visual placement capacity and economic production capacity must be separate systems.

---

## 9.1 Crop Capacity

Example progression:

| Farming Level | Active Crop Cells |
|---:|---:|
| 1 | 6 |
| 10 | 12 |
| 20 | 18 |
| 35 | 24 |
| 50 | 30 |
| 70 | 36 |

These numbers are starting targets and should be balanced after telemetry.

A player may visually own/place more crop-related decor, but only the allowed number of productive cells can be active.

---

## 9.2 Orchard Capacity

Example:

```text
Farming 15 → 2 productive fruit trees
Farming 30 → 4
Farming 50 → 6
Farming 70 → 8
```

---

## 9.3 Forestry Capacity

Example:

```text
Woodcutting 1  → 1 resource tree
Woodcutting 20 → 2
Woodcutting 40 → 3
Woodcutting 65 → 4
Woodcutting 85 → 5
```

Decorative trees do not count and cannot yield resources.

---

# 10. Crop Care, Failure and Death

This is a required change to the existing crop system.

Currently a poorly cared-for crop can stall because it is dry or needs tending, but the plant cannot truly fail.

That removes most of the consequence from Farm care.

Crops should be able to deteriorate and eventually die.

However, failure must be readable and recoverable before death. A player should not lose a crop because they were a few minutes late.

---

## 10.1 Crop Condition States

Use derived visual/gameplay conditions such as:

```text
HEALTHY
   ↓ moisture reaches 0
THIRSTY
   ↓ sustained dehydration
WILTED
   ↓ prolonged neglect
DEAD
```

A crop can also accumulate missed-care stress after reaching its tending checkpoint.

---

## 10.2 Healthy

A Healthy crop:

- has moisture available;
- grows normally;
- has not accumulated serious neglect;
- can qualify for full yield/quality.

---

## 10.3 Thirsty

When moisture reaches zero:

- growth stops;
- the crop visibly droops or changes appearance;
- interaction prompt clearly says it needs water;
- a dry-time counter begins.

The crop is still fully recoverable.

Watering should immediately restore growth.

Being briefly thirsty should not destroy the crop.

---

## 10.4 Wilted

A crop becomes Wilted after sustained poor care.

Initial target:

```text
1 Farm day continuously dry → Wilted
```

or after prolonged failure to perform required tending.

Effects:

- growth remains stopped until corrected;
- clear visual wilt state;
- permanent care/quality penalty begins;
- possible reduced final yield;
- player can still rescue the crop.

A rescued crop returns to a healthy growing state, but any permanent care penalty remains.

This makes good care matter without making one mistake catastrophic.

---

## 10.5 Dead

Initial target:

```text
3 Farm days continuously dry → Dead
```

A crop may also die from extreme prolonged missed tending.

Suggested initial tending rule:

```text
Crop reaches existing care gate
    ↓
Growth stops until tended
    ↓
2 Farm days ignored → Wilted
    ↓
4 Farm days ignored → Dead
```

These thresholds should be constants, not embedded magic numbers.

Dead crops:

- never resume growth;
- cannot be watered back to life;
- yield nothing;
- award no harvest XP;
- remain visibly dead in the soil;
- must be manually cleared;
- consume the original seed;
- free the productive cell only after being cleared.

Do **not** silently delete dead crops.

The player needs to see what happened.

A later Composting system could allow dead plants to be converted into fertilizer, but that is not required for the first implementation.

---

## 10.6 Suggested Crop Persistence Fields

Avoid persisting purely visual derived state when possible.

Existing crop rows already track growth, moisture, tending and farm time.

Extend the crop state with fields such as:

```ts
{
  plotId,
  cellId,
  cropId,

  growthMinutes,
  moistureMinutes,
  tended,
  lastFarmMinute,

  dryMinutes,
  untendedMinutes,
  carePenalty,
  deadAtFarmMinute
}
```

Suggested meaning:

- `dryMinutes` — accumulated continuous dehydration time;
- `untendedMinutes` — time spent blocked at the care checkpoint;
- `carePenalty` — permanent damage from poor care, clamped to a known range;
- `deadAtFarmMinute` — `null` while alive; timestamp/minute when death became final.

Watering resets `dryMinutes` if the crop is still alive.

Tending resets `untendedMinutes`.

`carePenalty` should not reset.

---

## 10.7 Crop Visual States

The 3D view must clearly communicate:

- healthy;
- thirsty;
- wilted;
- dead;
- ripe.

Do not rely only on HUD text.

At minimum:

- thirsty: slight droop / dryness treatment;
- wilted: stronger droop / discoloration;
- dead: brown/dead plant model or material state.

A dead crop must not look harvestable.

---

## 10.8 Crop Quality / Yield Consequences

Crop death should not be the only consequence of poor care.

A crop that survives repeated stress should be less valuable than one that was consistently maintained.

Possible initial approach:

```text
Excellent care → full yield
Minor stress   → full or slightly reduced yield
Wilted once    → reduced yield
Heavy stress   → substantially reduced yield
Dead           → zero yield
```

A later quality system can expose:

- Poor
- Normal
- Fine
- Perfect

Quality can influence:

- NPC sale price;
- order eligibility;
- cooking result ceiling;
- player trade desirability.

Do not make quality primarily random.

Player care should be the dominant factor.

---

# 11. Offline Farm Progression

The Farm should continue progressing while the player is away, but much more slowly.

The current implementation intentionally freezes the Farm clock while offline.

Do **not** replace that behavior by simply advancing the entire Farm clock.

The Farm clock also drives systems such as pet hunger, age and lifecycle. Advancing the entire clock would make pets starve, age or reach terminal outcomes while the owner is logged out.

Instead, implement a separate offline production simulation.

---

## 11.1 Offline Production Rate

Initial target:

```text
Offline production speed = 20% of active Farm speed
```

Examples:

| Active production time | Approx. offline time |
|---:|---:|
| 2 hours | 10 hours |
| 3 hours | 15 hours |
| 4 hours | 20 hours |

This makes planting before leaving worthwhile while keeping active play substantially faster.

---

## 11.2 Offline Catch-Up Cap

Initial target:

```text
Maximum simulated absence = 24 real hours
```

Leaving for three weeks should not generate three weeks of progress.

Any time beyond the cap is ignored for production simulation.

This can later be increased by upgrades if desired, but it should not be unlimited.

---

## 11.3 Systems That Progress Offline

At reduced speed:

- crop growth;
- crop moisture consumption;
- crop stress/wilting/death;
- fruit-tree growth;
- fruit production cooldowns;
- timber-tree growth/regrowth;
- processing queues.

Nothing should be automatically harvested.

---

## 11.4 Systems That Do Not Progress Offline

Keep these paused:

- pet hunger;
- pet starvation;
- pet aging;
- pet lifecycle outcomes;
- pet happiness decay;
- player movement;
- skill XP;
- automatic harvesting;
- automatic chopping;
- player trade;
- NPC sale actions.

The user should not return to dead or runaway pets simply because they stopped playing.

---

## 11.5 Offline Crop Death Fairness

Crop death must still be possible offline, otherwise logging out becomes an exploit for avoiding care.

However, the reduced simulation speed plus the death grace period should ensure:

> A normally watered crop should not generally die during one ordinary night's absence.

With the proposed 20% offline simulation and multi-stage dehydration grace, crops should first stop growing and wilt before reaching death.

The login summary must make this visible.

---

## 11.6 Return Summary

When entering the Farm after meaningful time away, show a concise report:

```text
While you were away — 9h 42m

Tomatoes: 41% → 78%
Apple Tree reached Mature.
Strawberry Preserves finished.
2 crops are thirsty.
1 crop wilted.
```

If a crop died:

```text
1 crop died from prolonged dehydration.
```

The player should never have to infer why Farm state changed.

---

# 12. Growable Trees

Existing decorative tree assets should remain decorative.

Do not convert placeable decor directly into resource generators.

Create separate economic entities:

```text
Decor Oak Tree
Resource Oak Sapling
```

They may share art, but they do not share economic behavior.

This prevents unlimited decor duplication from creating unlimited resources.

---

# 13. Orchards

Fruit trees should be persistent productive plants.

Initial candidates include:

- Apple
- Orange
- Cherry
- Peach
- Pear

Lifecycle:

```text
Sapling
  ↓
Young Tree
  ↓
Mature Tree
  ↓
Fruit Ready
  ↓ harvest
Mature Tree
  ↓
Fruit Ready again
```

Fruit trees are not destroyed when harvested.

Fruit should feed:

- raw NPC sales;
- cooking;
- orders;
- player trading.

---

# 14. Forestry / Woodcutting

Timber trees should use a separate lifecycle.

Example species:

- Oak
- Pine
- Birch
- Willow
- Maple later

Lifecycle:

```text
Sapling
  ↓
Young
  ↓
Mature
  ↓
Chop-ready
  ↓
Stump + Logs
  ↓
Regrowth OR manual stump clearing
```

---

## 14.1 Woodcutting Gameplay

Do not make Woodcutting only:

> hold E until tree disappears

Use an active timing mechanic.

Example:

- axe swing has a timing window;
- well-timed hits deal more chopping progress;
- poor hits deal less;
- higher Woodcutting skill improves consistency;
- better tools improve efficiency.

Example tree health:

```text
██████████
```

Possible hit values:

```text
Perfect hit: -18
Good hit:    -12
Poor hit:     -4
```

Exact values should be tuned in playtesting.

Skill XP is awarded for active successful chopping, not passive tree growth.

---

# 15. Logs, Planks and Carpentry

Woodcutting creates logs.

```text
Tree
 ↓
Logs
 ↓
Sawmill
 ↓
Planks
 ↓
Carpentry
```

Carpentry outputs can include:

- benches;
- planter boxes;
- tables;
- crates;
- signs;
- fencing;
- storage objects;
- processing furniture;
- market-stall pieces;
- Farm decorations.

Do not replace the existing ticket shop entirely.

Tickets and skill production should coexist.

Some decor remains ticket-purchased.

Some decor/materials become craftable.

Some high-end items can require both.

---

# 16. Cooking

Cooking gives produce a reason not to be immediately sold.

Example recipes:

```text
3 Tomato + 1 Garlic
→ Tomato Sauce
```

```text
2 Potato + 1 Carrot + 1 Garlic
→ Farm Stew
```

```text
3 Strawberry + 2 Blueberry
→ Berry Preserves
```

```text
1 Pumpkin + additional ingredients
→ Pumpkin Soup
```

Cooking outputs can be:

- sold;
- used in NPC contracts;
- traded;
- collected;
- used later in other systems.

---

## 16.1 Cooking Should Be Interactive

Avoid turning Cooking into another passive menu timer.

Use short skill interactions such as:

- chopping timing;
- heat control;
- baking timing;
- mixing sequences.

Performance can influence dish quality.

This gives Cooking its own gameplay identity.

---

# 17. Economy Security

This becomes mandatory once Farm inventory can be converted into tickets or transferred between accounts.

The browser must not be authoritative for economically valuable inventory.

A modified client must never be able to submit:

```text
produce.pumpkin = 99
```

and then sell those pumpkins for legitimate account-wide tickets.

---

## 17.1 Server-Authoritative Economic Mutations

At minimum, the following actions must become trusted server operations:

- crop harvest into economic inventory;
- NPC produce sale;
- NPC order fulfillment;
- cooking ingredient consumption;
- processed-item creation;
- player trade;
- resource-tree harvest;
- log processing;
- crafted-item creation.

The generic Farm layout save should remain for Farm state/layout progression, but it should not be allowed to arbitrarily mint economically valuable inventory.

---

## 17.2 NPC Sale Transaction

Required server flow:

1. authenticate player;
2. lock Farm economic inventory;
3. lock ticket wallet;
4. verify requested item quantity;
5. resolve server-owned item price;
6. remove items;
7. credit tickets;
8. write transaction/audit record;
9. commit atomically;
10. return canonical inventory and balance.

Use idempotency keys for retry-safe economic actions.

---

# 18. Economy Rules

The Farm should generate tickets, but it must not outperform skill-based arcade play through passive idling alone.

Principle:

> Passive raw farming = modest income.  
> Active skilled production = stronger income.

Higher payouts should come from:

- contracts;
- cooking;
- processing;
- high-level resources;
- high-quality produce;
- active Woodcutting;
- specialized production.

This preserves the value of the platform's arcade games.

---

## 18.1 Market Price Variation

Later, NPC base prices can move within a limited range.

Example:

```text
Tomato      6 → 7 ↑
Pumpkin    18 → 15 ↓
Strawberry  7 → 9 ↑↑
Potato      5 → 5 —
```

Keep variation mild.

Suggested range:

```text
approximately ±20–25%
```

The goal is to create decisions, not a speculative financial market.

---

# 19. Suggested Data Domains

Avoid putting every new system directly into the existing `agriculture` object forever.

A reasonable long-term Farm progression model may separate:

```text
farm
├── agriculture
│   ├── crops
│   └── seeds
├── inventory
│   ├── produce
│   ├── ingredients
│   ├── food
│   ├── logs
│   ├── planks
│   └── craftedGoods
├── production
│   ├── orchards
│   ├── forestry
│   └── processingQueues
├── skills
│   ├── farming
│   ├── cooking
│   ├── woodcutting
│   └── carpentry
└── offline
    └── lastProductionCheckpoint
```

Exact schema should be designed around the platform API rather than copied literally from this diagram.

---

# 20. Implementation Sequence

Do not build every profession simultaneously.

## Phase 1 — Crop Failure + Economic Foundation

Implement first:

1. crop thirsty/wilted/dead states;
2. crop dry and missed-care timers;
3. manual clearing of dead crops;
4. productive crop-capacity rules;
5. server-authoritative economic inventory;
6. server-authoritative harvesting;
7. offline production checkpoint infrastructure.

This phase fixes the Farm's basic simulation before currency is attached to it.

---

## Phase 2 — Offline Production

Implement:

1. 20% offline production rate;
2. 24-hour real-time catch-up cap;
3. crop offline growth;
4. crop offline moisture drain;
5. offline wilting/death;
6. explicit exclusion of pet progression;
7. return summary.

Verify specifically that a normally cared-for field does not get wiped by a standard overnight absence.

---

## Phase 3 — Market Square v1

Implement:

1. front gate transition;
2. shared Market Square scene;
3. Produce Merchant;
4. raw produce sale API;
5. canonical server prices;
6. ticket payout transaction;
7. basic Market UI.

At this point harvesting finally has a direct ticket use.

---

## Phase 4 — Orders + Farming Skill

Implement:

1. Farming XP;
2. Farming levels;
3. crop-capacity unlocks;
4. rotating NPC contracts;
5. contract rewards;
6. first farming achievements.

---

## Phase 5 — Orchards + Woodcutting

Implement:

1. productive tree entities;
2. orchard slots;
3. forestry slots;
4. fruit growth/harvest;
5. timber growth;
6. active chopping;
7. Woodcutting XP;
8. log inventory;
9. stump/regrowth behavior.

---

## Phase 6 — Cooking

Implement:

1. kitchen interaction;
2. initial recipe catalog;
3. ingredient consumption;
4. active cooking minigames;
5. Cooking XP;
6. finished food inventory;
7. food-based NPC orders.

---

## Phase 7 — Carpentry

Implement:

1. sawmill;
2. logs → planks;
3. Carpentry XP;
4. craftable furniture/decor;
5. integration with Farm editor inventory.

---

## Phase 8 — Player Trading

Only after server-authoritative inventory is stable:

1. player trade invitations;
2. trade window;
3. offer locking;
4. double confirmation;
5. atomic inventory exchange;
6. trade audit records;
7. exploit/rate-limit protection.

---

# 21. Acceptance Criteria

The system is not complete unless all of the following are true.

### Crops

- Crops can become thirsty.
- Dry crops stop growing.
- Poorly cared-for crops can wilt.
- Wilted crops can be rescued.
- Repeated/severe neglect affects yield or quality.
- Sustained neglect can kill a crop.
- Dead crops produce no harvest.
- Dead crops remain visible until manually cleared.
- Dead crops cannot be revived by watering.

### Offline Progression

- Production progresses while logged out.
- Offline production is substantially slower than active production.
- Offline progress is capped.
- Crops can stall/wilt/die offline under the same care rules.
- One ordinary absence does not arbitrarily destroy a well-maintained Farm.
- Pets do not starve, age or die because the player logged out.
- Return summary accurately explains relevant changes.

### Economy

- Raw crops can be sold to NPCs for tickets.
- Ticket payout is server-authoritative.
- Inventory removal and ticket payout are atomic.
- The generic Farm save cannot mint sellable inventory.
- Plot duplication cannot multiply economic production beyond productive capacity.

### Progression

- Farming XP comes from meaningful Farm actions.
- Levels unlock capabilities.
- Resource trees are separate from decorative trees.
- Woodcutting requires active player input.
- Cooking creates meaningful value from harvested goods.

### Trading

- Players can exchange actual inventory.
- Neither client can alter the finalized trade after locking without resetting confirmation.
- Trades execute atomically.
- P2P trading does not mint tickets.

---

# 22. Final Product Direction

The Farm should become a second major persistent progression pillar beside the arcade.

The arcade primarily rewards performance with tickets.

The Farm uses time, care and skill to create commodities.

Those commodities can then:

- become tickets;
- fulfill contracts;
- become food;
- become building materials;
- be traded to other players;
- feed additional progression systems.

The intended long-term loop is:

```text
ARCADE PLAY
    ↓
  TICKETS
    ↓
FARM UNLOCKS / PETS / DECOR

FARM PLAY
    ↓
CROPS / FRUIT / TIMBER
    ↓
SELL / COOK / PROCESS / TRADE
    ↓
TICKETS + SKILL XP + GOODS
    ↓
MORE FARM CAPABILITY
```

The Farm should continue to feel alive when the player is gone, but active care and active play must remain substantially more effective.

Most importantly, neglect needs consequences.

A crop that is planted and then ignored indefinitely should not sit safely in suspended animation forever. It should stop growing, visibly deteriorate, become recoverable for a period, and eventually die if the player continues to neglect it.
