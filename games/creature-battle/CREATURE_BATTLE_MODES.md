# Creature Battle Modes

## Purpose

This document defines how Creature Battle wraps the shared combat core.

Creature Battle modes may restrict creature source, items, variants, Trainer Affinity, passives, moves, level caps, or other legality rules. They must not reinterpret the shared combat rules.

## Mode Structure

Creature Battle should launch with a small set of battle modes that all use the same shared combat core.

## Training Battle

Single-player test battle against AI using rental creatures.

Purpose:

- Combat debugging
- Formula testing
- Move testing
- Combo testing
- New-player learning

Training Battle may allow the player to choose both teams manually.

Recommended legality:

```txt
Creature Source: Rentals
Items: Optional
Trainer Affinity: Disabled
Rare Variant Stat Differences: Disabled
Draft: Disabled
Ranked: No
```

## Direct Rental Battle

Players select full teams directly from the rental roster without drafting.

Purpose:

- Fast casual battles
- Friend matches
- AI testing
- Combo experiments
- Debugging specific team matchups

Direct Rental Battle is not the main ranked format because direct selection will make mirror-team and solved-meta problems appear faster.

Recommended legality:

```txt
Creature Source: Rentals
Items: Optional by ruleset
Trainer Affinity: Disabled
Rare Variant Stat Differences: Disabled
Draft: Disabled
Ranked: Optional later, not first priority
```

## Rental Draft Battle

Primary competitive baseline.

Rules:

- Uses the rental roster only
- Uses the draft rules defined in `RENTAL_ROSTER_AND_DRAFT.md`
- Supports local, private online, and ranked-ready formats
- Does not allow imported RPG creatures
- Does not allow rare variant stat differences

Rental Draft Battle is the first serious balance format.

Recommended legality:

```txt
Creature Source: Rentals
Items: Disabled in ranked
Trainer Affinity: Disabled
Rare Variant Stat Differences: Disabled
Draft: Enabled
Ranked: Yes
```

## Imported Battle

Imported Battle allows creatures raised in the RPG to enter Creature Battle.

Imported Battle may be casual, private, custom, or ranked depending on the ruleset.

Imported Battle must not reinterpret RPG progression. It should load resolved creature data and then apply the battle ruleset’s eligibility and normalization checks.

Recommended early legality:

```txt
Creature Source: RPG imports
Items: Ruleset-specific
Trainer Affinity: Disabled, normalized, or ruleset-specific
Rare Variant Stat Differences: Normalized or ruleset-specific
Draft: Optional future feature
Ranked: Separate Imported Ranked ladder only
```

Imported Battle should be tested in casual or custom forms before serious ranked use.

## Custom Battle

Flexible ruleset mode.

May eventually support:

- Imported RPG creatures
- Items
- Rare variants
- Custom level caps
- Custom timer rules
- Experimental passives
- Debug modifiers

Custom Battle should not define competitive balance.

Recommended legality:

```txt
Creature Source: Rentals, imports, or mixed
Items: Ruleset-specific
Trainer Affinity: Ruleset-specific
Rare Variant Stat Differences: Ruleset-specific
Draft: Optional
Ranked: No by default
```

## Mode Legality Matrix

| Mode | Rentals | Imports | Draft | Ranked | Items | Affinity | Rare Variant Stats |
|---|---:|---:|---:|---:|---:|---:|---:|
| Training Battle | Yes | No by default | No | No | Optional | Disabled | Disabled |
| Direct Rental Battle | Yes | No | No | Optional later | Optional | Disabled | Disabled |
| Rental Draft Battle | Yes | No | Yes | Yes | Disabled in ranked | Disabled | Disabled |
| Imported Battle | Optional | Yes | Optional later | Separate ladder only | Ruleset-specific | Disabled/normalized/ruleset-specific | Normalized/ruleset-specific |
| Custom Battle | Optional | Optional | Optional | No by default | Ruleset-specific | Ruleset-specific | Ruleset-specific |
