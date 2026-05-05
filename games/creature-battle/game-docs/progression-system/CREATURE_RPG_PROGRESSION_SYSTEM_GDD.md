# Creature RPG Progression System GDD

Patched canon note: this version locks the diminishing manual stat allocation curve, per-level single-stat allocation caps, and 3-way/4-way class stat tie resolution rules.

## 1. Document Purpose

This document defines the long-term creature growth and RPG progression systems that sit beside the shared creature battle system.

The battle system is not duplicated here. This document describes how creatures gain stats, classes, Skills, Passives, variants, capture identity, and import-ready RPG data over time.

Creature Battle remains the first implementation target for proving the combat engine. The unnamed RPG later expands around catching, raising, stat allocation, species growth, rare variants, Trainer Affinity, trading, and creature import/export.

## 2. Scope Boundary

This document owns:

- Leveling
- Experience Points
- Natural species growth
- Manual stat allocation
- Capture-level build implications
- Rare variants
- Trading economy support
- Hidden class routing
- Class route names
- Skill and Passive learning cadence
- No-allocation prestige route
- RPG-raised creature export data
- Legacy RPG source material handling

This document does not own:

- Damage formulas
- Command resolution
- Turn order
- Targeting and retargeting
- Element matchup execution
- Combo execution
- Draft rules
- Rental roster rules
- Online battle rules

Those belong in the shared battle system document.

## 3. Shared Runtime Dependency

The RPG progression system must produce creatures compatible with the shared combat core.

The battle engine expects resolved runtime values for:

```txt
Level
HP
MP
Strength
Defense
Intelligence
Spirit
Speed
Accuracy
Evasion
Trainer Affinity, if relevant
Learned Arts
Learned Skills
Learned Passives
Equipped Passives
Current class route
Current class tier
Natural growth route
Variant growth route, if applicable
Manual stat points spent
Daredevil eligibility
Natural-growth-only status
```

The RPG may own how these values are earned. The battle system owns how these values behave during combat.

## 4. Progression Stats

### 4.1 Level

Represents creature progression.

Level is used by the RPG for progression milestones and by the combat system as a possible damage, healing, or scaling input.

### 4.2 Experience Points

Used to progress toward the next level.

Exact XP curve is not finalized.

### 4.3 HP

Creature health.

HP growth is based on:

- Species natural HP growth
- Strength
- Defense
- Variant growth modifiers, if applicable

### 4.4 MP

Resource used mainly for Arts and some Skills.

MP growth is based on:

- Species natural MP growth
- Intelligence
- Spirit
- Variant growth modifiers, if applicable

### 4.5 Trainer Affinity

Represents the bond between creature and trainer.

Trainer Affinity is locked as a stat, but exact effects are not finalized.

Potential future uses include:

- Battle bonuses
- Combo bonuses
- Loyalty effects
- RPG event access
- Trade behavior
- Special unlocks
- Creature personality behavior

Trainer Affinity effects are not currently locked.

## 5. Primary Stat Growth

Creatures use five primary allocatable stats:

- Strength
- Defense
- Intelligence
- Spirit
- Speed

These are the stats players may manually invest in when a creature levels up, unless the creature is being kept eligible for the no-allocation prestige class route.

### 5.1 Strength

Controls physical damage output.

Strength also contributes to HP growth.

### 5.2 Defense

Controls physical resistance and mitigation.

Defense also contributes to HP growth.

### 5.3 Intelligence

Controls Art damage output.

Intelligence also contributes to MP growth and influences derived Accuracy and Evasion.

### 5.4 Spirit

Controls Art resistance and magical mitigation.

Spirit also contributes to MP growth. Spirit is the best fit for Passives that improve elemental resistance, Art resistance, absorption behavior, and magical survivability.

### 5.5 Speed

Controls turn order and tempo.

Speed also influences derived Accuracy and Evasion. Speed-based class routes should focus on initiative, turn-order pressure, combo setup, evasive pressure, and tempo control. Speed should not also become the highest raw damage route.

## 6. Hidden or Semi-Hidden Derived Growth

Accuracy and Evasion are not manually allocated by the player.

### 6.1 Accuracy

Accuracy determines how reliable a creature is at landing actions.

Accuracy is influenced by:

- Speed
- Intelligence
- Species accuracy tendency
- Variant modifiers
- Status effects
- Passives
- Field effects, if added later

### 6.2 Evasion

Evasion determines how difficult a creature is to hit.

Evasion is influenced by:

- Speed
- Intelligence
- Species evasion tendency
- Variant modifiers
- Status effects
- Passives
- Field effects, if added later

## 7. Natural Species Growth

Each creature species has a natural growth route.

A species growth route defines natural tendencies for:

- Strength
- Defense
- Intelligence
- Spirit
- Speed
- HP
- MP
- Accuracy
- Evasion

Examples:

- A bulky stone creature may naturally gain more Defense and HP.
- A fire caster creature may naturally gain more Intelligence and MP.
- A fast bird creature may naturally gain more Speed and Evasion.

Species identity creates the baseline, but player allocation creates the build.

The intended design is:

- Species creates the baseline.
- Player stat choices create the build.
- Rare variants create additional long-term chase value.
- No-allocation prestige builds rely entirely on natural growth.

## 8. Level-Up Stat Allocation

When a creature levels up under player ownership, the player receives manual stat points.

Manual stat points are earned after Level 1. Level 1 creatures have no earned manual allocation points unless a future special rule explicitly grants them.

Manual stat points may be distributed across:

- Strength
- Defense
- Intelligence
- Spirit
- Speed

HP and MP are not direct manual allocation targets. They are affected indirectly through species growth, variant growth, and any derived resource formulas tied to primary stats.

### 8.1 Manual Allocation Point Curve

Manual allocation points decrease as level increases.

This is a locked progression rule.

```txt
Level 2–20: 8 points gained per level-up
Level 21–35: 6 points gained per level-up
Level 36–50: 4 points gained per level-up
Level 51–69: 2 points gained per level-up
Level 70+: 1 point gained per level-up
```

Design intent:

- Early levels give players enough control to shape a creature's build.
- Mid levels continue build expression without letting manual allocation dominate species identity.
- High levels preserve progression while preventing late-game stat inflation.
- Manual allocation should bend a creature's natural profile, not overwrite it.

### 8.2 Manual Points Available by Level

Manual points available at a given level are the sum of all points earned from each level-up after Level 1.

```txt
ManualStatPointsAvailable(level) =
sum of AllocationPointsGained for each level-up from Level 2 through current Level
```

Examples:

```txt
Level 1: 0 total manual points
Level 2: 8 total manual points
Level 10: 72 total manual points
Level 20: 152 total manual points
Level 21: 158 total manual points
Level 35: 242 total manual points
Level 50: 302 total manual points
Level 69: 340 total manual points
Level 70: 341 total manual points
Level 100: 371 total manual points
```

This replaces the older flat rule:

```txt
ManualStatPointsAvailable = (Level - 1) × 8
```

That older rule is discarded.

### 8.3 Per-Level Single-Stat Allocation Cap

Each level-up has a hard cap on how many of that level's newly earned points can be placed into one stat.

```txt
If 8 points are gained: max 3 points into one stat
If 6 points are gained: max 3 points into one stat
If 4 points are gained: max 2 points into one stat
If 2 points are gained: max 1 point into one stat
If 1 point is gained: max 1 point into one stat
```

This cap applies to points earned on that specific level-up, not to the creature's lifetime total in that stat.

The system must track enough allocation history to validate this rule. A creature should not only store lifetime totals; it should also store per-level allocation events or an equivalent audit-safe structure.

### 8.4 Locked Allocation Constraints

Players can specialize, but cannot dump every earned point into one stat forever.

Locked rule:

- Manual allocation only applies to Strength, Defense, Intelligence, Spirit, and Speed.
- Allocation points are earned only from level-ups after capture.
- Allocation points follow the diminishing point curve.
- Each level-up's earned points follow the single-stat cap table.
- Spending even one manual point permanently breaks no-allocation prestige eligibility.
- Degenerate all-in stat dumping is not legal.

## 9. Wild Capture and Manual Build Potential

Creatures encountered in the wild follow natural species growth up to their current level.

They do not retroactively receive all manual stat points the player would have gained if raising the creature from a lower level.

After capture, the creature earns manual stat allocation points only from future level-ups.

This creates a clear tradeoff:

```txt
Low-level capture:
- Lower immediate power
- More manual build control
- Higher long-term optimization ceiling

High-level capture:
- Higher immediate power
- Less manual build control
- Lower long-term optimization ceiling
```

A creature raised from a very low level can become stronger or more specialized over time because the player controls more of its stat development.

This mechanic should be explained enough that players understand the consequence, but not every optimization detail needs to be surfaced immediately. Some depth can remain discoverable.

Creature data should track:

```txt
captureLevel
manualStatPointsEarnedAfterCapture
manualStatPointsSpent
manualStatPointsUnspent
manualAllocationByStat
manualAllocationEventsByLevel
naturalGrowthOnly
daredevilEligible
```

The `manualAllocationEventsByLevel` data is required because the allocation cap is based on how many points are assigned during each individual level-up. Lifetime stat totals alone are not enough to prove that a build is legal.

## 10. Rare Creature Variants

The game may include rare alternate versions of creatures.

These are similar in function to shiny creatures, but they should not be called shinies in the game.

Rare variants may have:

- Different color palettes
- Different base stat growth
- Different natural stat tendencies
- Different HP growth
- Different MP growth
- Different Accuracy growth
- Different Evasion growth
- Potential visual flair
- Higher trade value

Rare variants should not be strictly better in every way.

Better design:

- Rare variants are different, not automatically superior.

Example:

- A variant may have stronger Speed growth but weaker Defense growth.
- A variant may have stronger MP growth but weaker HP growth.

This supports long-term collection and trading without making normal creatures worthless.

## 11. Trading Economy Support

Rare variants and build differences support trading.

Creature value can differ by:

- Species
- Level
- Capture level
- Stats
- Build path
- Learned Skills
- Learned Passives
- Equipped Passives
- Learned Arts
- Trainer Affinity
- Rare variant status
- Color palette
- Natural growth route
- Variant growth route
- No-allocation prestige eligibility

The trading economy should be based on uniqueness and build identity, not just raw power.

## 12. Class System Overview

Creatures use a hidden class system based on stat development.

At specific level milestones, the game checks the creature’s stat profile and assigns or updates its class path.

Class routing is based on the creature’s highest stat or tied highest stats, with a special no-allocation prestige route for creatures that have never received manual stat allocation.

Classes determine active Skill and Passive unlocks.

## 13. Class Check Timing

Class checks occur every 10 levels.

Examples:

- Level 10
- Level 20
- Level 30
- Level 40
- Level 50

Each 10-level milestone begins or updates a class tier.

### 13.1 Clean Timing Rule

At levels divisible by 10:

1. Award the final Skill and Passive from the current tier, if applicable.
2. Run the new class check.
3. Set the active class route and tier for the next 10-level band.

This avoids timing ambiguity at levels like 20, 30, and 40.

## 14. Class Route Selection

The active class route is determined by the creature’s highest stat or tied highest stats.

### 14.1 Single-Stat Routes

If one stat is clearly highest, the creature enters that stat’s class route.

Single-stat routes:

- Strength
- Defense
- Intelligence
- Spirit
- Speed

### 14.2 Hybrid Routes

If two stats are tied for highest, the creature enters the matching hybrid route.

With five primary stats, this creates ten two-stat hybrid routes:

- Strength / Defense
- Strength / Intelligence
- Strength / Spirit
- Strength / Speed
- Defense / Intelligence
- Defense / Spirit
- Defense / Speed
- Intelligence / Spirit
- Intelligence / Speed
- Spirit / Speed

### 14.3 Three-Way and Four-Way Stat Tie Resolution

Class routes only support single-stat routes, two-stat hybrid routes, and the no-allocation prestige route. The class checker must never create a three-stat or four-stat class route.

When three or four primary stats are tied for highest at a class check, the class checker resolves the tie into either one primary stat route or one two-stat hybrid route.

If the creature already has an active class route, the checker favors class continuity when possible.

Locked tie rules:

- If the creature is currently in a single-stat route and that stat is included in the tied highest stats, that stat is favored as the primary stat.
- If the creature is currently in a two-stat hybrid route and both route stats are included in the tied highest stats, that hybrid route is preserved.
- If the creature is currently in a two-stat hybrid route and only one route stat is included in the tied highest stats, that included route stat is favored as the primary stat, and the secondary stat is randomly selected from the remaining tied highest stats.
- If the creature is currently in a single-stat route and that stat is not included in the tied highest stats, the checker treats the tie as having no matching current route and resolves randomly.
- If the creature has no current class route, the checker randomly selects a primary and secondary stat from the tied highest stats.
- If the creature is in the no-allocation prestige route and remains eligible for that route, the no-allocation route overrides normal stat tie resolution.

Example:

```txt
Current class route: Strength
Tied highest stats at class check: Strength, Defense, Intelligence
Resolved route: Strength primary
Secondary route stat, if needed by implementation: randomly selected between Defense and Intelligence
```

Example:

```txt
Current class route: Strength / Defense
Tied highest stats at class check: Strength, Defense, Intelligence
Resolved route: Strength / Defense
```

Example:

```txt
Current class route: Strength / Speed
Tied highest stats at class check: Strength, Defense, Intelligence
Resolved route: Strength primary, with secondary randomly selected between Defense and Intelligence
```

Example:

```txt
Current class route: none
Tied highest stats at class check: Strength, Defense, Intelligence, Spirit
Resolved route: randomly selected two-stat hybrid route using two of the tied stats
```

The random tie resolver must only select from the stats tied for highest. It must not include lower stats.

Random tie resolution should be deterministic once committed to creature data. The result may be random at check time, but it should be saved so the same class check does not reroll every time the game reloads.

### 14.4 Route Count

Current route structure:

```txt
5 single-stat routes
10 two-stat hybrid routes
1 no-allocation prestige route
16 total routes
```

## 15. Canonical Class Route Table

The following class routes are canonical for the current scope.

| Route | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Tier 5 |
|---|---|---|---|---|---|
| Strength | Apprentice | Squire | Knight | Hero | Kingslayer |
| Defense | Beefcake | Brolic | Garrison | Vigorous | Aegis |
| Intelligence | Adept | Magician | Wizard | Sorcerer | Warlock |
| Spirit | Tactician | Strategist | Rulebender | Rulebreaker | Mastermind |
| Speed | Scout | Strider | Acrobat | Phantom | Timebreaker |
| Strength / Defense | Bruiser | Brawler | Combatant | Duelist | Barbarian |
| Strength / Intelligence | Prodigy | Protagonist | Paladin | Defender | White Knight |
| Strength / Spirit | Guard | Resistor | Warder | Blessing | Manna |
| Strength / Speed | Scrapper | Skirmisher | Ravager | Blitzer | Stormbreaker |
| Defense / Intelligence | Opportunist | Calculator | Conductor | Manipulator | Chameleon |
| Defense / Spirit | Protector | Frontliner | Tank | Sentry | Fortress |
| Defense / Speed | Lookout | Keeper | Interceptor | Bulwark | Iron Mirage |
| Intelligence / Spirit | Anointed | Healer | Priest | Holy | Angel |
| Intelligence / Speed | Spark | Analyst | Savant | Chronist | Spellweaver |
| Spirit / Speed | Seeker | Pilgrim | Oracle | Ethereal | Ascendant |
| No Manual Stat Allocation | Thrill-Seeker | Daredevil | Challenger | Contender | Legend |

The old no-weapon route from the legacy RPG is discarded. It does not map cleanly to the new creature RPG because the current creature system does not use weapon/no-weapon routing.

## 16. No-Allocation Prestige Route

The no-allocation prestige route is:

```txt
Thrill-Seeker → Daredevil → Challenger → Contender → Legend
```

This route is only available if the player has spent zero manual stat points on that creature ever.

Spending even one manual stat point permanently disqualifies that creature from this route.

This route may contain unusually powerful Skills and Passives because the cost is severe: the player gives up manual build control entirely and relies only on natural species growth and variant growth.

This route is especially useful for New Game+ style planning.

Creature data should track:

```txt
manualStatPointsSpent
daredevilEligible
naturalGrowthOnly
```

Once any manual stat point is spent:

```txt
manualStatPointsSpent += amount
daredevilEligible = false
naturalGrowthOnly = false
```

The UI must warn the player before the first manual stat allocation:

```txt
Spending stat points will permanently remove this creature from the Daredevil class route. Continue?
```

Without a warning, players will accidentally ruin rare builds and correctly blame the system.

## 17. Class Tier Learning

Each class tier spans a 10-level band.

Within each tier, the creature learns:

```txt
5 active Skills
5 Passives
```

The creature learns one active Skill and one Passive every 2 levels during that tier.

### 17.1 Example Tier Progression

Level 10:

- Class check occurs.
- Creature enters its first class route and tier.

Level 12:

- Learns Class Tier Skill 1.
- Learns Class Tier Passive 1.

Level 14:

- Learns Class Tier Skill 2.
- Learns Class Tier Passive 2.

Level 16:

- Learns Class Tier Skill 3.
- Learns Class Tier Passive 3.

Level 18:

- Learns Class Tier Skill 4.
- Learns Class Tier Passive 4.

Level 20:

- Learns Class Tier Skill 5.
- Learns Class Tier Passive 5.
- Then class check occurs for the next tier.

## 18. Tree Maneuvering

Players can intentionally guide creatures through different class routes by controlling stat investment.

A player may:

- Continue deeper into one route
- Shift into a different single-stat route
- Move into a hybrid route
- Leave a hybrid route
- Build toward stronger versions of a prior route
- Route creatures creatively across multiple class paths

This is intended.

The system should reward careful stat planning without requiring every routing detail to be explained upfront.

## 19. Arts, Skills, and Passives as Progression Rewards

Arts, Skills, and Passives have battle behavior defined in the shared battle system document.

This document only owns how they are earned and retained.

### 19.1 Arts

Arts express species and element identity.

A creature’s species may define its base Arts. Additional Arts may be learned through species progression, story progression, training, or other RPG systems later.

Exact Art lists by species are not finalized.

### 19.2 Active Skills

Skills express class and stat-build identity.

Once learned, active Skills remain available to the creature unless a future rule explicitly removes or transforms them.

Stronger versions of Skills do not automatically replace weaker versions by default. This supports catching, resource conservation, damage control, combo setup, and special objectives.

### 19.3 Passives

Passives are learned through class progression and equipped before battle.

Each creature has exactly 3 passive slots under the current shared battle rules.

Passives are the primary build-loadout constraint. Active Skills are not equip-limited under current design.

## 20. RPG Creature Export to Creature Battle

Raised creatures from the RPG can be imported into Creature Battle because both games use the same combat system.

Imported creatures should carry over:

- Species
- Variant status
- Color palette
- Level
- Experience Points, if relevant
- Capture level
- HP
- MP
- Strength
- Defense
- Intelligence
- Spirit
- Speed
- Accuracy
- Evasion
- Trainer Affinity, if relevant
- Learned Arts
- Learned Skills
- Learned Passives
- Equipped Passives
- Current class route
- Current class tier
- Natural growth route
- Variant growth route, if applicable
- Manual stat points spent
- Daredevil eligibility
- Natural-growth-only status

Creature Battle should not reinterpret the creature. It should load creature data and use the shared combat rules.

## 21. Legacy Source Material Handling

Legacy RPG spreadsheets are source material, not direct implementation authority.

The old class names are being migrated where useful.

The old Skill lists may be used as candidate active Skills.

Old Passives and Arts are being rescoped separately.

Old level thresholds are discarded.

Old no-weapon route is discarded.

Old numerical values should not be copied directly because the new game uses a different stat model and progression structure.

## 22. Locked Progression Scope

The following systems are currently locked in progression scope:

- RPG title is not yet locked
- Primary stats: Strength, Defense, Intelligence, Spirit, Speed
- Progression stats: Level, XP, HP, MP, Trainer Affinity
- Hidden/semi-hidden derived stats: Accuracy, Evasion
- HP growth based on species, Strength, Defense, and variants
- MP growth based on species, Intelligence, Spirit, and variants
- Accuracy/Evasion influenced by Speed, Intelligence, species, and variants
- Manual stat points use the locked diminishing level-up curve: 8, 6, 4, 2, then 1 point per level-up by level band
- Per-level single-stat allocation caps are locked: max 3 from 8 or 6 gained points, max 2 from 4 gained points, max 1 from 2 or 1 gained points
- Wild creatures do not retroactively gain missed manual stat points
- Low-level captures have more long-term build potential
- Rare variants with alternate palettes and growth tendencies
- Class checks every 10 levels
- Three-way and four-way class stat ties resolve through current-route continuity first, then random selection from tied highest stats only
- Random class tie resolution is committed to creature data and must not reroll on reload
- 5 single-stat class routes
- 10 two-stat hybrid class routes
- 1 no-allocation prestige route
- Canonical Speed route: Scout → Strider → Acrobat → Phantom → Timebreaker
- Canonical no-allocation route: Thrill-Seeker → Daredevil → Challenger → Contender → Legend
- Daredevil route requires zero manual stat points ever
- Each tier grants 5 Skills and 5 Passives
- One Skill and one Passive learned every 2 levels during each class tier
- Final Skill and Passive awarded before next class check
- Active Skills are retained after learning
- Passives are retained after learning and equipped before battle
- RPG creature export using identical combat rules

## 23. Not Yet Locked

The following progression systems are intentionally not finalized yet:

- RPG title
- Exact XP curve
- Exact natural species growth formula
- Exact rare variant generation rules
- Exact rare variant spawn rates
- Exact rare variant naming
- Exact trading rules
- Exact Trainer Affinity effects
- Exact passive categories
- Exact Skill lists by class route
- Exact Passive lists by class route
- Exact Art lists by species
- Exact competitive normalization rules for raised creatures
- Whether raised creatures can enter ladder
- Whether rare variants are normalized in competitive modes
- Whether status effects exist in the first implementation

## 24. Progression Design Boundary

This document does not define the battle engine.

The current locked focus is:

- Creature stats and growth rules
- Hidden derived stat growth
- Capture-level build implications
- Rare variants
- Trading support
- Class-tree routes
- Active Skill and Passive progression
- Future RPG import compatibility

Exploration, story, towns, quests, economy implementation, catching rules, creature roster size, world structure, and RPG campaign design are outside this document unless added later.