# Pengun Scope Document

Patched canon note: this version includes the current simulator canon base stats, natural growth values, and elemental resistance multipliers.

## Creature Identity

Creature ID: `pengun`  
Display Name: Pengun  
Element: Ice  
Primary Role: Control / debuff  
Secondary Role: Tempo disruption  
Roster Type: Starter rental creature  
Battle Format Target: 3v3 rental draft and direct battle

Pengun is the starter Ice control creature. It should pressure enemy tempo through Speed reduction, accuracy disruption, and controlled Ice damage. Its job is not to out-damage Fire attackers or out-tank Water and Earth creatures. Its job is to make enemy turns worse.

Pengun should be annoying in a strategic way, not in a hard-lock way. Ice control needs strict limits because constant turn denial is usually bad gameplay.

## Design Intent

Pengun should be the “tempo control” pick.

It should punish fast teams, disrupt fragile attackers, and help slower allies get better turn windows. It should create openings, not end fights by itself.

Pengun should feel strongest when paired with creatures that can exploit slowed or weakened enemies. It should feel weaker when isolated, focused down, or forced to trade raw damage.

## Element

Element: Ice

Ice should represent chill, slowing pressure, precision disruption, brittle defense, and control. Pengun’s Ice identity should lean toward Speed pressure, accuracy pressure, and debuff setup.

Ice should not become a full stun element at launch. If freeze-style status exists later, it should be rare, telegraphed, and heavily constrained.

## Natural Stat Growth Bias

Pengun’s natural growth should prioritize Speed and Intelligence while keeping durability limited.

| Stat | Growth Bias | Notes |
|---|---:|---|
| HP | Low-Medium | Pengun should not survive repeated focus fire. |
| MP | Medium | Needs enough MP to use control Arts across several rounds. |
| Strength | Low | Basic Attack should be weak. Pengun is not a physical attacker. |
| Defense | Low-Medium | Physical pressure should threaten Pengun. |
| Intelligence | Medium-High | Ice Magic damage and debuff reliability should remain relevant. |
| Spirit | Medium | Prevents Pengun from folding instantly to Magic damage. |
| Speed | High | Core stat. Pengun should often act early and apply tempo pressure. |

## Canonical Simulator Stat Package

The following numeric stat package is canon for the current simulator baseline. These values supersede earlier qualitative-only tuning notes when implementing runtime creature data.

### Canon Base Stats and Growth

| Stat | Base Value | Natural Growth Per Level |
|---|---:|---:|
| HP | 34 | 3.35 |
| MP | 26 | 2.7 |
| Strength | 6 | 0.65 |
| Defense | 8 | 0.85 |
| Intelligence | 13 | 1.45 |
| Spirit | 11 | 1.1 |
| Speed | 16 | 1.7 |

Base stats are the Level 1 simulator values before manual allocation, battle modifiers, equipment-like systems, or future rare variant overrides.

Natural growth values are the species growth amounts applied per level before any manual stat allocation and before the per-level random variance layer, if that variance layer is enabled by the progression simulator.

### Canon Elemental Resistance Multipliers

| Element | Damage Multiplier |
|---|---:|
| Neutral | 1x |
| Fire | 1.5x |
| Water | 0.75x |
| Gaia | 1x |
| Ice | 0.5x |
| Earth | 1x |
| Wind | 1x |
| Light | 1x |
| Dark | 1x |

Resistance multipliers use incoming damage scaling. A value below `1.0x` means reduced incoming damage. A value above `1.0x` means increased incoming damage.

## Stat Package Summary

High Stat: Speed  
Medium Stats: Intelligence, MP  
Low-Medium Stat: Spirit  
Weakness Stat: Defense

Pengun should not have high HP or high Defense. A fast control creature with strong durability becomes oppressive.

## Rental Level-Cap Rule

Rental Pengun does not have one fixed Art, Skill, or Passive loadout for all formats. The listed Arts in this document are an initial scoped batch, not the final full species Art list.

The selected battle ruleset determines the rental level cap before the match. Pengun receives only the natural Arts available at that level cap and only the class-tree Skills and Passives legal at that level cap.

Example:

```txt
Level 10 rental battle:
- Pengun uses Level 10 rental stats.
- Pengun has access only to Arts learned by Level 10.
- Pengun has access only to class-tree Skills and Passives legal by Level 10.

Level 20 rental battle:
- Pengun uses Level 20 rental stats.
- Pengun has access to Pengun Arts learned through Level 20.
- Pengun has access to class-tree Skills and Passives legal through Level 20.

Level 30+ rental battle:
- Pengun continues gaining natural Arts by species schedule.
- Skills and Passives continue expanding through the shared class trees.
```

This keeps rentals compatible with the RPG progression model instead of becoming isolated fixed kits.

## Arts vs Skills and Passives

Pengun’s natural Arts are species-defined.

Skills and Passives are not species-defined. They come from manual stat allocation and class-tree access.

This means Pengun scope documents should define:

- Natural Art pool and learning schedule
- Natural stat growth bias
- Suggested rental stat package direction
- Draft identity
- AI behavior
- Combo tags from species Arts and element identity

Pengun scope documents should not define Pengun-exclusive Passives or Pengun-exclusive class Skills unless a future ruleset explicitly creates special rental-only presets.

Pengun may gain additional species Arts later. Those should be added to the natural Art pool with learned-at levels instead of changing the core rental rule.

## Natural Art Pool and Learning Schedule

Pengun’s natural Arts are species-defined and may contain more moves than the first scoped batch below. Each natural Art should have a `Learned At` value. The exact level milestones and total number of Arts are tuning data, not locked structure.

The rental ruleset should expose every natural Art with `Learned At <= Selected Level Cap`.

Do not infer a fixed rate such as one Art per 10 levels. Do not infer that the listed Arts are the complete final species move pool.

### Level 10 Art: Ice Pebble

Art ID: `ice_pebble`  
Display Name: Ice Pebble  
Learned At: Level 10 baseline  
Source: Species Art  
Command Source: Art  
Damage Type: Magic  
Element Mode: Ice  
Potency Tier: Minimal Damage  
Base Power: 22  
Move Power Modifier: 0  
Scaling Stat: Intelligence  
Defensive Stat: Spirit  
Cost Type: Flat MP  
Cost Amount: 4  
Base Accuracy: 96%  
Target Pattern: One enemy  
Combo Tags: Ice, Pebble, Chill, Basic

Ice Pebble is Pengun’s reliable basic Ice Art.

It should provide safe chip damage and Ice combo access. It should not be a major damage threat.

### Level 10 Art: Cold Feet

Art ID: `cold_feet`  
Display Name: Cold Feet  
Learned At: Level 10 baseline  
Source: Species Art  
Command Source: Art  
Damage Type: Utility / Non-damaging  
Element Mode: Ice  
Potency Tier: Tempo Utility  
Base Power: None  
Move Power Modifier: 0  
Cost Type: Flat MP  
Cost Amount: 6  
Base Accuracy: 92%  
Target Pattern: One enemy  
Effect: Temporarily reduces target Speed.  
Combo Tags: Ice, Chill, Slow, Tempo, Setup

Cold Feet is Pengun’s baseline tempo-control Art.

Recommended prototype behavior:

```txt
Target receives a temporary Speed reduction for the next action or next round.
```

This should be a soft tempo effect, not a skipped turn. It should help slower allies compete without invalidating the target’s command.

### Level 20 Art: Snow Blind

Art ID: `snow_blind`  
Display Name: Snow Blind  
Learned At: Level 20 baseline  
Source: Species Art  
Command Source: Art  
Damage Type: Utility / Non-damaging  
Element Mode: Ice  
Potency Tier: Accuracy Utility  
Base Power: None  
Move Power Modifier: 0  
Cost Type: Flat MP  
Cost Amount: 7  
Base Accuracy: 88%  
Target Pattern: One enemy  
Effect: Temporarily reduces target Accuracy or increases the chance the next hostile action misses within normal hit-chance clamps.  
Combo Tags: Ice, Snow, Blind, Accuracy, Disrupt

Snow Blind gives Pengun accuracy disruption.

This move is dangerous if overtuned. Constant misses are not depth. Snow Blind should create risk for the enemy, not make actions unreliable by default.

Recommended prototype behavior:

```txt
Target receives a modest Accuracy reduction for one round.
```

Do not allow Snow Blind to push normal actions below the minimum normal hit-chance clamp unless the target uses a risky move already allowed to go lower.

### Level 20 Art: Frost Nip

Art ID: `frost_nip`  
Display Name: Frost Nip  
Learned At: Level 20 baseline  
Source: Species Art  
Command Source: Art  
Damage Type: Magic  
Element Mode: Ice  
Potency Tier: Moderate Damage  
Base Power: 34  
Move Power Modifier: 0  
Scaling Stat: Intelligence  
Defensive Stat: Spirit  
Cost Type: Flat MP  
Cost Amount: 7  
Base Accuracy: 92%  
Target Pattern: One enemy  
Secondary Effect: Minor chance or deterministic small Speed pressure if status hooks are enabled.  
Combo Tags: Ice, Frost, Nip, Chill, Pressure

Frost Nip is Pengun’s standard damage Art.

It should be useful when Pengun needs to contribute damage while still keeping an Ice-control flavor. If the secondary effect creates too much overlap with Cold Feet, remove the secondary effect and let Frost Nip stay as simple damage.

### Level 30 Art: Shatter Chill

Art ID: `shatter_chill`  
Display Name: Shatter Chill  
Learned At: Level 30 baseline  
Source: Species Art  
Command Source: Art  
Damage Type: Magic  
Element Mode: Ice  
Potency Tier: Heavy Damage  
Base Power: 48  
Move Power Modifier: 0  
Scaling Stat: Intelligence  
Defensive Stat: Spirit  
Cost Type: Flat MP  
Cost Amount: 12  
Base Accuracy: 86%  
Target Pattern: One enemy  
Conditional Bonus: May gain a modest damage bonus against targets already affected by a Speed or Accuracy debuff.  
Combo Tags: Ice, Shatter, Chill, Heavy, Finisher

Shatter Chill is Pengun’s higher-cap punish Art.

It should reward successful setup. It should not be Pengun’s default turn-one attack.

Recommended prototype behavior:

```txt
If the target has an active Speed or Accuracy debuff applied by Pengun or an ally, Shatter Chill gains a modest Move Power Modifier bonus.
```

Keep the bonus modest. Pengun should convert control into damage, not become a top-tier burst attacker.

## Example Art Access By Level Cap

| Level Cap | Natural Arts Available |
|---:|---|
| 10 | Ice Pebble, Cold Feet |
| 20 | Ice Pebble, Cold Feet, Snow Blind, Frost Nip |
| 30 | Ice Pebble, Cold Feet, Snow Blind, Frost Nip, Shatter Chill |
| 40+ | Uses later species Art additions if authored |

This table is an example based only on the currently scoped Arts. It is not a final progression lock, not a cap on total move count, and not a requirement that each creature learns exactly one Art per 10 levels. The important rule is that ruleset level cap controls the available natural Art pool.

## Class-Tree Skill and Passive Access

Pengun rentals should receive access to legal Skills and Passives from the shared class trees, not Pengun-specific passive seeds.

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

For rental modes, this means Pengun should have predefined rental build profiles or a rental loadout editor, not species-exclusive passive design.

## Suggested Rental Build Profiles

These are not species passives. These are suggested stat-allocation profiles that determine which shared class-tree Skills and Passives Pengun can access in rental play.

### Level 10 Profile: Ice Tempo Baseline

Manual Allocation Bias: Speed / Intelligence  
Expected Class Access: early tempo tools, basic Magic pressure, accuracy/evasion consistency  
Purpose: Lets Pengun act early and apply light control without creating hard denial.

### Level 20 Profile: Debuff Controller

Manual Allocation Bias: Speed / Intelligence or Speed / Spirit, depending on final class tree structure  
Expected Class Access: stronger debuff support, improved control reliability, light defensive options  
Purpose: Lets Pengun disrupt enemy plans while still being removable.

### Level 30 Profile: Setup Punisher

Manual Allocation Bias: Speed / Intelligence / MP  
Expected Class Access: stronger Magic pressure, debuff conversion, combo support  
Purpose: Lets Pengun convert successful control into damage and combo pressure.

These profiles should be replaced by exact class-tree references once the class tree document is locked.

## Combo Tags

Pengun should expose the following species and Art tags:

```txt
Ice
Snow
Frost
Chill
Slow
Blind
Accuracy
Tempo
Control
Disrupt
Setup
Shatter
Finisher
```

These tags allow Pengun to participate in Ice control combos, Water/Ice slow setups, Wind/Ice tempo combos, and setup-to-punish damage conversions.

## Combo Direction

Pengun should enable control-oriented combos and setup punishment.

Good combo identities:

- Ice + Water = deep chill / slow field pressure
- Ice + Wind = blizzard / accuracy disruption
- Ice + Earth = brittle armor / defense cracking
- Ice + Dark = fear chill / disruption pressure
- Ice + Light = clear frost / precision control

Pengun’s combos should help the team create better action windows. They should not create repeated turn skips or unavoidable lockdown.

## Draft Strength

Pengun is a strong draft pick when the player wants:

- Speed control
- Accuracy disruption
- Anti-tempo tools
- Setup support for slower allies
- Ice combo access
- A way to punish fragile fast attackers

Pengun pairs well with creatures that can exploit slowed or disrupted targets.

Strong likely partners:

- Aquaphant, because Water + Ice can create stable control pressure.
- Clod, because Speed reduction can help slow tanks function.
- Galeon, because tempo stacking can create strong turn-order control.
- Salamander, because disrupted targets are easier for Fire pressure to punish.

## Draft Weakness

Pengun should struggle against:

- Focus-fire physical pressure
- High-accuracy or guaranteed-hit moves
- Bulky teams that do not care much about Speed reduction
- Strong support cleansing if added later
- Heavy Magic pressure from creatures with better Spirit matchups
- Teams that can remove Pengun before debuffs matter

Pengun should not be durable enough to sit untouched while repeatedly disrupting the enemy team. If it survives too easily, its control tools will feel oppressive.

## AI Behavior Notes

Pengun AI should prioritize actions based on the Arts and class-tree moves available at the selected level cap.

Baseline priority:

1. Use Cold Feet against fast enemy threats or targets that must be slowed for allied follow-up.
2. Use Snow Blind if available against high-damage attackers with non-guaranteed moves.
3. Use Shatter Chill if available against debuffed targets in knockout or high-pressure range.
4. Use Frost Nip if available as standard damage.
5. Use Ice Pebble when conserving MP or finishing low-HP targets.
6. Use class-tree Skills when they are more efficient than species Arts for the current situation.
7. Use Defend if Pengun is likely to be focused and no better defensive action is available.

Pengun AI should not assume Snow Blind, Frost Nip, or Shatter Chill exists in Level 10 battles.

Suggested Speed-control priority:

```txt
Use Cold Feet when the target is faster than at least one allied creature that needs to act before it.
```

Suggested accuracy-disruption priority:

```txt
Use Snow Blind against high-damage attackers when their next likely action is not guaranteed-hit and lowering reliability would materially reduce incoming pressure.
```

## Rental Version

Pengun rental data should be generated or selected per level cap.

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

Do not hardcode Pengun as always having the full currently scoped Art batch. Higher-cap rulesets should receive all legal Arts, and future additional Arts should be included automatically when their `Learned At` value is within the selected cap.

## Raised / RPG Version Direction

The raised version of Pengun can branch into stronger control or precision identities later through manual stat allocation and class-tree progression.

Possible growth directions:

1. Ice tempo controller route
2. Accuracy disruption route
3. Speed-control support route
4. Setup-punisher Magic route
5. Evasive utility route

RPG progression can expand Pengun’s control and setup value, but the rental version should remain ruleset-compatible with level-cap restrictions.

## Balance Risks

### Risk: Pengun creates hard-lock gameplay

Mitigation:

- Avoid stun/freeze turn denial at launch.
- Keep Speed and Accuracy debuffs temporary.
- Respect hit-chance clamps.
- Make control cost MP and action economy.

### Risk: Pengun becomes too fragile to matter

Mitigation:

- Keep Speed high enough to act early.
- Give it reliable low-cost control at low cap.
- Allow class-tree defensive access only if the rental profile pays for it through stat allocation.

### Risk: Pengun becomes too complete

Mitigation:

- Keep Defense low.
- Keep heavy damage locked behind setup or higher cap.
- Avoid strong healing or broad team protection in its natural Art pool.
- Do not let it apply strong debuffs and high burst every turn without tradeoffs.

### Risk: Pengun overlaps with Galeon

Mitigation:

- Pengun controls enemy tempo through Ice debuffs.
- Galeon should control team tempo through Wind speed, combo setup, and initiative pressure.
- Pengun should reduce enemy effectiveness; Galeon should improve action flow and combo execution.

### Risk: Rental rules drift away from RPG rules

Mitigation:

- Rentals must use level-cap Art access.
- Rentals must use shared class-tree Skills and Passives.
- Rental passive access must come from stat allocation/class route assumptions, not species identity.
- Ruleset validation must reject moves, Skills, or Passives above the selected cap.

## Implementation Notes

Pengun should use the shared combat core without special-case rules.

Damaging Arts should use:

```txt
Command Source: Art
Damage Type: Magic
Offensive Stat: Intelligence
Defensive Stat: Spirit
Base Power
Element Mode: Ice
```

Debuff Arts should use:

```txt
Command Source: Art
Damage Type: Utility / Non-damaging
Element Mode: Ice
Effect: explicit temporary battle modifier
```

Conditional damage bonuses should be represented through explicit move data, such as:

```txt
Condition: target has SpeedDown or AccuracyDown
Bonus: modest Move Power Modifier increase
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

Do not implement Pengun’s control as hidden exceptions. Speed and Accuracy changes should be battle modifiers visible to logs, UI previews, and future replay reconstruction.

## One-Line Summary

Pengun is a fast Ice control creature whose natural Arts apply chip damage, Speed pressure, accuracy disruption, and setup-based punishment, while its rental Skills and Passives come from shared class-tree access controlled by the selected battle level cap.
