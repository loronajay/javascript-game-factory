# Battle Tuning Simulator Scope

## Purpose

This tool exists to tune battle math by seeing damage happen in a lightweight visual simulation.

The goal is not to build the final battle scene. The goal is to make stat and damage problems visible quickly.

## Required tuning loop

1. Pick attacker and defender.
2. Start at Level 1.
3. Edit base stats until Level 1 damage feels sane.
4. Attack back and forth.
5. Watch HP percent lost, not just raw damage.
6. Raise level and tune growth per level.
7. Export stable base/growth values.

## Canon boundary

The simulator output can become canon data only after repeated matchup tests.

Do not lock canon values from a single matchup. Each creature needs to be tested against multiple roles:

- attacker into fragile target
- attacker into bruiser
- attacker into support
- support/healer under pressure
- tank/bruiser under magic pressure
- equal-level mirror or near-mirror

## Current formula

```txt
statAtLevel = floor(baseStat + growthPerLevel * (level - 1))
```

Damage:

```txt
rawDamage = basePower + offensiveStat * offensiveScaling + level * levelScaling
mitigation = defenseConstant / (defenseConstant + defensiveStat)
finalDamage = floor(rawDamage * mitigation * elementModifier * variance * criticalModifier)
```

Physical attacks use Strength against Defense.

Magic attacks use Intelligence against Spirit.

Healing preview uses:

```txt
heal = floor(baseHeal + spirit * scaling + level * levelScaling)
```
