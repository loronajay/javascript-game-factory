# Aquaphant Scope Document

Patched canon note: this version includes the current simulator canon base stats, natural growth values, and elemental resistance multipliers.

## Creature Identity

Creature ID: `aquaphant`  
Display Name: Aquaphant  
Element: Water  
Primary Role: Sustain bruiser  
Secondary Role: Anti-pressure anchor  
Roster Type: Starter rental creature  
Battle Format Target: 3v3 rental draft and direct battle

Aquaphant is the starter Water bruiser. It should feel sturdy, patient, and hard to dislodge without becoming a full defensive wall. Its job is to absorb pressure, trade efficiently, and give Water teams a reliable middle-slot anchor.

Aquaphant should sit between Flor and Clod mechanically. Flor is support/control. Clod is a physical tank. Aquaphant should be a bruiser: durable enough to stay active, but still expected to contribute damage.

## Design Intent

Aquaphant should be the “safe bruiser” pick.

It should help players survive early aggression while still threatening meaningful Water Magic damage. It should not heal as efficiently as Flor and should not wall physical damage as hard as Clod.

Aquaphant should be good at stabilizing messy battles, especially when the enemy relies on repeated moderate damage instead of focused burst.

## Element

Element: Water

Water should represent flow, endurance, recovery, pressure absorption, and steady damage. Aquaphant’s Water identity should lean toward sustained exchanges, defensive recovery, and reliable mid-power attacks.

Aquaphant should not become an Ice-style control creature or a Gaia-style healer. Its sustain should feel like endurance and recovery, not plant-based restoration or hard crowd control.

## Natural Stat Growth Bias

Aquaphant’s natural growth should prioritize HP, Defense, and Spirit while keeping Intelligence usable.

| Stat | Growth Bias | Notes |
|---|---:|---|
| HP | High | Core survivability stat. Aquaphant should take several hits before falling. |
| MP | Medium | Enough for repeated Water Arts, but not unlimited pressure. |
| Strength | Low-Medium | Basic Attack is usable but not the main threat. |
| Defense | Medium-High | Helps Aquaphant handle physical pressure better than Flor. |
| Intelligence | Medium | Water Arts should be relevant and reliable. |
| Spirit | Medium | Avoids collapsing to Magic damage but should not be a dedicated Art wall. |
| Speed | Low | Aquaphant should usually act late. |

## Canonical Simulator Stat Package

The following numeric stat package is canon for the current simulator baseline. These values supersede earlier qualitative-only tuning notes when implementing runtime creature data.

### Canon Base Stats and Growth

| Stat | Base Value | Natural Growth Per Level |
|---|---:|---:|
| HP | 48 | 5 |
| MP | 24 | 2.55 |
| Strength | 10 | 1 |
| Defense | 14 | 1.45 |
| Intelligence | 11 | 1.15 |
| Spirit | 12 | 1.15 |
| Speed | 6 | 0.6 |

Base stats are the Level 1 simulator values before manual allocation, battle modifiers, equipment-like systems, or future rare variant overrides.

Natural growth values are the species growth amounts applied per level before any manual stat allocation and before the per-level random variance layer, if that variance layer is enabled by the progression simulator.

### Canon Elemental Resistance Multipliers

| Element | Damage Multiplier |
|---|---:|
| Neutral | 1x |
| Fire | 0.75x |
| Water | 0.5x |
| Gaia | 1.25x |
| Ice | 0.75x |
| Earth | 1x |
| Wind | 1x |
| Light | 1x |
| Dark | 1x |

Resistance multipliers use incoming damage scaling. A value below `1.0x` means reduced incoming damage. A value above `1.0x` means increased incoming damage.

## Stat Package Summary

High Stat: HP  
Medium Stats: Defense, Spirit  
Low-Medium Stat: Strength  
Weakness Stat: Speed

Aquaphant should not be fast. A fast bulky sustain bruiser becomes too generically safe in draft.

## Rental Level-Cap Rule

Rental Aquaphant does not have one fixed Art, Skill, or Passive loadout for all formats. The listed Arts in this document are an initial scoped batch, not the final full species Art list.

The selected battle ruleset determines the rental level cap before the match. Aquaphant receives only the natural Arts available at that level cap and only the class-tree Skills and Passives legal at that level cap.

Example:

```txt
Level 10 rental battle:
- Aquaphant uses Level 10 rental stats.
- Aquaphant has access only to Arts learned by Level 10.
- Aquaphant has access only to class-tree Skills and Passives legal by Level 10.

Level 20 rental battle:
- Aquaphant uses Level 20 rental stats.
- Aquaphant has access to Aquaphant Arts learned through Level 20.
- Aquaphant has access to class-tree Skills and Passives legal through Level 20.

Level 30+ rental battle:
- Aquaphant continues gaining natural Arts by species schedule.
- Skills and Passives continue expanding through the shared class trees.
```

This keeps rentals compatible with the RPG progression model instead of becoming isolated fixed kits.

## Arts vs Skills and Passives

Aquaphant’s natural Arts are species-defined.

Skills and Passives are not species-defined. They come from manual stat allocation and class-tree access.

This means Aquaphant scope documents should define:

- Natural Art pool and learning schedule
- Natural stat growth bias
- Suggested rental stat package direction
- Draft identity
- AI behavior
- Combo tags from species Arts and element identity

Aquaphant scope documents should not define Aquaphant-exclusive Passives or Aquaphant-exclusive class Skills unless a future ruleset explicitly creates special rental-only presets.

Aquaphant may gain additional species Arts later. Those should be added to the natural Art pool with learned-at levels instead of changing the core rental rule.

## Natural Art Pool and Learning Schedule

Aquaphant’s natural Arts are species-defined and may contain more moves than the first scoped batch below. Each natural Art should have a `Learned At` value. The exact level milestones and total number of Arts are tuning data, not locked structure.

The rental ruleset should expose every natural Art with `Learned At <= Selected Level Cap`.

Do not infer a fixed rate such as one Art per 10 levels. Do not infer that the listed Arts are the complete final species move pool.

### Level 10 Art: Bubble Shot

Art ID: `bubble_shot`  
Display Name: Bubble Shot  
Learned At: Level 10 baseline  
Source: Species Art  
Command Source: Art  
Damage Type: Magic  
Element Mode: Water  
Potency Tier: Minimal Damage  
Base Power: 24  
Move Power Modifier: 0  
Scaling Stat: Intelligence  
Defensive Stat: Spirit  
Cost Type: Flat MP  
Cost Amount: 4  
Base Accuracy: 96%  
Target Pattern: One enemy  
Combo Tags: Water, Bubble, Pressure, Basic

Bubble Shot is Aquaphant’s reliable basic Water Art.

It should be slightly stronger than Flor’s basic chip Art because Aquaphant is supposed to contribute more direct damage, but it should still remain low-pressure compared to dedicated attackers.

### Level 10 Art: Soak Hide

Art ID: `soak_hide`  
Display Name: Soak Hide  
Learned At: Level 10 baseline  
Source: Species Art  
Command Source: Art  
Damage Type: Utility / Non-damaging  
Element Mode: Water  
Potency Tier: Defensive Utility  
Base Power: None  
Move Power Modifier: 0  
Cost Type: Flat MP  
Cost Amount: 8  
Base Accuracy: Guaranteed  
Target Pattern: Self  
Effect: Reduces incoming Physical damage for the current round or next incoming hit.  
Combo Tags: Water, Guard, Hide, Bruiser, Stabilize

Soak Hide is Aquaphant’s self-defense Art.

The safest prototype is a self-only physical mitigation effect. This keeps Aquaphant distinct from Flor’s ally protection and Clod’s natural tanking. Aquaphant protects itself so it can keep trading.

Recommended prototype behavior:

```txt
Aquaphant receives reduced incoming Physical damage from the next hit this round.
```

Do not make this party-wide. That would push Aquaphant too far into support territory.

### Level 20 Art: Tidal Bump

Art ID: `tidal_bump`  
Display Name: Tidal Bump  
Learned At: Level 20 baseline  
Source: Species Art  
Command Source: Art  
Damage Type: Magic  
Element Mode: Water  
Potency Tier: Moderate Damage  
Base Power: 36  
Move Power Modifier: 0  
Scaling Stat: Intelligence  
Defensive Stat: Spirit  
Cost Type: Flat MP  
Cost Amount: 7  
Base Accuracy: 92%  
Target Pattern: One enemy  
Combo Tags: Water, Tide, Bruiser, Pressure

Tidal Bump is Aquaphant’s standard damage Art.

It should be the move Aquaphant uses when it wants to trade damage efficiently. The MP cost should prevent mindless spam across long battles.

### Level 30 Art: Surge Crash

Art ID: `surge_crash`  
Display Name: Surge Crash  
Learned At: Level 30 baseline  
Source: Species Art  
Command Source: Art  
Damage Type: Magic  
Element Mode: Water  
Potency Tier: Heavy Damage  
Base Power: 50  
Move Power Modifier: 0  
Scaling Stat: Intelligence  
Defensive Stat: Spirit  
Cost Type: Flat MP  
Cost Amount: 12  
Base Accuracy: 88%  
Target Pattern: One enemy  
Combo Tags: Water, Surge, Crash, Heavy, Finisher

Surge Crash is Aquaphant’s heavier Water attack.

It should give Aquaphant a way to punish vulnerable targets, but it should not be efficient enough to spam. The accuracy and MP cost create a real tradeoff.

## Example Art Access By Level Cap

| Level Cap | Natural Arts Available |
|---:|---|
| 10 | Bubble Shot, Soak Hide |
| 20 | Bubble Shot, Soak Hide, Tidal Bump |
| 30 | Bubble Shot, Soak Hide, Tidal Bump, Surge Crash |
| 40+ | Uses later species Art additions if authored |

This table is an example based only on the currently scoped Arts. It is not a final progression lock, not a cap on total move count, and not a requirement that each creature learns exactly one Art per 10 levels. The important rule is that ruleset level cap controls the available natural Art pool.

## Class-Tree Skill and Passive Access

Aquaphant rentals should receive access to legal Skills and Passives from the shared class trees, not Aquaphant-specific passive seeds.

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

For rental modes, this means Aquaphant should have predefined rental build profiles or a rental loadout editor, not species-exclusive passive design.

## Suggested Rental Build Profiles

These are not species passives. These are suggested stat-allocation profiles that determine which shared class-tree Skills and Passives Aquaphant can access in rental play.

### Level 10 Profile: Water Bruiser Baseline

Manual Allocation Bias: Defense / Intelligence  
Expected Class Access: early defensive and Magic-damage options  
Purpose: Gives Aquaphant basic trading power without making it a full tank.

### Level 20 Profile: Sustain Bruiser

Manual Allocation Bias: Defense / Spirit or HP / Intelligence, depending on final class tree structure  
Expected Class Access: stronger defensive passives, moderate Magic pressure, possible resource tools  
Purpose: Lets Aquaphant hold the board longer and punish poor targeting.

### Level 30 Profile: Heavy Water Anchor

Manual Allocation Bias: HP / Defense / Intelligence  
Expected Class Access: stronger bruiser skills, stronger defensive passives, heavier Magic pressure  
Purpose: Makes Aquaphant a real anchor in higher-cap rental battles.

These profiles should be replaced by exact class-tree references once the class tree document is locked.

## Combo Tags

Aquaphant should expose the following species and Art tags:

```txt
Water
Bubble
Tide
Surge
Crash
Hide
Guard
Bruiser
Pressure
Stabilize
Heavy
```

These tags allow Aquaphant to participate in Water damage combos, defensive stabilization combos, and bruiser-pressure combos.

## Combo Direction

Aquaphant should enable steady Water combo pressure and durable setup plays.

Good combo identities:

- Water + Gaia = restoration, bloom, sustain pressure
- Water + Ice = chill, freeze, slow control
- Water + Wind = storm surge or rain pressure
- Water + Earth = mud, erosion, defensive attrition
- Water + Fire = steam burst, pressure conversion

Aquaphant’s combos should generally be reliable and mid-power rather than explosive. It should help teams grind advantage, not instantly delete targets.

## Draft Strength

Aquaphant is a strong draft pick when the player wants:

- A durable middle-slot creature
- Reliable Water coverage
- Stable Magic damage
- A creature that can take pressure without immediate support
- A safer answer into aggressive teams
- A bruiser that works with both support and offense

Aquaphant pairs well with creatures that either protect its slow tempo or exploit the time it buys.

Strong likely partners:

- Flor, because sustain plus bruiser durability creates a stable core.
- Pengun, because Water + Ice can support control-heavy plans.
- Galeon, because speed and tempo support help Aquaphant act before taking too much damage.
- Lumora, because cleansing/support can keep Aquaphant active in longer fights.

## Draft Weakness

Aquaphant should struggle against:

- Fast burst teams that focus one target before Aquaphant gets value
- Strong anti-tank pressure
- Heavy Magic attackers targeting its only medium Spirit
- MP-drain or resource pressure if added later
- Creatures that resist or absorb Water
- Teams that ignore Aquaphant and remove its partners first

Aquaphant should not force enemies to attack it. If it is too ignorable, its damage may be too low. If it is too mandatory to attack, its pressure may be too high.

## AI Behavior Notes

Aquaphant AI should prioritize actions based on the Arts and class-tree moves available at the selected level cap.

Baseline priority:

1. Use Soak Hide if Aquaphant is likely to receive focused Physical pressure.
2. Use the strongest efficient Water Art available when a target is vulnerable.
3. Use lower-cost Water Arts when conserving MP or finishing low-HP targets.
4. Use class-tree Skills when they are more efficient than species Arts for the current situation.
5. Use Defend if low on HP and no better defensive option is available.

Aquaphant AI should not assume Surge Crash exists in Level 10 or Level 20 battles.

Suggested self-defense threshold:

```txt
Use Soak Hide when Aquaphant is at or below 60% HP and at least one enemy physical attacker is active.
```

Suggested heavy attack threshold:

```txt
Use the highest available heavy Water Art when the target is at or below 45% HP, weak to Water, or is a high-priority threat.
```

## Rental Version

Aquaphant rental data should be generated or selected per level cap.

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

Do not hardcode Aquaphant as always having the full currently scoped Art batch. Higher-cap rulesets should receive all legal Arts, and future additional Arts should be included automatically when their `Learned At` value is within the selected cap.

## Raised / RPG Version Direction

The raised version of Aquaphant can branch into stronger bruiser or tank identities later through manual stat allocation and class-tree progression.

Possible growth directions:

1. Water bruiser route
2. Self-sustain route
3. Anti-physical route
4. Heavy Magic Water attacker route
5. Mud/erosion hybrid route if Earth synergy is later emphasized

RPG progression can expand Aquaphant’s endurance and Water pressure, but the rental version should remain ruleset-compatible with level-cap restrictions.

## Balance Risks

### Risk: Aquaphant becomes too hard to kill

Mitigation:

- Keep Speed low.
- Keep Soak Hide self-only.
- Avoid strong direct healing in the natural Art list.
- Keep Spirit only medium, not high.

### Risk: Aquaphant becomes too passive

Mitigation:

- Keep Bubble Shot and Tidal Bump efficient enough to matter.
- Let higher-cap formats unlock heavier pressure through Surge Crash.
- Use class-tree access to create build variety instead of species-only passives.

### Risk: Aquaphant overlaps with Flor

Mitigation:

- Flor’s natural Arts should focus on ally support and Gaia sustain.
- Aquaphant’s natural Arts should focus on self-protection and Water trading.
- Aquaphant should not have party healing or broad cleanse tools in its natural Art list.

### Risk: Aquaphant overlaps with Clod

Mitigation:

- Clod should be the stronger physical wall.
- Aquaphant should have better Water Magic pressure and resource play.
- Aquaphant’s durability should come from HP and self-protection, not pure Defense dominance.

### Risk: Rental rules drift away from RPG rules

Mitigation:

- Rentals must use level-cap Art access.
- Rentals must use shared class-tree Skills and Passives.
- Rental passive access must come from stat allocation/class route assumptions, not species identity.
- Ruleset validation must reject moves, Skills, or Passives above the selected cap.

## Implementation Notes

Aquaphant should use the shared combat core without special-case rules.

Damaging Arts should use:

```txt
Command Source: Art
Damage Type: Magic
Offensive Stat: Intelligence
Defensive Stat: Spirit
Base Power
Element Mode: Water
```

Soak Hide should use:

```txt
Command Source: Art
Damage Type: Utility / Non-damaging
Element Mode: Water
Effect: temporary self mitigation
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

Do not implement rental Aquaphant as a separate creature ruleset. It must be a predefined resolved creature object that still obeys the shared combat data contract.

## One-Line Summary

Aquaphant is a slow Water sustain bruiser whose natural Arts provide self-protection and steady Magic pressure, while its rental Skills and Passives come from shared class-tree access controlled by the selected battle level cap.
