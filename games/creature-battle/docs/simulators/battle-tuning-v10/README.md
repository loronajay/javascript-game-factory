# Battle Tuning Simulator v10

Open `index.html` in a browser. No server or build step required.

This is a lightweight 1v1 visual battle simulator for tuning creature stats and damage values.

## Current behavior

- Select the left and right creatures.
- Start at Level 1 by default.
- Edit base stats directly for each selected creature.
- Edit growth per level for each selected creature.
- Edit elemental resistance multipliers.
- Select legal moves for each creature based on level.
- Attack back and forth.
- Damage or healing appears above the target/source.
- HP and MP update in real time.
- Export the current tuned values to JSON.

## Why Level 1

The formula now uses:

```txt
statAtLevel = floor(baseStat + growthPerLevel * (level - 1))
```

That means base stats are true Level 1 starting stats.

Level 20+ testing should happen after Level 1 feels sane.

## Important limitation

Utility effects are present as moves but not fully implemented yet. They log as utility placeholders. Damage and healing are implemented.

## Seed data status

The creature and move values are provisional. The scoped creature documents gave strong direction for roles, stat bias, Arts, power tiers, MP costs, accuracy, and element. Exact base stats and growth values still need tuning.

## v4 battle-layout patch

This version changes the visual structure to match the provided battle-screen reference more closely:

- status HUDs are detached from the sprites and pinned near the top of the battlefield
- both active creatures stand on the same center arena row
- left unit is center-left and right unit is center-right
- right unit is flipped to face inward
- bottom controls are styled more like a command strip

This is still a placeholder simulator, not final production battle UI.

## v5 HUD clipping patch

This version keeps the corrected center-row creature placement from v4, but restores HUD cards to normal in-panel layout instead of fixed positioning. This prevents HP/MP panels from being clipped by the simulator viewport.


## v6 shared-core formula patch

This version replaces the simplified mitigation formula with the scoped Shared Combat Core damage calculation.

Removed:

```txt
damage × defenseConstant / (defenseConstant + defensiveStat)
```

Current:

```txt
Damage =
(
  BasePower
  + MovePowerModifier
  + ((OffensiveStat - DefensiveStat) × 0.50)
  + LevelModifier
)
× ElementModifier
× TargetCountModifier
× DefendModifier
× PassiveDamageModifier
× PassiveResistanceModifier
× CriticalModifier
+ RandomDamageModifier
```

Physical uses Strength vs Defense.
Magic uses Intelligence vs Spirit.
LevelModifier = Level × 0.75.
RandomDamageModifier = additive -2 to +4.


## v7 raised-creature simulation patch

Adds:

- Individual base stat variance
- Individual growth variance
- Manual stat allocation
- Diminishing manual stat points by level band
- Allocation only into Strength, Defense, Intelligence, Spirit, and Speed
- Class-route preview from highest allocated stat or tied highest stats
- Daredevil/no-allocation eligibility tracking
- Raised-creature snapshot export

Base stats remain Level 1 values:

```txt
RuntimeStat = floor((BaseStat + BaseVariance) + (GrowthPerLevel + GrowthVariance) × (Level - 1)) + ManualAllocation
```

Manual allocation does not directly spend into HP or MP. For tuning only, allocation contributes derived HP/MP bonuses:

```txt
HP bonus = floor(StrengthAllocation × 0.60 + DefenseAllocation × 0.90)
MP bonus = floor(IntelligenceAllocation × 0.70 + SpiritAllocation × 0.70)
```


## v8 manual stat cap patch

Adds a hard per-stat allocation cap.

Default rule:

```txt
ManualStatCapPerStat = (Level - 1) × 4
```

Creatures still receive:

```txt
ManualStatPointsAvailable = (Level - 1) × 8
```

So no single stat can receive more than half of the creature's manually earned stat points. This prevents degenerate all-in builds while preserving specialization.


## v9 natural level-up variance patch

Variance is no longer an editable static offset.

Each creature now receives automatic natural variance rolls on every level-up:

```txt
For each stat, on each level-up:
NaturalVarianceRoll = random value from +0.25 to +1.25
```

The simulator stores these rolls per creature side and accumulates them from Level 2 onward.

```txt
RuntimeStat =
floor(BaseStat + SpeciesGrowth × (Level - 1) + AccumulatedNaturalVariance)
+ ManualAllocation
```

This means two creatures of the same species can naturally diverge as they level even with identical manual allocation.

The variance range is intentionally fixed in the simulator for now. Use Reroll Natural Variance to test different individuals.


## v10 diminishing manual allocation patch

Flat 8-points-per-level allocation has been removed.

Manual stat points now follow the canon diminishing curve:

```txt
Level 2–20: +8 points per level-up
Level 21–35: +6 points per level-up
Level 36–50: +4 points per level-up
Level 51–69: +2 points per level-up
Level 70+: +1 point per level-up
```

The single-stat allocation cap is also hardcoded by the points earned at each level:

```txt
8 or 6 points earned: max 3 into one stat for that level
4 points earned: max 2 into one stat for that level
2 or 1 points earned: max 1 into one stat for that level
```

The simulator now sums those level-by-level values to calculate both total available manual points and total per-stat cap at the selected level. The editable `Manual Cap / Stat / Lv` control was removed because the cap is now canon, not a tuning knob.
