# Shared Creature Battler System GDD

## Purpose

This document indexes the creature battle design documents and defines the boundary between the shared combat core, Creature Battler, and the unnamed RPG.

The project is a connected creature-battling ecosystem with two connected games:

1. The unnamed creature RPG
2. Creature Battler

Creature Battler is the battle-focused companion game and should be scoped first. The RPG will later expand around catching, exploration, story, economy, trading, rare variants, long-term creature raising, and imported creature ownership, but both games must use the same combat core.

## Document Set

This GDD is split into focused documents:

1. `SHARED_COMBAT_CORE.md`
2. `CREATURE_BATTLE_MODES.md`
3. `RENTAL_ROSTER_AND_DRAFT.md`
4. `COMPETITIVE_RULESETS.md`
5. `BATTLE_DATA_CONTRACT.md`

## Core Rule

Both games use the same shared combat core.

Creature Battler may restrict which creatures, moves, items, passives, variants, Trainer Affinity effects, or RPG-derived modifiers are legal in a specific ruleset, but Creature Battler must not reinterpret combat resolution differently from the RPG.

Correct implementation model:

```txt
Shared Creature Combat Core
├── Creature Battler wrapper
└── Unnamed RPG wrapper
```

Incorrect implementation model:

```txt
Creature Battler combat system
Unnamed RPG combat system
```

Duplicated combat logic is not acceptable because it would make creature importing fragile and balance updates inconsistent.

## Development Priority

Recommended implementation order:

```txt
1. Shared combat engine
2. Creature Battler rental/testing modes
3. Creature Battler ranked rental baseline
4. Imported creature compatibility
5. Imported ranked rulesets
6. RPG-specific acquisition and progression wrappers
```

Creature Battler should be implemented and balanced first because it isolates the shared battle engine. It lets the system prove itself with controlled rental creatures before the RPG adds broader systems such as catching, exploration, rare variants, economy, trading, New Game+, and imported creature variance.

The first serious balance format should be Rental Draft Ranked because rental creatures are controlled, predictable, and available to all players.

Imported ranked modes are in scope, but they must be separate ruleset families with eligibility gates and normalization rules.

## Scope Boundary

This document set defines:

- Shared battle mechanics
- Creature Battler-first implementation direction
- Runtime creature stats
- Hidden derived stats
- Element system
- Damage categories and formula variables
- Combo logic
- Targeting and retargeting
- Rental roster and draft structure
- Competitive ruleset families
- Imported ranked eligibility direction
- RPG import compatibility

This document set does not define:

- RPG exploration
- Story
- Towns
- Quests
- Economy
- Catching rules
- Full RPG creature roster size
- World structure
- Campaign design

The RPG may generate creatures, variants, classes, growth paths, and Trainer Affinity values, but the shared combat core only receives resolved battle data and applies the selected battle ruleset.
