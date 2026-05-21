# Combat Damage Formulas Used By Simulator v6

The simulator now uses the scoped Shared Combat Core formula.

## Stat Growth

```txt
RuntimeStatAtLevel = floor(BaseStat + GrowthPerLevel × (Level - 1))
```

Base stats are Level 1 values.

## Damage

```txt
Damage =
(
  BasePower
  + MovePowerModifier
  + ((OffensiveStat - DefensiveStat) × 0.50)
  + LevelModifier
)
× ElementModifierIfAny
× TargetCountModifier
× DefendModifier
× PassiveDamageModifiers
× PassiveResistanceModifiers
× CriticalModifier
+ RandomDamageModifier
```

## Stat Pairing

```txt
Physical = Strength vs Defense
Magic = Intelligence vs Spirit
```

## Constants

```txt
LevelModifier = Level × 0.75
CriticalModifier = 1.50
RandomDamageModifier = -2 to +4
DefendModifier = 0.50
MinimumDamage = 1
MaximumDamage = 9999
```

The older mitigation formula is no longer used.
