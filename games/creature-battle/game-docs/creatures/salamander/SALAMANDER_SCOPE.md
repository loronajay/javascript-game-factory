# Salamander Scope Document

Patched canon note: this version includes the current simulator canon base stats, natural growth values, and elemental resistance multipliers.

## Creature Identity

Creature ID: `salamander`  
Display Name: Salamander  
Element: Fire  
Primary Role: Magic Art pressure  
Secondary Role: Burst setup  
Roster Type: Starter rental creature  
Battle Format Target: 3v3 rental draft and direct battle

Salamander is the starter Fire Magic attacker. It should feel aggressive, direct, and resource-hungry. Its job is to threaten damage through Fire Arts, pressure low-Spirit targets, and create Fire combo openings.

Salamander must be mechanically separated from Emberjaw. Salamander is Fire Magic pressure. Emberjaw should later be the Fire physical elemental attacker.

## Design Intent

Salamander should be the “early Fire Art pressure” pick.

It should punish slow teams, low-Spirit targets, and teams that let it cast freely. It should not be durable enough to ignore retaliation, and it should not have the physical threat profile that belongs to Emberjaw.

Salamander should feel dangerous when protected, but fragile when exposed.

## Element

Element: Fire

Fire should represent pressure, burst damage, risk, burn potential, and aggressive tempo. Salamander’s Fire identity should lean toward Magic damage and combo ignition rather than physical claw/bite pressure.

Salamander should not become a bulky bruiser. Its Fire identity is offense-first.

## Natural Stat Growth Bias

Salamander’s natural growth should prioritize Intelligence and Speed while keeping durability limited.

| Stat | Growth Bias | Notes |
|---|---:|---|
| HP | Low-Medium | Can take a hit, but should not survive sustained focus. |
| MP | Medium | Enough to pressure, but heavy casting should drain it. |
| Strength | Low | Physical Attack should be weak. Emberjaw owns physical Fire pressure. |
| Defense | Low | Physical attackers should threaten Salamander. |
| Intelligence | High | Core damage stat. Fire Arts should matter. |
| Spirit | Medium | Avoids being deleted by enemy Arts, but not a dedicated Magic wall. |
| Speed | Medium-High | Lets Salamander pressure before slower supports and bruisers. |

## Canonical Simulator Stat Package

The following numeric stat package is canon for the current simulator baseline. These values supersede earlier qualitative-only tuning notes when implementing runtime creature data.

### Canon Base Stats and Growth

| Stat | Base Value | Natural Growth Per Level |
|---|---:|---:|
| HP | 36 | 3.4 |
| MP | 27 | 2.85 |
| Strength | 7 | 0.7 |
| Defense | 7 | 0.75 |
| Intelligence | 16 | 1.75 |
| Spirit | 11 | 1.05 |
| Speed | 14 | 1.45 |

Base stats are the Level 1 simulator values before manual allocation, battle modifiers, equipment-like systems, or future rare variant overrides.

Natural growth values are the species growth amounts applied per level before any manual stat allocation and before the per-level random variance layer, if that variance layer is enabled by the progression simulator.

### Canon Elemental Resistance Multipliers

| Element | Damage Multiplier |
|---|---:|
| Neutral | 1x |
| Fire | 0.5x |
| Water | 1.5x |
| Gaia | 0.75x |
| Ice | 0.75x |
| Earth | 1.25x |
| Wind | 1x |
| Light | 1x |
| Dark | 1x |

Resistance multipliers use incoming damage scaling. A value below `1.0x` means reduced incoming damage. A value above `1.0x` means increased incoming damage.

## Stat Package Summary

High Stat: Intelligence  
Medium Stats: Speed, MP  
Low-Medium Stat: Spirit  
Weakness Stat: Defense

Salamander should not have high Defense. If it can outspeed enemies, hit hard, and survive physical focus, it becomes too generically strong.

## Rental Level-Cap Rule

Rental Salamander does not have one fixed Art, Skill, or Passive loadout for all formats. The listed Arts in this document are an initial scoped batch, not the final full species Art list.

The selected battle ruleset determines the rental level cap before the match. Salamander receives only the natural Arts available at that level cap and only the class-tree Skills and Passives legal at that level cap.

Example:

```txt
Level 10 rental battle:
- Salamander uses Level 10 rental stats.
- Salamander has access only to Arts learned by Level 10.
- Salamander has access only to class-tree Skills and Passives legal by Level 10.

Level 20 rental battle:
- Salamander uses Level 20 rental stats.
- Salamander has access to Salamander Arts learned through Level 20.
- Salamander has access to class-tree Skills and Passives legal through Level 20.

Level 30+ rental battle:
- Salamander continues gaining natural Arts by species schedule.
- Skills and Passives continue expanding through the shared class trees.
```

This keeps rentals compatible with the RPG progression model instead of becoming isolated fixed kits.

## Arts vs Skills and Passives

Salamander’s natural Arts are species-defined.

Skills and Passives are not species-defined. They come from manual stat allocation and class-tree access.

This means Salamander scope documents should define:

- Natural Art pool and learning schedule
- Natural stat growth bias
- Suggested rental stat package direction
- Draft identity
- AI behavior
- Combo tags from species Arts and element identity

Salamander scope documents should not define Salamander-exclusive Passives or Salamander-exclusive class Skills unless a future ruleset explicitly creates special rental-only presets.

Salamander may gain additional species Arts later. Those should be added to the natural Art pool with learned-at levels instead of changing the core rental rule.

## Natural Art Pool and Learning Schedule

Salamander’s natural Arts are species-defined and may contain more moves than the first scoped batch below. Each natural Art should have a `Learned At` value. The exact level milestones and total number of Arts are tuning data, not locked structure.

The rental ruleset should expose every natural Art with `Learned At <= Selected Level Cap`.

Do not infer a fixed rate such as one Art per 10 levels. Do not infer that the listed Arts are the complete final species move pool.

### Level 10 Art: Spark Flick

Art ID: `spark_flick`  
Display Name: Spark Flick  
Learned At: Level 10 baseline  
Source: Species Art  
Command Source: Art  
Damage Type: Magic  
Element Mode: Fire  
Potency Tier: Minimal Damage  
Base Power: 24  
Move Power Modifier: 0  
Scaling Stat: Intelligence  
Defensive Stat: Spirit  
Cost Type: Flat MP  
Cost Amount: 4  
Base Accuracy: 96%  
Target Pattern: One enemy  
Combo Tags: Fire, Spark, Flame, Basic

Spark Flick is Salamander’s reliable basic Fire Art.

It should be a low-cost pressure tool. It gives Salamander something useful to cast without draining all MP immediately.

### Level 10 Art: Heat Haze

Art ID: `heat_haze`  
Display Name: Heat Haze  
Learned At: Level 10 baseline  
Source: Species Art  
Command Source: Art  
Damage Type: Utility / Non-damaging  
Element Mode: Fire  
Potency Tier: Evasion Utility  
Base Power: None  
Move Power Modifier: 0  
Cost Type: Flat MP  
Cost Amount: 6  
Base Accuracy: Guaranteed  
Target Pattern: Self  
Effect: Temporarily improves Salamander’s Evasion or reduces the accuracy of the next incoming attack.  
Combo Tags: Fire, Heat, Haze, Evasion, Setup

Heat Haze is Salamander’s survival utility.

This should be a light defensive trick, not true tanking. It helps Salamander survive one bad exchange but should not make it safe under repeated focus.

Recommended prototype behavior:

```txt
Salamander gains a temporary Evasion boost until the next incoming hostile action or until round end.
```

Do not combine this with direct damage reduction at full strength. Salamander should remain physically fragile.

### Level 20 Art: Flare Bite

Art ID: `flare_bite`  
Display Name: Flare Bite  
Learned At: Level 20 baseline  
Source: Species Art  
Command Source: Art  
Damage Type: Magic  
Element Mode: Fire  
Potency Tier: Moderate Damage  
Base Power: 38  
Move Power Modifier: 0  
Scaling Stat: Intelligence  
Defensive Stat: Spirit  
Cost Type: Flat MP  
Cost Amount: 7  
Base Accuracy: 92%  
Target Pattern: One enemy  
Combo Tags: Fire, Flare, Bite, Pressure

Flare Bite is Salamander’s standard Fire damage Art.

Despite the name, it is still a Magic Art. Do not implement it as Physical damage unless the name is changed or the move is redesigned. Emberjaw should own physical Fire attacks.

### Level 30 Art: Cinder Burst

Art ID: `cinder_burst`  
Display Name: Cinder Burst  
Learned At: Level 30 baseline  
Source: Species Art  
Command Source: Art  
Damage Type: Magic  
Element Mode: Fire  
Potency Tier: Heavy Damage  
Base Power: 52  
Move Power Modifier: 0  
Scaling Stat: Intelligence  
Defensive Stat: Spirit  
Cost Type: Flat MP  
Cost Amount: 12  
Base Accuracy: 88%  
Target Pattern: One enemy  
Combo Tags: Fire, Cinder, Burst, Heavy, Finisher

Cinder Burst is Salamander’s heavier Fire Art.

It should be threatening, but its MP cost and accuracy should make it a commitment. It should punish vulnerable targets, not serve as the default cast every turn.

## Example Art Access By Level Cap

| Level Cap | Natural Arts Available |
|---:|---|
| 10 | Spark Flick, Heat Haze |
| 20 | Spark Flick, Heat Haze, Flare Bite |
| 30 | Spark Flick, Heat Haze, Flare Bite, Cinder Burst |
| 40+ | Uses later species Art additions if authored |

This table is an example based only on the currently scoped Arts. It is not a final progression lock, not a cap on total move count, and not a requirement that each creature learns exactly one Art per 10 levels. The important rule is that ruleset level cap controls the available natural Art pool.

## Class-Tree Skill and Passive Access

Salamander rentals should receive access to legal Skills and Passives from the shared class trees, not Salamander-specific passive seeds.

Access should be derived from:

```txt
Ruleset level cap
Manual stat allocation profile used by the rental preset
Unlocked class tiers at that cap
Legal Skill list for those class tiers
Legal Passive list for those class tiers
Passive slot limit
Ruleset restrictions
```

Current passive rule remains:

```txt
Each creature may equip up to 3 learned Passives before battle.
```

For rental modes, this means Salamander should have predefined rental build profiles or a rental loadout editor, not species-exclusive passive design.

## Suggested Rental Build Profiles

These are not species passives. These are suggested stat-allocation profiles that determine which shared class-tree Skills and Passives Salamander can access in rental play.

### Level 10 Profile: Fire Art Baseline

Manual Allocation Bias: Intelligence / Speed  
Expected Class Access: early Magic pressure, accuracy support, light tempo tools  
Purpose: Gives Salamander its core identity without giving it too much burst too early.

### Level 20 Profile: Fire Pressure Caster

Manual Allocation Bias: Intelligence / Speed or Intelligence / MP, depending on final class tree structure  
Expected Class Access: stronger Magic Skills, improved MP efficiency, early offensive passives  
Purpose: Lets Salamander become a real damage threat while still being punishable.

### Level 30 Profile: Fire Burst Specialist

Manual Allocation Bias: Intelligence / MP / Speed  
Expected Class Access: heavier Magic offense, stronger combo support, risk-reward damage passives  
Purpose: Makes Salamander dangerous in higher-cap rental battles without giving it physical durability.

These profiles should be replaced by exact class-tree references once the class tree document is locked.

## Combo Tags

Salamander should expose the following species and Art tags:

```txt
Fire
Spark
Flame
Heat
Haze
Flare
Cinder
Burst
Ignite
Pressure
Finisher
Setup
```

These tags allow Salamander to participate in Fire burst combos, Fire/Wind pressure combos, steam-style Fire/Water combos, and risky finisher setups.

## Combo Direction

Salamander should enable aggressive Fire combos and damage-conversion plays.

Good combo identities:

- Fire + Wind = flare cyclone / spreading flame pressure
- Fire + Water = steam burst / pressure conversion
- Fire + Gaia = growth burn / volatile bloom
- Fire + Dark = risky burst / corruption flame
- Fire + Light = cleansing flame / focused burn

Salamander’s combos should be more offensive than Flor’s and more Magic-based than Emberjaw’s future combo identity.

## Draft Strength

Salamander is a strong draft pick when the player wants:

- Early Fire pressure
- Magic damage into low-Spirit targets
- Faster offensive tempo
- Combo ignition
- A threat that forces enemy targeting decisions

Salamander pairs well with creatures that can protect it, accelerate it, or exploit Fire combo openings.

Strong likely partners:

- Flor, because healing and support can keep Salamander casting.
- Galeon, because Wind tempo can help Fire pressure snowball.
- Lumora, because support can improve Salamander’s reliability.
- Nocthorn, if the player wants a risky high-pressure offense core.

## Draft Weakness

Salamander should struggle against:

- Strong physical attackers
- Focus-fire strategies
- Water pressure
- High-Spirit defenders
- Accuracy disruption
- Teams that can survive its opening pressure and punish its MP costs

Salamander should not be able to freely cast heavy Fire Arts without protection. If the enemy drafts physical pressure and Salamander still feels safe, its durability is too high.

## AI Behavior Notes

Salamander AI should prioritize actions based on the Arts and class-tree moves available at the selected level cap.

Baseline priority:

1. Use the strongest efficient Fire Art available against vulnerable or low-Spirit targets.
2. Use Cinder Burst if available and a target is in knockout range or weak to Fire.
3. Use Heat Haze if Salamander is likely to be targeted and survival matters.
4. Use lower-cost Fire Arts when conserving MP or finishing weakened targets.
5. Use class-tree Skills when they outperform available species Arts.
6. Use Defend if low on HP and no better defensive option is available.

Salamander AI should not assume Flare Bite or Cinder Burst exists in Level 10 battles.

Suggested Heat Haze threshold:

```txt
Use Heat Haze when Salamander is at or below 55% HP and at least one enemy can threaten it before or during the current round.
```

Suggested heavy attack threshold:

```txt
Use the highest available heavy Fire Art when the target is at or below 45% HP, weak to Fire, or is a high-priority threat.
```

## Rental Version

Salamander rental data should be generated or selected per level cap.

The rental object should include:

```txt
Creature ID
Display Name
Element
Role
Level
Resolved runtime stats derived from canon base stats, natural growth, selected level cap, manual allocation profile, and enabled variance rules
Natural Arts available at that level cap
Class-tree Skills available from the rental stat allocation profile
Class-tree Passives available from the rental stat allocation profile
Equipped Passive slots, if using preset loadouts
Combo Tags
Draft Strength
Draft Weakness
AI Behavior Notes
```

Do not hardcode Salamander as always having the full currently scoped Art batch. Higher-cap rulesets should receive all legal Arts, and future additional Arts should be included automatically when their `Learned At` value is within the selected cap.

## Raised / RPG Version Direction

The raised version of Salamander can branch into stronger Fire caster identities later through manual stat allocation and class-tree progression.

Possible growth directions:

1. Fire Magic burst route
2. Speed caster route
3. MP-efficient pressure route
4. Combo ignition route
5. Risk-reward glass cannon route

RPG progression can expand Salamander’s burst and combo pressure, but the rental version should remain ruleset-compatible with level-cap restrictions.

## Balance Risks

### Risk: Salamander overlaps with Emberjaw

Mitigation:

- Salamander natural Arts use Damage Type: Magic.
- Salamander’s offensive identity is Intelligence-driven.
- Emberjaw should own Strength-driven Fire physical pressure.
- Avoid giving Salamander strong physical Skills through default rental profiles unless the profile is explicitly hybrid and ruleset legal.

### Risk: Salamander snowballs too hard

Mitigation:

- Keep Defense low.
- Keep heavy Fire Arts expensive.
- Keep high-damage Arts at higher level caps.
- Make protection/support investment matter.

### Risk: Salamander becomes too fragile

Mitigation:

- Keep Heat Haze available at low cap.
- Give Salamander enough Speed to act before slow bruisers.
- Allow class-tree access to defensive options only if the rental profile pays for them through stat allocation.

### Risk: Rental rules drift away from RPG rules

Mitigation:

- Rentals must use level-cap Art access.
- Rentals must use shared class-tree Skills and Passives.
- Rental passive access must come from stat allocation/class route assumptions, not species identity.
- Ruleset validation must reject moves, Skills, or Passives above the selected cap.

## Implementation Notes

Salamander should use the shared combat core without special-case rules.

Damaging Arts should use:

```txt
Command Source: Art
Damage Type: Magic
Offensive Stat: Intelligence
Defensive Stat: Spirit
Base Power
Element Mode: Fire
```

Heat Haze should use:

```txt
Command Source: Art
Damage Type: Utility / Non-damaging
Element Mode: Fire
Effect: temporary self evasion or incoming accuracy disruption
```

Rental validation should check:

```txt
Selected ruleset level cap
Canon base stats, natural growth values, and elemental resistance multipliers from this document
Allowed natural Arts by `Learned At <= selected level cap`
Allowed class-tree Skills by level and rental stat profile
Allowed class-tree Passives by level and rental stat profile
Equipped Passive count
Ruleset restrictions
```

Do not implement rental Salamander as a separate creature ruleset. It must be a predefined resolved creature object that still obeys the shared combat data contract.

## One-Line Summary

Salamander is a Fire Magic pressure creature whose natural Arts provide fast elemental offense and light evasive utility, while its rental Skills and Passives come from shared class-tree access controlled by the selected battle level cap.
