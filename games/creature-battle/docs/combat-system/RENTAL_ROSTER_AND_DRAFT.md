# Rental Roster and Draft

## Purpose

This document defines Creature Battler’s rental creature baseline and rental draft structure.

Rental creatures are the first serious balance target because they are controlled, predictable, and available to all players.

## Rental Creature Purpose

Creature Battler should support rental creatures from the beginning.

Rental creatures allow players to battle immediately without owning or raising creatures in the RPG.

Rental creatures use the same battle data format as raised creatures. The difference is that rental creatures are predefined instead of generated through RPG progression.

Rental creatures are important for:

- Free battles
- AI battles
- Local testing
- Private battles
- Competitive formats
- Balance testing
- Draft mode

Rental mode prevents Creature Battler from depending entirely on RPG progress.

## Starter Rental Roster Size

A first rental roster of 12 creatures is the current recommended baseline.

For 3v3 draft testing:

```txt
2 total bans
6 total drafted creatures
4 undrafted leftovers
```

This gives enough draft decision space without making balance unmanageable.

## Starter Rental Roster Candidates

The first rental roster should contain 12 creatures.

| Creature | Element | Role |
|---|---|---|
| Flor | Gaia | Sustain/control |
| Salamander | Fire | Art pressure / fire offense |
| Aquaphant | Water | Sustain bruiser |
| Pengun | Ice | Control/debuff |
| Clod | Earth | Physical tank / cleanup |
| Galeon | Wind | Speed/tempo combo setup |
| Voltwing | Wind | Evasive pressure / multi-target setup |
| Lumora | Light | Support / cleansing / accuracy stability |
| Nocthorn | Dark | Risk/reward offense / disruption |
| Emberjaw | Fire | Physical elemental attacker |
| Tidecalf | Water | Defensive support / MP-efficient Arts |
| Gravemoss | Earth | Anti-physical wall / attrition |

Old creature concepts may be migrated as rental roster seeds, but old numerical values are deprecated because the older system used different stats such as Agility and Utility.

The roles and element coverage matter more than preserving old stat sheets.

## Rental Creature Data Requirements

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

Rental roster archetypes should be locked before exact stats are tuned.

## Rental Stat Package Rule

Rental creatures should use controlled stat packages instead of freeform stat design.

Each rental creature receives:

- One high stat
- Two medium stats
- One low-medium stat
- One clear weakness stat

No rental creature should start with top-tier Speed and top-tier damage unless it has severe resource, accuracy, or durability weaknesses.

## Draft Rules

Creature Battle competitive/private scope includes a draft phase.

Current draft rules:

1. Coin toss determines draft initiative.
2. Player A bans one creature.
3. Player B bans one creature.
4. Player A picks one creature.
5. Player B picks two creatures.
6. Player A picks two creatures.
7. Player B picks one creature.

This creates a `1-2-2-1` pick order after bans.

Final teams:

```txt
Player A: 3 creatures
Player B: 3 creatures
```

Rental creatures should be the first competitive baseline because they are easier to balance than imported RPG creatures.

## Duplicate and Mirror Pick Rules

Rental Draft Battle:

- A creature may only be drafted once.
- Mirror picks are not allowed.
- Once a creature is drafted by one player, it is unavailable to the other player.

Direct Rental Battle:

- Mirror picks are allowed.
- Duplicate picks on the same team are disabled by default.
- Custom Battle may enable duplicates later.

## Draft Implementation Notes

The draft interface should clearly show:

- Remaining rental pool
- Banned creatures
- Player A picks
- Player B picks
- Current draft step
- Creature role summary
- Element
- Draft strength
- Draft weakness
- Known combo tags

Draft selections should be logged as part of battle setup for future replay and dispute review.
