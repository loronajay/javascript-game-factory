# Farm Pets & Care — implementation checklist

> Active plan · started 2026-09-22 · care coverage completed 2026-09-27 (every species has food, a home and three toys)  
> Source of truth for pet identity, care, onboarding, inventory supplies, progression, death, and later competition work. `FARM_SCOPE.md` remains the source for the 3D farm/environment architecture.

## Status key

- [x] Shipped and covered by automated tests
- [ ] Not implemented
- [~] Partly present; the unchecked work in the same line still matters
- **Deferred** means intentionally outside the current pass, not forgotten

## Rules locked for this pass

- The first pet is a dog. A first-time farm owner must name it before normal farm play.
- Later adoptions cost **1,200 tickets** and include five servings of that species' food. This is live and server-authoritative (`POST /games/farm/adoptions`, see `FARM_TICKET_ECONOMY.md`).
- New farms start with **one randomly selected pool of six plant types, one seed of each**, one growing plot, and **20 Dog Food**.
- Dog Food costs **15 tickets**. Every species has its own named food and price, weighted upward for more exotic animals; foods are repeat-purchase supplies bought through `POST /games/farm/supplies/purchases`.
- A pet may have up to five compatible traits. Trait selection and stat/growth variation happen per adopted pet, not merely per species.
- Visible stats: gender, age, size, hunger, happiness, speed, and strength. Affection is stored but hidden from the stats UI.
- The starter set (doghouse and the corgi's three toys, plus the farm starters) is permanently free. Every other species' home and toys are buy-once permanent unlocks in the Farm ticket shop; prices live only in `platform-api/src/services/farm-ticket-catalog.mts`.
- Every species uses the same full individual profile system: gender, age, relative size/growth, affection, hunger, happiness, speed, strength, compatible traits, and palette identity. Speed and strength ranges are weighted by species; the rest follows the same randomized pipeline.
- Every species has a food, a placeable procedural dwelling with an entrance sized from that species' authoritative body measurements, and **exactly three toys of its own**. A toy belongs to one species; a swimmer's home and toys are `aquatic` and stand on a pond bed.
- Tricks, pet minigames, and breeding are deferred until their animation and gameplay passes are scoped.
- Pet needs use the existing farm clock without a second time scale: one pet day is one 1,440-minute farm day, during play and naps only. The farm is PAUSED while the player is away (owner decision 2026-09-26): nothing drains, ages or grows off-screen.
- Hunger drains by **25 points per farm day** before traits; Big Appetite multiplies drain by 1.5 and Light Eater by 0.65. One correct species serving restores 35 hunger.
- Hunger at or below 40 is Hungry; zero is Starving. A pet that remains at zero for one complete farm day is due to die. The grace timer is live now; the death transition ships with the tombstone slice so the pet and its history change atomically.
- Feeding at 100 has no effect and consumes nothing. Feeding below 100 consumes one serving and caps hunger at 100.
- Farm progression is visible in the farm; there are no away/push notifications.
- A runaway is gone forever. Removing a tombstone permanently deletes the prop, while its durable history remains for later record/prop ideas.
- Outcome warnings use four stages: Doing well, Needs care (hunger ≤40, affection ≤35, or happiness ≤40), Distressed (zero hunger, affection ≤15, or happiness ≤20), and Life at risk / At life's end.
- Distressed pets get one deterministic outcome roll per crossed farm day: happiness ≤20 adds a 20% runaway chance, affection ≤15 adds another 10%, and only after the runaway roll fails can happiness ≤5 cause the 1% rare neglect death. The pet/day roll is stable across reloads.
- Persisted gender values are limited to female/male for this game.

## Current implementation snapshot

### Data and persistence

- [x] Pet care is one species-indexed data catalog rather than scattered constants (`js/farm-pet-care.mts`).
- [x] Every row records adoption price, species food/price, its dwelling, its three toys, maximum life, size range, species-weighted stat ranges, and allowed traits. `petCareForItem(itemId)` answers "whose home/toy is this?" for the editor.
- [x] Every newly adopted pet receives a persisted individual profile: gender, age, current/max size, growth rate, affection, hunger, happiness, speed, strength, 1–3 compatible traits, and palette id.
- [x] Random generation is injectable and unit tested; values are bounded during load.
- [x] Mutually exclusive traits cannot be generated or restored together.
- [x] Legacy pets without profiles gain a complete deterministic individual profile keyed by species + instance id, so migration supplies traits and variation without rerolling on reload.
- [x] The API trust boundary preserves and bounds pet profiles and supply stacks.
- [x] Existing farm layout version 3 remains readable; these fields are additive, so no destructive migration is required.

### Inventory and UI

- [x] Farm inventory supports a `supplies` collection in addition to seeds and produce.
- [x] New/default inventory contains **20 Dog Food** and zero-count stacks for every other species food.
- [x] The inventory panel displays every species food stack.
- [x] The Pets panel displays gender, age, size, hunger, happiness, speed, strength, and trait labels for every pet.
- [x] Profiles saved before the trait rollout deterministically gain compatible traits without rerolling their existing stats.
- [x] Affection is absent from the visible-stats view model and panel.
- [x] Hunger advances from persisted farm minutes during play and naps (never while away); quarter-hour checkpoints and clock-rollback protection keep render rate and wall-clock rollback from creating extra decay.
- [x] Age and individual growth advance through that same persisted farm-time checkpoint; partial days survive API round-trips, Fast Grower accelerates growth, and both values stop at their species/individual caps.
- [x] Individual size scales the visible animal and the same multiplier drives collision, water fit, carry/drop spacing, and interaction reach.
- [x] Owners can press G near a hungry pet to consume one matching species food; full pets and missing-food attempts consume nothing.
- [x] Context prompts and the Pets panel distinguish Full, Content, Hungry, and Starving without exposing affection.
- [x] The adoption panel creates/renames/releases pets; later adoptions are charged 1,200 tickets server-side and include five servings of food.
- [x] All existing animal models use authoritative profile, food, dwelling, lifespan, and species-weight data.
- [x] Every species has four named weighted visual palettes (69% classic, 24% uncommon, 6% rare, 1% super rare); selective three-color ramps preserve eyes/facial details, super rares add a pearlescent finish, and persisted Rare/Super Rare identities grant one-time +8%/+15% Speed and Strength bonuses.
- [x] All ten dwellings are placeable catalog props with distinct procedural models, species identity, and measured entrance contracts.
- [x] All ten species have three procedural toys each (30 total, `js/farm-props-toys.mts`); some animate (bell, hammock, mobile, lantern moths, swing, kelp, bubbles, float, spinner). Swimmers' toys are listed in the Water tab and placed in ponds; the build-mode card and inspector name the species a home/toy is for.
- [x] The Pets panel shows a care line per pet: what it eats (and how many servings are held), its home, and its three toys, each marked on the farm or not (`petCareSummary`, pure).
- [x] Aquatic pets can be picked up like every other pet and can only be put down where their full body fits inside water.
- [x] New owners see the farm introduction once and must atomically name/save their starter dog before normal play; visitors never receive the owner gate.
- [x] New farms persist one growing plot, one seed from six randomly chosen unique crops, and 20 Dog Food without rerolling or re-granting on reload.
- [x] Phase-5 outcomes are live: H calls trusted pets, care warnings escalate, low-care departures roll deterministically, and starvation/natural/rare deaths atomically create durable history plus a memorial prop.

## Universal profile values — current tuning baseline

These are implementation values, not promises that balancing is final.

| Value | Current rule | Why |
|---|---:|---|
| Maximum life | Species row, currently 70–150 farm days | Provisional tuning; death behavior is not active yet |
| Starting affection | 50 / 100 | Neutral bond; hidden from the player |
| Starting hunger | 100 / 100 | A new pet does not arrive in distress |
| Starting happiness | 100 / 100 | Onboarding begins positively |
| Speed | Random base within species range, then grows (see Stat progression) | Individuals vary while bats/sharks skew faster than hippos/jellyfish |
| Strength | Random base within species range, then grows (see Stat progression) | Body type matters; rhinos/hippos/sharks skew stronger than small pets |
| Starting size | Random 0.62–0.90× | Visible puppy/adolescent variation |
| Adult size cap | Random 0.90–1.12× | Each pet has its own cap relative to species base height |
| Growth target | Individual cap over ~70 well-handled days | Stored as growth/day; aging/growth behavior is not active yet |
| Trait count at adoption | 1–3, hard cap 5 | Leaves room for later acquired/rare traits |
| Dog Food | Start 20; future price 15 tickets | Requested economy values |
| Later adoption | Future price 1,200 tickets | Recorded, not charged |

### Species weighting and care data

| Species | Speed | Strength | Food (future price) | Data-only dwelling | Max life |
|---|---:|---:|---|---|---:|
| Corgi | 35–65 | 25–55 | Dog Food (15) | Dog House | 100 |
| Duck | 28–55 | 15–35 | Waterfowl Feed (12) | Duck Coop | 80 |
| Red Panda | 30–60 | 20–42 | Bamboo Bites (24) | Treetop Den | 90 |
| Platypus | 22–50 | 20–45 | River Grubs (20) | Burrow Lodge | 100 |
| Hippo | 18–42 | 65–95 | River Hay (30) | Mud-Wallow Shelter | 140 |
| Rhino | 22–48 | 75–100 | Browse Bundle (35) | Rhino Shade | 130 |
| Bat | 45–78 | 10–28 | Fruit Mix (18) | Roosting Box | 90 |
| Shark | 48–82 | 60–90 | Shark Feed (45) | Reef Grotto | 150 |
| Anglerfish | 20–45 | 18–40 | Deep-Sea Feed (40) | Darkwater Cave | 110 |
| Jellyfish | 12–35 | 8–25 | Plankton Blend (28) | Jellyfish Lagoon | 70 |

These are balancing rows, not claims about real-world animal biology. Food prices, lifespans, and competition ranges remain tunable before the corresponding live systems ship.

### Shared trait pool

22 traits, shared by every species (expanded 2026-09-27 from the original six). Each is a row in `PET_TRAITS` (`js/farm-pet-care.mts`) carrying a **rarity**, **mutual conflicts**, a **treatment** (rapport deltas) and its **effect as data**: `multipliers` (hunger drain, happiness drain, home/toy happiness and trust, handling, pace, rest, stroll length, starvation grace, lifespan — composed by `petTraitMultiplier`), `snapAt`, `follows` or `size`. A pet's traits multiply together. The API mirrors the pool in `FARM_PET_TRAITS` / `FARM_PET_TRAIT_CONFLICTS` (`services/farm-economy-catalog.mts`) because it rolls adoption; a parity test holds order, weights, conflicts and whole adoptions together.

| Trait | Rarity | Effect | Conflicts |
| --- | --- | --- | --- |
| Independent | common | refuses handling below 60/70 trust; hates being carried | Cuddly |
| Cuddly | common | extra trust/happiness from petting | Independent |
| Zoomies | uncommon | walks 1.35× | Lazy |
| Big Appetite | common | hunger ×1.5 | Light Eater, Picky Eater |
| Light Eater | common | hunger ×0.65, dislikes early meals | Big Appetite |
| Fast Grower | uncommon | size ×1.5, stats ×1.25 in youth | — |
| Gentle | rare | snaps only at ≤5 (default ≤10) | Grumpy |
| Grumpy | common | snaps at ≤20, half the happiness from petting | Gentle |
| Shy | common | half the trust from handling, double from its home (daily + first-home award) | Social |
| Social | common | happiness drains ×1.25, loves petting | Shy, Loner |
| Loner | common | happiness drains ×0.75, lukewarm about petting | Social, Shadow |
| Playful | common | toy happiness ×2 | Lazy |
| Homebody | common | home happiness ×2, drain ×1.3 while homeless | Wanderer |
| Collector | uncommon | toy trust ×2 | — |
| Lazy | common | walks 0.75×, rests 2× | Zoomies, Playful, Wanderer |
| Wanderer | common | strolls 1.5× farther, rests 0.6× | Homebody, Lazy |
| Shadow | rare | strolls to within 1.8–4 m of the player when the player is within 14 m (land/air only, not indoors) | Loner |
| Picky Eater | common | meals barely register; early meals disliked | Big Appetite |
| Hardy | rare | starvation grace ×2, hunger trust loss ×0.5 | — |
| Big-Boned | rare | adult size remapped into the top 30% of the range (no extra draw) | Runt |
| Runt | rare | adult size remapped into the bottom 30% | Big-Boned |
| Long-Lived | rare | natural lifespan ×1.2 (`petMaxLifeDays`); growth stages stay on the species' life, so it is a longer elderhood at peak, and the server growth pin is unchanged | — |

- [x] **Rarity weights**: common 6 / uncommon 3 / rare 1 (`PET_TRAIT_RARITY_WEIGHTS`), a weighted shuffle with one draw per trait (key `u^(1/w)`, highest first). The Pets panel tints uncommon (blue) and rare (gold) chips.
- [x] Existing pets keep their stored traits (the server pins them on save); only new adoptions roll from the larger pool.
- [ ] Species-specific pools (`care.traitIds` is the seam) and a 2–4 trait count are open questions.

## Stat progression (shipped 2026-09-25)

Speed and Strength are no longer fixed at adoption. `js/farm-pet-growth.mts` is pure (species data passed in) and runs inside the same persisted farm-time checkpoint as hunger, happiness and age; long absences are integrated in ≤1-day steps so growth sees the care the pet actually had.

- **Profile shape**: `profile.growth = { grade, base, rates, gained, rapport, treatDay, treats }`. `stats` is always derived: `min(100, (base + gained) × (1 + paletteBonus))`.
- **Potential** is rolled once at adoption: Steady ×1.0 / Gifted ×1.35 / Exceptional ×1.8 / Prodigy ×2.5, per-stat jitter 0.85–1.15. Palette rarity shifts the odds — classic 72/21/6/1, uncommon 64/26/8/2, rare 45/33/17/5, super rare 25/35/28/12.
- **Rate**: a Steady pet at perfect care gains 90% of its species stat range over a lifetime. Life stage weights each day: Youth (first 40% of life) ×1.2, Adult (to 75%) ×0.8, Elder ×0 — elders keep their peak. Fast Grower ×1.25 during youth.
- **Care multiplier** (0–1.69) per day = hunger (fed 1, hungry 0.5, starving 0) × happiness (0 at ≤10, full at ≥80) × affection 0.6–1.3 × rapport 0.7–1.3.
- **Rapport** is hidden like affection: 0–100, starts 50, drifts back toward 50 at 3/day. Every handling adds `BASE_TREATMENT` + each trait's preference (Cuddly loves carry/petting, Independent hates being grabbed even when it escapes, Zoomies loves play, Big Appetite loves meals, Light Eater dislikes being fed above 60 hunger, Fast Grower likes meals). The 1st/2nd/3rd of one kind per farm day count 100/60/30%, later ones nothing. Strong reactions show a status note ("It loved being treated this way." / "It did not like that.").
- **Panel**: stars + grade, life stage and a trend (Thriving / Growing well / Growing slowly / Not growing / At peak) plus `+N` earned per stat. Affection and rapport never appear as numbers.
- **Migration**: profiles saved before progression take their stored stats as base, get a stable seeded potential roll, and are credited for the days already lived at 0.8 care.
- **Server** (`platform-api/src/services/farm-pet-growth-policy.mts`, mirror of the client maths with a parity test): adoption rolls growth in the client's random order; on save the rolled grade/base/rates are pinned from the stored row, `gained` is bounded by what the rates could produce by that age at perfect care, and `stats` is recomputed server-side — the client's stats are ignored. Pre-progression stored pets get their stored stats as the pinned base and species-bounded rates.

## Work queue

### Phase 1 — first-farm onboarding

- [x] Add an explicit persisted onboarding state so first entry is distinguishable from an old empty test farm.
- [x] Show the introductory farm message once to an owner, never to a visitor.
- [x] Create the starter dog atomically and require a valid name before entering normal play.
- [x] Place exactly one starter growing plot in the starter layout.
- [x] Select six unique crop types at new-farm creation and grant one seed of each; persist the result so reloads cannot reroll it.
- [x] Preserve established farms without re-granting starter items or overwriting layouts.
- [x] Add tests for first creation, reload, legacy migration, signed-out cache, signed-in save, and visitor reads.

### Phase 2 — feeding and live needs

- [x] Add a Feed interaction that consumes the correct inventory item.
- [x] Use the persisted, offline-safe farm clock for hunger decay. Survival is never based on render frames or an open browser tab.
- [x] Apply appetite trait modifiers from data.
- [x] Define the hungry/starving thresholds and one-farm-day grace period before death.
- [x] Reduce affection while hungry and restore hunger when fed.
- [x] Overfeeding has no effect: a full pet refuses the serving and inventory is unchanged.
- [x] Add clear hunger feedback without exposing hidden affection.
- [x] Test elapsed-time advancement, clock rollback, caps, repeated feed requests, and missing-food behavior.

### Phase 3 — happiness, handling, dwelling, and toys

- [x] Name one data-only dwelling for every species.
- [x] Add dwelling catalog assets and species-appropriate entrances after their 3D models are designed.
- [x] Add Tennis Ball, Rope Toy, and Bone as data-driven owned/placed items.
- [x] Give every other species three toys of its own (placeable, priced, aquatic for swimmers), so happiness and Y Play work the same for all ten.
- [x] The first valid species dwelling grants a one-time persisted +10 affection award; replacing it cannot farm the bonus.
- [x] Happiness loses 8/day, offset by 5/day for a valid dwelling and 2/day per distinct compatible toy; those items also build affection by 1/day and 0.5/day respectively.
- [x] Connect Cuddly/Independent to carrying and petting reactions.
- [x] Add readable refusal/bite warnings and a warned jump-from-arms timer; punishment never arrives without feedback.
- [x] Y Play is a separate interaction from future animated tricks and requires a compatible placed toy.

### Phase 4 — age, growth, palette rarity, and lifespan

- [x] Advance age in farm days from persisted time.
- [x] Grow current size toward the individual cap; apply Fast Grower.
- [x] Feed the size multiplier into visuals and hitbox/interaction reach together.
- [x] Add weighted palette variants only after actual palettes/assets exist.
- [x] Natural aging is deterministic: excellent care reaches the species maximum exactly (day 100 for a corgi); Phase 5 outcomes may still end a life earlier, but care never extends the natural cap or creates an asymptotic lifespan.
- [x] Expose age/size updates in the stats panel without exposing affection.

### Phase 5 — affection/happiness outcomes and death

- [x] Define warning stages before running away forever or dying.
- [x] High affection: whistle/call response (H calls every pet at or above 70 affection unless severely unhappy).
- [x] Low affection: refusal, bite, jump from arms, and possible runaway behavior.
- [x] Low happiness: refusal to eat/carry, runaway chance, and only then the rare-death rule.
- [x] Starvation death after the defined grace period.
- [x] Replace a dead pet with a movable/rotatable/removable tombstone decor row.
- [x] Tombstone references durable history containing name, final visible stats, traits, lifespan, and future competition accomplishments.
- [x] Removing a tombstone is permanent and requires a warning; durable pet history remains for later prop/history ideas.

### Phase 6 — economy and additional species

- [x] Use the shared account-wide ticket wallet (the Arcade Room's) as the spending authority.
- [x] Charge 1,200 tickets only for adoptions after the starter dog (includes five food).
- [x] Sell species foods at their catalog prices with atomic spend + inventory grant (Inventory panel buy buttons).
- [x] No developer unlock path exists for the Farm: the starter set is the only free set, everything else is an entitlement.
- [x] One care definition per species: lifespan, food/price, placeable dwelling, three toys, stat ranges, traits, and palettes.
- [x] Live needs run for every species through the shared farm-time checkpoint.
- **Deferred:** species-specific *behaviour* beyond the shared pipeline (a bat roosting in its box, a duck taking to a pond) and bespoke animations. Every species uses the Gobkit pack's four clips (idle/attack/dead/walk); new motion belongs with the tricks pass.

## Toy catalog (2026-09-27)

Every row is a decor row under `decor.prop.<id>`, referenced by the species' care row. Low toys are walk-over; anything a body would stand against is solid. Prices are per item, buy-once.

| Species | Toys | Price each |
|---|---|---:|
| Corgi | Tennis Ball, Rope Toy, Bone | starter (free) |
| Duck | Splash Tub, Pecking Bell, Rubber Duckling | 60 |
| Bat | Fruit Mobile, Moth Lantern, Swing Perch | 70 |
| Platypus | Log Tunnel, Pebble Pile, Paddle Pool | 80 |
| Red Panda | Bamboo Climber, Pinecone Puzzle, Leaf Hammock | 90 |
| Anglerfish (pond) | Glow Stone, Old Anchor, Bubble Stone | 110 |
| Jellyfish (pond) | Glass Float, Coral Fan, Current Spinner | 120 |
| Shark (pond) | Chew Ring, Sunken Chest, Kelp Garden | 140 |
| Hippo | Beach Ball, Scratching Post, Watermelon | 150 |
| Rhino | Tractor Tire, Scratch Boulder, Pushing Log | 160 |

`js/tests/farm-pet-toys.test.mjs` holds the coverage: three per species, no toy shared, aquatic exactly for swimmers, the corgi's free and the rest purchasable, every model builds, each species' toys lift its happiness and let it play while another species' toys do nothing for it, and every swimmer toy goes into a pond, never onto grass, and moves with its pond. The API's farm ticket parity test already requires every purchasable decor row to carry a price.

## Explicitly deferred

- [ ] **Tricks:** roll over, backflip, run in a circle, play dead, and teaching progression. Scope with bespoke animations. **Next design pass.**
- [~] **Minigames/competitive trials:** the first offline Barnyard Dash slice now provides player-controlled racing versus CPU and reads canonical farm pets without taking ownership of them. Network authority, rewards, accomplishment records, and the other event concepts remain deferred; see `planning-docs/PET_MINIGAMES_PLAN.md`.
- [x] **Breeding (2026-09-29):** a grown, fed, content female and male of one species pair from the Pets panel for 600 tickets; each rests 5 farm days after. The young one keeps one trait from each parent (rare and shared traits likelier to be the one passed), may inherit more, then rolls its own 1–3 on top, so a bred pet always carries more traits than an adopted one. Palette and potential lean toward the parents' (harder when both are rare); stats lean 60% toward the parents' average. Rules in `js/farm-pet-breeding.mts`, mirrored by `platform-api/src/services/farm-pet-breeding-policy.mts` (parity test), minted server-side by `db/farm-pet-breeding.mts` via `POST /games/farm/pets/breedings`. Horses are excluded (Hollis/stalls). No pregnancy: the young one is born at once.

## Resolved decisions for later outcome slices

1. Pets use the farm's existing time model: one pet day is one farm day, and naps advance needs through that same clock.
2. A pet dies after remaining at zero hunger for one complete farm day.
3. No push/in-app-away notification system is needed; farm progression is shown in the farm.
4. Runaways are gone forever.
5. Removing a tombstone permanently deletes that tombstone but the history remains in data for later prop ideas.
6. Gender values are female/male only.

## Definition of done for the current pet-care pass

- [x] Data generation and normalization are deterministic under an injected random source and bounded under hostile stored input.
- [x] API round-trip keeps new fields.
- [x] UI shows the intended stats and never affection.
- [x] Every species has food/dwelling data; food inventory starts with 20 Dog Food and zero of the other foods.
- [x] Focused browser/API tests pass.
- [x] First-farm dog naming and starter-farm grants ship (Phase 1).
- [x] Feeding changes hunger and consumes food (Phase 2).
- [x] Permanent outcomes, pet history, and movable memorial stones ship (Phase 5).
