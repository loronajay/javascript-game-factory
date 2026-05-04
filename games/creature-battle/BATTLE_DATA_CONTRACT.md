# Battle Data Contract

## Purpose

This document defines the data interface between the shared combat core, Creature Battle, and the unnamed RPG.

The combat engine should accept resolved runtime creature objects from either rental data or RPG progression data.

Creature Battle should not reinterpret RPG progression. It should load creature data, validate it against the selected ruleset, apply allowed normalization, and use the shared combat rules.

## Runtime Creature Object

At battle load time, the combat engine needs resolved runtime values for:

```txt
Creature ID
Display Name
Species
Variant status, if relevant
Color palette, if relevant
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
Current class route, if relevant
Current class tier, if relevant
Natural growth route, if relevant
Variant growth route, if applicable
Manual stat points spent, if relevant
Daredevil eligibility, if relevant
Natural-growth-only status, if relevant
Imported ranked eligibility metadata, if relevant
Ruleset legality flags, if relevant
```

The battle engine should treat these as already-resolved battle inputs.

The RPG may be responsible for calculating growth, class unlocks, variant status, Trainer Affinity, manual stat point history, or ownership. The shared combat core should not duplicate those progression calculations.

## Move Object

Every move should define:

```txt
Move ID
Display Name
Command Source
Damage Type
Element Mode
Potency Tier
Base Power, if damaging
Move Power Modifier
Base Accuracy
Cost Type
Cost Amount
Target Pattern
Combo Tags
Class Source or Species Source
Notes
```

Move potency should not be inferred only from display name. It needs data. Every damaging Art, Skill, Attack default, and combo result needs a Base Power or explicit damage basis.

Damage Type controls stat scaling:

```txt
Physical = Strength vs Defense
Magic = Intelligence vs Spirit
Hybrid = explicit formula
Utility / Non-damaging = no standard damage formula unless explicitly defined
```

Element Mode is separate from Damage Type. Element applies matchup behavior; it does not decide whether Strength or Intelligence is used.

## Combo Object

Each combo should define:

```txt
Combo ID
Display Name
Required Move 1
Required Move 2
Optional Required Move 3
Required participating species, if any
Required elements, if any
Required tags, if any
Resulting combo move
Damage type
Base Power or effect basis
Element mode
Cost behavior
Targeting behavior
Damage or effect behavior
Speed behavior
Whether all participant actions are consumed
Cancellation behavior
Preview text
```

Combo data should be explicit enough for:

- UI preview
- Ruleset validation
- AI battle planning
- Future replay reconstruction

## Rental Creature Object

Each rental creature should define:

```txt
Creature ID
Display Name
Element
Role
Stat Bias
Base Arts
Starting Active Skills
Known Passives
Default Equipped Passives
Combo Tags
Draft Strength
Draft Weakness
AI Behavior Notes
```

Rental creatures use the same battle data format as raised creatures. The difference is that rental creatures are predefined instead of generated through RPG progression.

## Ruleset Object

A ruleset should define:

```txt
Ruleset ID
Display Name
Mode Family
Creature Source Legality
Team Size
Level Rules
Team Average Level Rules
Maximum Individual Level Rules
Stat Budget Rules, if any
Move Legality Rules
Passive Legality Rules
Item Legality Rules
Variant Rules
Trainer Affinity Rules
Duplicate Creature Rules
Mirror Pick Rules
Draft Rules, if any
RNG Rules
Battle Log Requirements
Ranked Eligibility
```

Rulesets should be explicit. Avoid implicit special cases hardcoded inside battle resolution.

## Ruleset Validation

Before battle starts, the selected ruleset should validate:

- Creature source legality
- Level legality
- Team average level legality, if applicable
- Maximum individual level legality, if applicable
- Stat budget legality, if applicable
- Move legality
- Passive legality
- Item legality
- Variant legality
- Trainer Affinity legality
- Duplicate creature legality
- Mirror pick legality
- Team size legality

Invalid teams should be rejected before battle begins.

## Imported Ranked Eligibility Metadata

Imported creatures may need metadata for ranked validation.

Potential metadata:

```txt
Original RPG Creature ID
Owner Player ID
Current Level
Normalized Level, if applicable
Natural Growth Route
Variant Growth Route
Manual Stat Points Spent
Current Class Route
Current Class Tier
Learned Arts
Learned Skills
Learned Passives
Equipped Passives
Trainer Affinity
Rare Variant Status
Color Palette
Ruleset Eligibility Flags
```

Imported Ranked should not trust raw RPG creature objects without validation.

## Deterministic RNG Contract

Online battles should use deterministic seeded RNG.

The battle engine should not call uncontrolled global randomness during combat resolution.

Random events should pull from the battle RNG stream, including:

- Damage variance
- Accuracy rolls
- Critical rolls
- Randomized move effects, if any
- Status rolls, if added later

RNG seed should be created at battle start and shared by the authoritative battle session.

## Battle Event Log

Battle replays are not required for first implementation, but battle logs should be structured so replays are possible later.

The battle engine should emit a battle event log:

- Battle start
- Ruleset selected
- Creature eligibility validation
- Draft events, if applicable
- Round start
- Commands selected
- Combo previews
- Combo accepts/declines
- Turn order
- Hit/miss results
- Damage/healing results
- Knockouts
- Retargeting events
- Round-end effects
- Battle end result

A full replay viewer can be deferred.

## Boundary Rule

The data contract should separate source data from resolved runtime data.

The RPG may own:

- Creature acquisition
- Creature ownership
- Species growth
- Variant generation
- Class route progression
- Passive learning
- Art learning
- Skill learning
- Trainer Affinity progression
- Rare palette generation
- Economy and trading data

The shared combat core owns:

- Runtime stat consumption
- Command validation
- Damage resolution
- Accuracy/evasion resolution
- Turn order
- Targeting
- Retargeting
- Combo detection
- Combo resolution
- Status hooks
- Battle logging
- Ruleset validation hooks