# Shared Combat Core

## Purpose

This document defines the battle engine rules shared by the unnamed creature RPG and Creature Battle.

The shared combat core owns combat resolution. Game wrappers may provide creatures, rulesets, UI, matchmaking, progression, rewards, or eligibility restrictions, but they should not duplicate or reinterpret combat logic.

## Battle Format

Battles can scale up to 3v3.

Each side may have up to three active creatures.

Internally, the battlefield should be represented as ordered slot lists, not raw coordinates:

```txt
playerSlots = [top, middle, bottom]
enemySlots  = [top, middle, bottom]
```

The visual battle layout may position creatures however the scene requires, but targeting logic, retargeting, combo participation, action validation, active battle state, and battle logs should operate on slot lists.

This supports:

- 1v1
- 2v2
- 3v3
- Full-party targeting
- Three-slot targeting patterns
- Slot-aware retargeting
- Future spectator and replay clarity

## Round Flow

Each round follows a command-planning structure:

1. Player selects commands.
2. Opponent selects commands.
3. The battle system checks for available combos.
4. Available combos are previewed.
5. The player may accept or decline combos.
6. Accepted combos consume the participant commands.
7. Actions are placed into turn order.
8. Actions resolve according to Speed, action rules, targeting rules, and priority rules.
9. Round-end effects resolve.
10. Battle continues until a win, loss, flee, forfeit, timer rule, or battle-specific end condition occurs.

All command selection should be complete before action resolution begins. This preserves the planned-command identity of the battle system.

## Battle Commands

Each active creature can select one command during command input.

### Attack

A basic physical action.

Default behavior:

- Uses the Physical damage formula
- Uses Strength against Defense
- Has a basic Attack Base Power defined by ruleset or creature defaults
- Has no element by default
- Has no MP cost by default

Attack should remain useful, but it should not outperform Skills, Arts, or combos when those actions are properly paid for and set up.

### Defend

A defensive action.

Defend reduces incoming damage for the round and should be represented as a modifier in the damage pipeline.

Prototype Defend behavior:

```txt
DefendModifier = 0.50
```

This means incoming damage is reduced to 50% unless a move, Skill, Passive, or ruleset modifies Defend behavior.

Defend may also become a combo setup tool later if specific combos require defensive posture, guard timing, or protection tags.

### Art

Magic-style commands.

Arts usually consume MP. Damaging Arts usually use Magic damage, which scales from Intelligence against Spirit. Arts may be elemental or non-elemental. Elemental Arts apply the elemental matchup table.

Each damaging Art must define its own Base Power. The fact that a command is an Art does not remove the need for base damage data.

Arts are the primary expression of creature element identity.

Arts are usually determined by species identity rather than class route.

### Skill

Active class-based abilities.

Skills may be physical, elemental physical, support, status, resource-based, utility-based, combo-oriented, or custom-rule actions.

Skills may cost:

- Nothing
- MP
- HP
- HP and MP
- Percent Current HP
- Percent Max HP
- A future special resource

Skill cost is defined per Skill. There is no universal Skill cost rule.

### Item

Uses an item during battle.

Item rules are locked as a command type, but item legality is ruleset-specific.

Ranked rental modes should disable items at launch. Items add inventory assumptions, economy assumptions, comeback volatility, and balance noise. Training, direct battle, casual, custom, and RPG-linked battle modes may allow items if the ruleset explicitly enables them.

## Runtime Creature Stats

Creatures use five primary combat stats:

- Strength
- Defense
- Intelligence
- Spirit
- Speed

These stats may come from rental data, RPG progression, species growth, variant growth, manual stat allocation, temporary effects, Passives, or battle modifiers. The battle engine should only care about the resolved runtime values.

### Strength

Controls physical damage output.

Strength is used by:

- Basic Attack
- Physical Skills
- Elemental Physical Skills
- Physical combos
- Some hybrid combo calculations

### Defense

Controls physical resistance and mitigation.

Defense is used against:

- Basic Attack
- Physical Skills
- Elemental Physical Skills
- Physical combos
- Some hybrid combo calculations

### Intelligence

Controls Art damage output.

Intelligence also influences derived Accuracy and Evasion.

Intelligence is used by:

- Art damage
- Some support Arts
- Some healing moves
- Some hybrid combo calculations
- Derived Accuracy
- Derived Evasion

### Spirit

Controls Art resistance and magical mitigation.

Spirit is the best fit for Passives that improve elemental resistance, Art resistance, absorption behavior, and magical survivability.

Spirit may also scale restorative, cleansing, warding, or defensive support actions.

### Speed

Controls turn order and tempo.

Speed also influences derived Accuracy and Evasion. Speed-based routes should focus on initiative, turn-order pressure, combo setup, evasive pressure, and tempo control. Speed should not also become the highest raw damage route.

Speed is already high-value because it affects action order. Accuracy and Evasion contributions should be modest to avoid making Speed the dominant universal stat.

## Runtime Resource and State Stats

### Level

Level represents creature progression, but it is also a runtime input for battle formulas.

The battle engine may use LevelModifier in damage, healing, accuracy, or scaling formulas.

Prototype:

```txt
LevelModifier = Level × 0.75
```

For rental Creature Battle, creatures should usually use a fixed level within a ruleset.

For imported ranked modes, Level is part of eligibility and normalization.

### HP

Creature health. If HP reaches zero, the creature is knocked out or otherwise unable to continue fighting.

A knocked-out creature cannot act, cannot participate in combos, and cannot be selected as a valid target unless a move explicitly targets knocked-out creatures.

### MP

Resource used mainly for Arts and some Skills.

MP costs should be data-defined. Arts primarily use MP. Skills may use MP, HP, both, no cost, or future special resources.

### Trainer Affinity

Trainer Affinity is locked as a stat, but it should not affect Rental Ranked or Rental Draft Ranked at launch.

Initial rule:

- Trainer Affinity may be loaded into battle data.
- Trainer Affinity may be visible to the engine.
- Trainer Affinity has no default battle effect.
- A ruleset must explicitly enable Affinity effects.

Potential future battle uses include:

- Combo bonuses
- Loyalty effects
- Special unlocks
- Minor consistency bonuses
- Creature personality behavior

Trainer Affinity belongs naturally to the RPG creature-raising layer. If enabled in ranked imported modes, it should be normalized, capped, or converted into a ruleset-defined effect so it does not become invisible stat inflation.

## Hidden or Semi-Hidden Derived Stats

The system includes derived stats that are not manually allocated.

### Accuracy

Accuracy determines how reliable a creature is at landing actions.

Accuracy is influenced by:

- Speed
- Intelligence
- Species accuracy tendency
- Variant modifiers
- Status effects
- Passives
- Field effects, if added later

Prototype:

```txt
Accuracy =
SpeciesAccuracyBase
+ (Speed × 0.15)
+ (Intelligence × 0.10)
+ PassiveAccuracyModifiers
+ StatusAccuracyModifiers
```

### Evasion

Evasion determines how difficult a creature is to hit.

Evasion is influenced by:

- Speed
- Intelligence
- Species evasion tendency
- Variant modifiers
- Status effects
- Passives
- Field effects, if added later

Prototype:

```txt
Evasion =
SpeciesEvasionBase
+ (Speed × 0.15)
+ (Intelligence × 0.10)
+ PassiveEvasionModifiers
+ StatusEvasionModifiers
```

### Hit Chance

Arts and Skills have base accuracy values. Final hit chance should account for move accuracy, attacker Accuracy, target Evasion, and modifiers.

Prototype:

```txt
Final Hit Chance =
Move Base Accuracy
+ ((Attacker Accuracy - Target Evasion) × 0.25)
+/- Status, Passive, Field, and Class Modifiers
```

Hit chance clamp:

```txt
Minimum normal hit chance: 75%
Maximum normal hit chance: 98%
Risky move minimum: may be lower, but not below 50%
Guaranteed moves: may bypass the normal maximum if explicitly tagged
```

Hard balance rule: normal actions should remain reasonably reliable. Constant misses are not depth. Risky Skills may have lower accuracy if the payoff justifies it.

## Active Skills in Battle

Active Skills are class-based battle commands.

Once learned, active Skills remain available in the creature’s Skill menu.

Active Skills are not equipped before battle.

A Skill may be unavailable during battle if:

- The creature does not have enough MP, HP, or required resource.
- The Skill is disabled by a status effect.
- The Skill has a cooldown, if cooldowns are added later.
- The battle mode restricts that Skill.
- The creature is knocked out or otherwise unable to act.

### Weaker Skill Versions Remain Selectable

Stronger versions of Skills do not automatically replace weaker versions by default.

If a creature knows:

```txt
Cleave
Cleave II
Cleave III
```

All three may remain available in the Skill menu.

Reason: weaker Skills may be useful for:

- Catching creatures
- Avoiding overkill
- Special battle objectives
- Conserving resources
- Controlling damage output
- Setting up combo conditions
- Manipulating battle state

This means the Skill menu needs strong organization through metadata such as Skill family, rank, category, power, cost, targeting, and combo tags.

### Skill Cost Rules

Move costs are data-defined.

Allowed cost types:

```txt
None
Flat MP
Flat HP
Flat HP and MP
Percent Current HP
Percent Max HP
Future special resource
```

Prototype guidance:

- Arts primarily use flat MP costs.
- Skills may use flat MP, flat HP, or mixed costs.
- Percent HP costs should be reserved for high-risk Skills.
- HP-cost moves cannot reduce the user below 1 HP unless the move is explicitly tagged as self-sacrificing.
- If the user cannot pay the cost, the move cannot be selected.

Cost tier guidance:

```txt
Minimal: 3–5 MP
Moderate: 6–10 MP
Heavy: 11–18 MP
Massive: 19+ MP
```

Exact values depend on starter MP pools and rental roster tuning.

## Passives in Battle

Passives are class-based unlocked modifiers.

Passives are not selected during battle. They modify creature behavior, stats, resources, damage, resistance, targeting, combo behavior, accuracy, evasion, or other battle properties.

Each creature has exactly 3 passive slots.

Before battle, the player may equip up to 3 learned Passives to that creature.

A creature may equip fewer than 3 Passives if:

- The player chooses fewer.
- The creature has not learned enough Passives yet.
- The battle mode restricts certain Passives.

Passives are the primary build-loadout constraint. Active Skills are not equip-limited under current design.

### Passive Categories

Passives should be grouped by function so the 3-slot limit remains readable.

Passive categories:

```txt
Stat Passives
Damage Passives
Resistance Passives
Resource Passives
Tempo Passives
Combo Passives
Status Passives
Utility Passives
```

Stat Passives modify runtime stats or derived stats.

Damage Passives modify outgoing damage.

Resistance Passives modify incoming damage.

Resource Passives modify MP, HP, costs, or recovery.

Tempo Passives modify turn order, Speed interaction, or action timing.

Combo Passives modify combo availability, combo cost, combo damage, or combo reliability.

Status Passives modify status application, resistance, cleansing, or duration if status effects are added.

Utility Passives cover custom-rule effects that do not fit cleanly elsewhere.

### Spirit and Resistance Passives

Spirit routes are a strong fit for elemental resistance and Art resistance Passives.

Examples of possible Spirit-route or Spirit-hybrid Passive themes:

- Fire resistance
- Water resistance
- Elemental resistance
- Art damage reduction
- Absorption improvement
- Light/Dark warding
- Status cleansing support
- Magical damage mitigation

Hybrid Spirit routes can specialize this further:

- Strength / Spirit: resist magic while counterattacking
- Defense / Spirit: anti-Art tanking
- Intelligence / Spirit: Art manipulation and high-end magical control
- Spirit / Speed: evasive support and timed resistance

## Arts

Arts are magic-style abilities.

Arts are primarily determined by creature species and element identity.

Arts usually consume MP.

Arts use Intelligence against Spirit.

Arts may be elemental or non-elemental.

Elemental Arts apply the element matchup table. Non-elemental Arts use neutral element behavior.

### Arts vs Skills

Arts and Skills are separate systems.

Arts express species and element identity.

Skills express class and stat-build identity.

A creature’s species may define its base Arts, while stat development and class routing define its Skills and Passives.

### Species Art List Scope

Each species should have a small base Art identity.

Prototype Art list structure:

- 1 basic elemental Art
- 1 utility or support Art
- 1 stronger elemental Art
- 1 late or high-cost signature Art
- Optional non-elemental Art if the species role needs it

Starter rental creatures should have enough Arts to show their role, but not so many that rental testing becomes unreadable.

First rental roster target:

```txt
3–4 Arts per creature
```

The Skill and Passive systems already add menu complexity, so early Art lists should be controlled.

## Elements

Current scoped elements:

```txt
Fire
Water
Wind
Earth
Gaia
Ice
Light
Dark
```

Element matchup results:

```txt
x1.5 = strong against
=    = neutral
1/2  = resisted
+    = absorbed / heals target
```

If a target absorbs the incoming element, damage becomes healing instead of damage.

Absorption should be previewed clearly in the battle UI when possible. If a player accidentally heals an enemy because absorption was hidden, the system will feel unfair.

Element relationships should be authored in data rather than hardcoded throughout the engine.

## Damage Type, Base Power, and Element Mode

Damage type, base power, command source, and element are separate fields.

This prevents the system from incorrectly assuming that all magic is elemental, all elemental attacks are magic, or all Arts use the same damage behavior.

### Damage Types

Current damage types:

```txt
Physical
Magic
Hybrid
Utility / Non-damaging
```

Damage type determines stat scaling:

```txt
Physical damage = Strength vs Defense
Magic damage    = Intelligence vs Spirit
Hybrid damage   = explicit combo or move formula
Utility         = no standard damage formula unless explicitly defined
```

All damaging moves must define Base Power.

This includes:

- Basic Attack
- Damaging Arts
- Damaging Skills
- Damaging combo results
- Elemental physical moves
- Non-elemental magic moves

Base Power is the move's starting damage value before stat pressure, level scaling, target count scaling, defensive modifiers, passive modifiers, elemental modifiers, critical modifiers, random variance, and final clamp are applied.

### Command Source vs Damage Type

Command source describes where the action appears in the battle menu. Damage type describes how the action scales.

Examples:

```txt
Attack command -> usually Physical damage
Art command    -> usually Magic damage
Skill command  -> Physical, Magic, Hybrid, Utility, or custom
Combo result   -> Physical, Magic, Hybrid, Utility, or custom
Item command   -> fixed effect, healing, utility, or explicit damage if allowed
```

Arts are still the primary expression of creature element identity, but an Art being elemental does not decide its scaling by itself. Its damage type does.

### Element Mode

Element mode may be:

```txt
None
Fire
Water
Wind
Earth
Gaia
Ice
Light
Dark
```

Element mode is a matchup layer. It is not the stat-scaling layer.

A move may be:

```txt
Physical / Non-elemental
Physical / Elemental
Magic / Non-elemental
Magic / Elemental
Hybrid / Elemental or Non-elemental
Utility / Elemental or Non-elemental, if the effect needs element identity
```

### Damage-Type Matrix

```txt
Basic Attack:
Command: Attack
Damage Type: Physical
Element Mode: None by default
Scaling: Strength vs Defense
Base Power: defined by ruleset or creature default

Physical Skill:
Command: Skill
Damage Type: Physical
Element Mode: None
Scaling: Strength vs Defense
Base Power: defined by move data

Elemental Physical Skill:
Command: Skill
Damage Type: Physical
Element Mode: Fire / Water / Wind / Earth / Gaia / Ice / Light / Dark
Scaling: Strength vs Defense
Base Power: defined by move data

Non-elemental Magic Art:
Command: Art
Damage Type: Magic
Element Mode: None
Scaling: Intelligence vs Spirit
Base Power: defined by move data

Elemental Magic Art:
Command: Art
Damage Type: Magic
Element Mode: Fire / Water / Wind / Earth / Gaia / Ice / Light / Dark
Scaling: Intelligence vs Spirit
Base Power: defined by move data
```

Current rule:

- Strength is factored into all Physical damaging moves.
- Intelligence is factored into all Magic damaging moves.
- Element is applied separately from stat scaling.
- Basic Attack is Physical and non-elemental by default.
- Every damaging Art and Skill needs explicit Base Power in move data.

## Damage Formula Scope

The system should preserve the older variable-rich philosophy while enforcing a clean order of operations.

Complexity is acceptable if every variable has a defined job and stacking is controlled.

### Shared Damaging Move Variables

```txt
BasePower
MovePowerModifier
DamageType
ElementMode
OffensiveStat
DefensiveStat
LevelModifier
RandomDamageModifier
CriticalModifier
ElementModifier, if any
PassiveDamageModifiers
PassiveResistanceModifiers
DefendModifier
TargetCountModifier
FinalDamageCap
```

`BasePower` is required for every damaging move.

`OffensiveStat` and `DefensiveStat` are selected from DamageType:

```txt
Physical: OffensiveStat = Strength, DefensiveStat = Defense
Magic:    OffensiveStat = Intelligence, DefensiveStat = Spirit
Hybrid:   Uses explicit move or combo formula
```

### Prototype Physical Formula

Physical damage is used by Basic Attack, physical Skills, elemental physical Skills, physical combo results, and any other damaging move with `DamageType = Physical`.

```txt
PhysicalDamage =
(
  BasePower
  + MovePowerModifier
  + ((AttackerStrength - TargetDefense) × 0.50)
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

For non-elemental Physical damage, `ElementModifierIfAny = 1.0`.

### Prototype Magic Formula

Magic damage is used by damaging Arts, magic Skills, magic combo results, and any other damaging move with `DamageType = Magic`.

```txt
MagicDamage =
(
  BasePower
  + MovePowerModifier
  + ((AttackerIntelligence - TargetSpirit) × 0.50)
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

For non-elemental Magic damage, `ElementModifierIfAny = 1.0`.

### Hybrid and Utility Damage

Hybrid damage must define its scaling explicitly in move or combo data.

Examples:

```txt
Average Strength and Intelligence vs average Defense and Spirit
Strength-weighted hybrid damage
Intelligence-weighted hybrid damage
Fixed base damage with no stat pressure
Custom effect that does not use normal damage
```

Utility moves do not use standard damage unless the move data explicitly defines a damage behavior.

### Damage Clamp

Final damage should be clamped.

```txt
Minimum damage: 1 unless immune, absorbed, or explicitly nullified
Maximum damage: 9999
```

Damage that becomes healing through absorption should not be clamped as damage after conversion. It should be converted from the final incoming elemental damage amount.

## Damage Balance Targets

Early benchmark:

- Average attacker Strength into average target Defense should produce roughly 32 damage from a normal early physical attack before special modifiers.
- A small random damage addition such as -2 to +4 may apply at early levels.
- This would produce roughly 30–36 damage from a 32-damage baseline.

Art benchmark:

- Average attacker Intelligence into average target Spirit should produce comparable Art damage or slightly higher damage.
- Arts may be slightly stronger because they usually cost MP and interact with elemental weakness, resistance, or absorption.

Role distinction:

- Physical attacks matter against low-Defense targets.
- Arts matter against low-Spirit targets.
- Neither should fully replace the other.

Formula coefficients are prototype values. The architecture should make them easy to tune without rewriting move data.

## Move Potency Tiers

Move potency tiers from the older design are worth preserving conceptually.

Damage tiers:

```txt
Minimal Damage
Moderate Damage
Heavy Damage
Massive Damage
```

Healing tiers:

```txt
Minimal Heal
Moderate Heal
Abundant Heal
Substantial Heal
```

Exact numeric values are not locked.

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

Move potency should not be inferred only from display name. It needs data. Damaging Arts and Skills must not rely only on stat scaling; each damaging move needs Base Power.

## Healing

Healing should support potency tiers and may scale from relevant stats depending on the move.

Potential scaling sources:

- Intelligence
- Spirit
- Level
- Move potency
- Passive modifiers
- Elemental absorption conversion

Prototype healing formula:

```txt
HealingAmount =
BaseHealPower
+ MovePowerModifier
+ RelevantStatPressure
+ LevelModifier
+ PassiveHealingModifiers
+ RandomHealingModifier
```

Prototype stat pressure:

```txt
RelevantStatPressure = RelevantStat × 0.35
```

RelevantStat may use:

- Spirit for restorative, defensive, cleansing, or warding heals
- Intelligence for technical, magical, or Art-based heals
- A fixed value for item healing

Healing should not crit by default.

Absorption healing should be calculated by converting final incoming elemental damage into healing rather than using a separate healing formula.

## Critical Hits

Critical hits are supported but simple.

Prototype:

```txt
Base critical chance: 5%
Critical multiplier: 1.5× final pre-clamp damage
```

Critical chance may be modified by Skills, Passives, move data, or future status effects.

Critical hits do not ignore Defense or Spirit by default.

Healing does not crit by default.

Absorption healing does not crit by default.

CriticalModifier is applied after defensive and elemental modifiers but before final damage clamp.

Crits must be balanced carefully because the system already includes accuracy, evasion, elemental matchup, passives, and combos.

## Target Patterns and Multi-Target Scaling

Target pattern should be data-driven.

Current target patterns:

```txt
One
Three
All
Self
Party
Field
```

Multi-target scaling should preserve the useful concept from the older system.

Suggested scaling:

```txt
Single target:
100% damage to one target

Three-target pattern:
Center target receives 100%
Adjacent/secondary targets receive 80%

Full-party spread:
All valid targets receive reduced damage, likely 60–75% depending on move
```

Exact values may be tuned later.

Support and healing moves may use separate scaling rules.

## Targeting and Retargeting

Battle targets are ordered by active battle slot list.

If a creature’s selected target is knocked out before the acting creature resolves its command, the command automatically retargets to the next valid target upward in the target list.

If the search reaches the top of the list, it wraps back to the bottom and continues until a valid target is found.

If no valid target exists, the command fails.

Example:

- Enemy slots are ordered Top, Middle, Bottom.
- A creature targets Bottom.
- Bottom is knocked out before the command resolves.
- The command checks Middle.
- If Middle is alive, the command retargets to Middle.
- If Middle is knocked out, the command checks Top.
- If Top is also knocked out, no valid target remains and the command fails.

This applies to Attacks, Arts, Skills, and targeted item effects unless a specific command explicitly disables automatic retargeting.

Retargeting should emit a battle log event so players, spectators, and future replay systems can understand what happened.

## Speed and Turn Order

Speed determines action order.

### Normal Actions

A normal action uses the acting creature’s Speed.

### Combo Actions

A combo action uses the average Speed of all participating combo creatures unless combo data defines a special rule.

Example:

- Creature A Speed: 30
- Creature B Speed: 50
- Combo Speed: 40

The combo is placed into turn order using 40 Speed.

### Speed Ties

Speed ties should resolve deterministically.

Tie-break order:

1. Action priority value, if any
2. Acting creature Speed
3. Move speed modifier, if any
4. Team initiative value from battle start
5. Slot order

Default slot order:

```txt
Player side: Top, Middle, Bottom
Enemy side: Top, Middle, Bottom
```

For PvP, team initiative may be assigned at battle start or derived from the draft/coin-toss flow.

Random tie-breaks should be avoided in competitive modes. Random tie-breaks are hard to explain and feel cheap in a planned-command battle system.

## Combo System

The combo system is a core feature.

Combos are predetermined and data-based.

The game does not invent combos dynamically unless a combo has been explicitly authored in data.

Example:

```txt
Whirlwind + Flare = Flare Cyclone
```

### Combo Detection

After commands are selected, the battle system checks whether selected moves create a valid combo.

Valid combos are defined by combo data.

### Combo Preview

If a combo is available, the player is alerted before the combo executes.

The preview should show:

- Combo name
- Participating creatures
- Source moves
- Resulting effect summary
- Damage type
- Base Power or effect basis
- Element mode, if any
- Targeting behavior
- Costs
- Drawbacks
- Whether all participant turns are consumed

### Combo Choice

The player may accept or decline the combo.

If declined, the original selected commands resolve normally.

### Combo Turn Consumption

Accepted combos consume all participant turns.

A 2-creature combo consumes both participant actions.

A 3-creature combo consumes all three participant actions.

### Combo Cancellation on Knockout

If a combo has been accepted but one or more required combo participants are knocked out before the combo resolves, the combo is canceled.

When this happens, surviving combo participants do not automatically lose their turns.

Instead, each surviving participant reverts to the original command selected before the combo was accepted.

Example:

- Creature A selects Whirlwind.
- Creature B selects Flare.
- The player accepts Flare Cyclone.
- Before the combo resolves, Creature B is knocked out.
- Flare Cyclone is canceled.
- Creature A still executes Whirlwind.
- Creature B does not act because it is knocked out.

### Two-Creature Combos

Two-creature combos are the standard combo type.

They should be common enough to define team identity but not so common that every turn becomes a combo.

### Three-Creature Combos

Three-creature combos are in scope as rare full-team synergy tools.

Prototype limits:

- Maximum one accepted 3-creature combo per team per battle, unless the battle mode overrides this.
- A 3-creature combo consumes all three participant actions.
- A 3-creature combo must have clearly previewed cost, drawback, or disruption risk.
- A 3-creature combo should not be strictly better than two strong 2-creature combos in every situation.
- 3-creature combos should usually require specific move families, elements, species, or combo tags.
- If any participant is knocked out before resolution, the combo cancels under the existing combo cancellation rule.

Balance purpose:

Three-creature combos should feel like full-team synergy finishers or major swing plays, not the default best action every round.

### Combo Damage Types

A combo should define its damage type and Base Power or effect basis:

```txt
Physical Combo
Magic Combo
Hybrid Combo
Utility Combo
```

Physical combos use participant Strength against target Defense unless combo data overrides the formula.

Magic combos use participant Intelligence against target Spirit unless combo data overrides the formula.

Hybrid combos may use weighted or averaged Strength and Intelligence against weighted or averaged Defense and Spirit.

Utility combos may use custom effect rules instead of normal damage.

## Combo Data Requirements

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

Combo data should be explicit enough for UI preview, ruleset validation, AI battle planning, and future replay reconstruction.

## Status Effects

Status effects should exist as a data-supported battle-system hook, but the first implementation should use a very small status list or no live status moves.

Minimum engine support:

- Apply status
- Remove status
- Check status before action
- Modify damage, accuracy, evasion, Speed, or resource behavior
- Decrement duration
- Emit battle log events

Recommended first live statuses:

```txt
None, or only 2–3 simple statuses after base combat works
```

Possible first statuses:

- Burn: small round-end damage or reduced Strength
- Chill: reduced Speed
- Focus Break: reduced Accuracy

Do not launch with poison, sleep, stun, paralysis, silence, confusion, charm, bind, curse, and cleanse all at once.

Status bloat should wait until the damage, combo, and draft systems are stable.

## Deterministic RNG and Battle Logs

Online battles should use deterministic seeded RNG.

The battle engine should not call uncontrolled global randomness during combat resolution.

Random events should pull from the battle RNG stream, including:

- Damage variance
- Accuracy rolls
- Critical rolls
- Randomized move effects, if any
- Status rolls, if added later

RNG seed should be created at battle start and shared by the authoritative battle session.

Battle replays are not required for first implementation, but battle logs should be structured so replays are possible later.

The battle engine should emit a battle event log.

A full replay viewer can be deferred.