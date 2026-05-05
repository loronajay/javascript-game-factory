# Battle Tuning Simulator v6

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
