# Competitive Rulesets

## Purpose

This document defines ranked-capable ruleset families for Creature Battle.

The main design requirement is to support both rental competitive play and imported ranked play without letting RPG progression invalidate competitive integrity.

## Ranked Direction

Creature Battle should support multiple ranked-capable ruleset families over time.

Locked competitive direction:

- Rental Ranked is the first balance baseline.
- Rental Draft Ranked is the preferred first ranked format.
- Imported Ranked is in scope as a separate ruleset family.
- Imported Ranked must use eligibility gates and normalization rules.
- Raised RPG creatures should not enter Rental Ranked.
- Rare variant stat differences should not affect Rental Ranked.
- Items should be disabled in ranked rental modes at launch.
- Deterministic RNG is required for online competitive battles.
- Battle event logs are required for debugging and future replay support.

Recommended rollout:

```txt
1. Rental Draft Ranked
2. Imported Casual or Imported Custom
3. Imported Ranked after validation and normalization are stable
```

## Rental Ranked

Rental Ranked is the first competitive baseline.

Rental Ranked uses fixed rental creatures with controlled stats, fixed level, fixed move access, and controlled passive loadouts. This mode is the safest starting point for serious balance because every player has access to the same creature pool.

Rental Ranked may use:

- Direct rental selection
- Rental draft
- Fixed teams
- Rotating rental pools

The preferred first ranked format is Rental Draft Ranked.

Recommended ranked rental restrictions:

```txt
Creature Source: Rentals only
Imported RPG Creatures: Disabled
Items: Disabled
Trainer Affinity: Disabled
Rare Variant Stat Growth: Disabled
Rare Variant Palette: Cosmetic only if applicable
RNG: Deterministic
Battle Logs: Required
```

## Imported Ranked

Imported Ranked is in scope.

Imported Ranked allows creatures raised in the RPG to enter competitive battle, but only if they satisfy the mode’s qualification rules.

Imported Ranked should not be balanced as a free-for-all import mode. It needs a qualifying structure so players can bring personalized creatures without letting extreme RPG progression invalidate competitive play.

Imported Ranked should have its own ladder, matchmaking pool, and balance expectations separate from Rental Ranked.

Potential Imported Ranked qualifiers include:

- Level cap
- Team average level cap
- Stat budget cap
- Passive slot limit
- Move legality rules
- Variant normalization rules
- Trainer Affinity normalization rules
- Item restrictions
- Creature eligibility rules

The preferred early qualifier is a team average level cap.

Example:

```txt
Imported Ranked Level Cap: 30
Team Average Level Cap: 30
Allowed Team Example: Level 28 + Level 30 + Level 32 = Average 30
Blocked Team Example: Level 30 + Level 35 + Level 38 = Average 34.3
```

This allows some flexibility without letting one overleveled creature dominate the entire team structure.

## Imported Ranked Normalization

Imported Ranked should use explicit normalization rules.

Possible normalization rules:

```txt
Level normalization
Team average level cap
Maximum individual level cap
Stat budget cap
Variant stat normalization
Trainer Affinity normalization
Move legality filtering
Passive legality filtering
Item restriction
```

Recommended first imported ranked approach:

```txt
Team Average Level Cap: enabled
Maximum Individual Level Cap: enabled
Passive Slots: 3
Items: disabled
Trainer Affinity: disabled or normalized
Rare Variant Stat Growth: normalized or separately bracketed
Rare Variant Palette: allowed cosmetically
```

Imported Ranked should not share a ladder with Rental Ranked.

## Raised Creature Casual and Custom Modes

Raised RPG creatures should enter casual, custom, RPG-linked, or separate ruleset modes before being allowed into serious ranked formats.

This allows imported creature support to be tested without contaminating the first rental balance baseline.

## Items in Ranked

Items are a valid battle command, but ranked rental modes should disable items at launch.

Reason:

- Items add inventory assumptions.
- Items add economy assumptions.
- Items add comeback volatility.
- Items add balance noise.
- Items make rental-ranked testing harder.

Items may be enabled in:

- Training Battle
- Direct Rental Battle
- Imported Casual
- Custom Battle
- RPG-linked battle modes

Items should only be enabled in Imported Ranked if the ruleset explicitly supports item legality and item access constraints.

## Trainer Affinity in Competitive Play

Trainer Affinity should be disabled in Rental Ranked and Rental Draft Ranked.

In Imported Ranked, Trainer Affinity should be one of:

```txt
Disabled
Normalized
Capped
Bracketed into separate format
Converted into explicit ruleset-defined effect
```

Trainer Affinity should not become invisible stat inflation in serious competitive modes.

## Rare Variants in Competitive Play

Rare variant palettes may be cosmetic in normalized competitive formats.

Rare variant stat growth should be disabled, normalized, or moved into a separate bracket unless the format is explicitly built around raised-creature variance.

Recommended first rule:

```txt
Rental Ranked: variant stats disabled
Imported Casual: variant stats allowed by mode
Imported Ranked: variant stats normalized or separately bracketed
```

## Future Decisions

Future decisions include:

- Exact imported ranked level caps
- Exact team average level cap values
- Whether imported ranked uses stat budget caps
- Whether imported ranked allows rare variant stat differences
- Whether Trainer Affinity is disabled, normalized, or bracketed in imported ranked
- Whether imported ranked allows items
- Whether advanced ladders support raised creatures with partial normalization
- Whether battle replays are needed at launch or later

Hard recommendation:

- Start with Rental Draft Ranked.
- Build Imported Casual or Imported Custom next.
- Add Imported Ranked only after imported data validation, normalization, and matchmaking rules are stable.
