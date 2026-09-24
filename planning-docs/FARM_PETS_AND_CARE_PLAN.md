# Farm Pets & Care — implementation checklist

> Active plan · started 2026-09-22  
> Source of truth for pet identity, care, onboarding, inventory supplies, progression, death, and later competition work. `FARM_SCOPE.md` remains the source for the 3D farm/environment architecture.

## Status key

- [x] Shipped and covered by automated tests
- [ ] Not implemented
- [~] Partly present; the unchecked work in the same line still matters
- **Deferred** means intentionally outside the current pass, not forgotten

## Rules locked for this pass

- The first pet is a dog. A first-time farm owner must name it before normal farm play.
- Later adoptions cost **1,200 tickets**, but tickets are not implemented in this pass. Adoption remains unlocked/free while the system is built and tested.
- New farms start with **one randomly selected pool of six plant types, one seed of each**, one growing plot, and **20 Dog Food**.
- Dog Food will cost **15 tickets** when purchasing exists. Every species has its own named food and provisional price, weighted upward for more exotic animals.
- A pet may have up to five compatible traits. Trait selection and stat/growth variation happen per adopted pet, not merely per species.
- Visible stats: gender, age, size, hunger, happiness, speed, and strength. Affection is stored but hidden from the stats UI.
- Everything stays unlocked during development. Unlock and purchase enforcement comes only after tickets are designed.
- Every species uses the same full individual profile system: gender, age, relative size/growth, affection, hunger, happiness, speed, strength, compatible traits, and palette identity. Speed and strength ranges are weighted by species; the rest follows the same randomized pipeline.
- Every species has a food and a placeable procedural dwelling with an entrance sized from that species' authoritative body measurements.
- Tricks, pet minigames, and breeding are deferred until their animation and gameplay passes are scoped.
- Pet needs use the existing farm clock without a second time scale: one pet day is one 1,440-minute farm day, including ordinary play, naps, and elapsed time away.
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
- [x] Every row records future adoption price, species food/price, a data-only dwelling, maximum life, size range, species-weighted stat ranges, and allowed traits; the dog row also records its currently scoped toys.
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
- [x] Hunger advances from persisted farm minutes during play, naps, and time away; quarter-hour checkpoints and clock-rollback protection keep render rate and wall-clock rollback from creating extra decay.
- [x] Age and individual growth advance through that same persisted farm-time checkpoint; partial days survive API round-trips, Fast Grower accelerates growth, and both values stop at their species/individual caps.
- [x] Individual size scales the visible animal and the same multiplier drives collision, water fit, carry/drop spacing, and interaction reach.
- [x] Owners can press G near a hungry pet to consume one matching species food; full pets and missing-food attempts consume nothing.
- [x] Context prompts and the Pets panel distinguish Full, Content, Hungry, and Starving without exposing affection.
- [~] The current adoption panel can create/rename/release pets. Ticket charging and lock rules remain off.
- [x] All existing animal models use authoritative profile, food, dwelling, lifespan, and species-weight data.
- [x] Every species has three named weighted visual palettes (70% classic, 24% uncommon, 6% rare); the persisted palette recolors the actual animated model and is identified in the Pets panel.
- [x] All ten dwellings are placeable catalog props with distinct procedural models, species identity, and measured entrance contracts.
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
| Speed | Random within species range | Individuals vary while bats/sharks skew faster than hippos/jellyfish |
| Strength | Random within species range | Body type matters; rhinos/hippos/sharks skew stronger than small pets |
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

- [x] **Independent** — dislikes being held; conflicts with Cuddly.
- [x] **Cuddly** — likes being held often; conflicts with Independent.
- [x] **Zoomies** — moves unusually fast around the farm.
- [x] **Big Appetite** — hunger drains faster; conflicts with Light Eater.
- [x] **Light Eater** — hunger drains slower; conflicts with Big Appetite.
- [x] **Fast Grower** — reaches adult size sooner.
- [~] Appetite modifiers affect hunger now; movement, handling, and growth modifiers remain for their respective passes.
- [ ] Add rarity/weight data after the first behavior tuning pass; current selection is uniform.

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

- [ ] Design the ticket wallet/earning authority before charging anything.
- [ ] Charge 1,200 tickets only for adoptions after the starter dog.
- [ ] Sell species foods at their catalog prices with atomic spend + inventory grant.
- [ ] Keep developer/test unlock controls separate from production progression.
- [~] Create one care definition per species: lifespan, food/price, placeable dwelling, stat ranges, traits, and palette plans are present; species-specific toys, behavior modifiers, and animations remain.
- [ ] Do not enable live needs until the shared elapsed-time rules and each food path are complete.

## Explicitly deferred

- [ ] **Tricks:** roll over, backflip, run in a circle, play dead, and teaching progression. Scope with bespoke animations.
- [ ] **Minigames/competitive trials:** racing and strength competitions, player control, scoring, network authority, rewards, and accomplishment records.
- [ ] **Breeding:** inheritance, capacity, lifecycle, consent/pairing rules, economy, and UI all require a separate design.

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
