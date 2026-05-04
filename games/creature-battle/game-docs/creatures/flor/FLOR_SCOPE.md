# Flor Scope Document

## Creature Identity

Creature ID: `flor`  
Display Name: Flor  
Element: Gaia  
Primary Role: Sustain / control  
Secondary Role: Defensive support  
Roster Type: Starter rental creature  
Battle Format Target: 3v3 rental draft and direct battle

Flor is the baseline Gaia support creature for the starter rental roster. It should feel stable, readable, and beginner-friendly without becoming a passive stall machine.

Flor’s role is to keep a team alive long enough for stronger offensive creatures to execute their plan. It should contribute through healing, soft tempo control, and defensive support, not through high damage output.

## Design Intent

Flor should be the “safe support” pick.

It should help teams survive pressure, punish reckless burst attempts, and create combo openings for Gaia-based or support-based team compositions.

Flor should not be a primary carry. If Flor can heal, defend, control tempo, and deal strong damage at the same time, it becomes too complete. Its offensive ceiling should stay limited unless enabled by team combos.

## Element

Element: Gaia

Gaia should represent natural growth, restorative pressure, roots, plants, vitality, and defensive stabilization.

Flor’s Gaia identity should lean toward healing, root control, sustain, and protection. It should not overlap too heavily with Earth’s rock/armor identity or Wind’s speed/tempo identity.

## Natural Stat Growth Bias

Flor’s natural growth should prioritize Spirit, MP, and survivability.

| Stat | Growth Bias | Notes |
|---|---:|---|
| HP | Medium | Durable enough to stay useful, but not a true tank. |
| MP | Medium-High | Needs enough MP to support the team over multiple rounds. |
| Strength | Low | Basic Attack should be weak. Flor should not be a physical threat. |
| Defense | Medium | Can survive basic physical pressure, but focused attackers can break through. |
| Intelligence | Medium | Art damage and utility remain functional but not explosive. |
| Spirit | High | Core stat. Supports healing, Art resistance, and defensive utility. |
| Speed | Low-Medium | Flor should usually act after fast tempo creatures. |

## Stat Package Summary

High Stat: Spirit  
Medium Stats: MP, Defense  
Low-Medium Stat: Speed  
Weakness Stat: Strength

Flor should not have high Speed. A fast healer/control creature creates too much frustration and can invalidate aggressive draft plans.

## Rental Level-Cap Rule

Rental Flor does not have one fixed Art, Skill, or Passive loadout for all formats. The listed Arts in this document are an initial scoped batch, not the final full species Art list.

The selected battle ruleset determines the rental level cap before the match. Flor receives only the natural Arts available at that level cap and only the class-tree Skills and Passives legal at that level cap.

Example:

```txt
Level 10 rental battle:
- Flor uses Level 10 rental stats.
- Flor has access only to Arts learned by Level 10.
- Flor has access only to class-tree Skills and Passives legal by Level 10.

Level 20 rental battle:
- Flor uses Level 20 rental stats.
- Flor has access to Flor Arts learned through Level 20.
- Flor has access to class-tree Skills and Passives legal through Level 20.

Level 30+ rental battle:
- Flor continues gaining natural Arts by species schedule.
- Skills and Passives continue expanding through the shared class trees.
```

This keeps rentals compatible with the RPG progression model instead of becoming isolated fixed kits.

## Arts vs Skills and Passives

Flor’s natural Arts are species-defined.

Skills and Passives are not species-defined. They come from manual stat allocation and class-tree access.

This means Flor scope documents should define:

- Natural Art pool and learning schedule
- Natural stat growth bias
- Suggested rental stat package direction
- Draft identity
- AI behavior
- Combo tags from species Arts and element identity

Flor scope documents should not define Flor-exclusive Passives or Flor-exclusive class Skills unless a future ruleset explicitly creates special rental-only presets.

Flor may gain additional species Arts later. Those should be added to the natural Art pool with learned-at levels instead of changing the core rental rule.

## Natural Art Pool and Learning Schedule

Flor’s natural Arts are species-defined and may contain more moves than the first scoped batch below. Each natural Art should have a `Learned At` value. The exact level milestones and total number of Arts are tuning data, not locked structure.

The rental ruleset should expose every natural Art with `Learned At <= Selected Level Cap`.

Do not infer a fixed rate such as one Art per 10 levels. Do not infer that the listed Arts are the complete final species move pool.

### Level 10 Art: Sprout Tap

Art ID: `sprout_tap`  
Display Name: Sprout Tap  
Learned At: Level 10 baseline  
Source: Species Art  
Command Source: Art  
Damage Type: Magic  
Element Mode: Gaia  
Potency Tier: Minimal Damage  
Base Power: 22  
Move Power Modifier: 0  
Scaling Stat: Intelligence  
Defensive Stat: Spirit  
Cost Type: Flat MP  
Cost Amount: 4  
Base Accuracy: 96%  
Target Pattern: One enemy  
Combo Tags: Gaia, Plant, Seed, Support

Sprout Tap is Flor’s reliable basic Gaia attack.

It should exist so Flor always has a useful action when healing or support is not needed, but it should not threaten knockouts unless the target is already weakened or weak to Gaia.

### Level 10 Art: Petal Mend

Art ID: `petal_mend`  
Display Name: Petal Mend  
Learned At: Level 10 baseline  
Source: Species Art  
Command Source: Art  
Damage Type: Utility / Non-damaging  
Element Mode: Gaia  
Healing Tier: Moderate Heal  
Base Heal Value: 34  
Move Power Modifier: 0  
Scaling Stat: Spirit  
Cost Type: Flat MP  
Cost Amount: 8  
Base Accuracy: Guaranteed  
Target Pattern: One ally  
Combo Tags: Gaia, Heal, Flower, Support

Petal Mend is Flor’s core healing Art.

It should restore meaningful HP but should not erase a full enemy turn for free. The MP cost needs to matter. Flor should eventually run out of sustain if it is forced to heal every round.

### Level 20 Art: Root Snare

Art ID: `root_snare`  
Display Name: Root Snare  
Learned At: Level 20 baseline  
Source: Species Art  
Command Source: Art  
Damage Type: Magic  
Element Mode: Gaia  
Potency Tier: Minimal Damage  
Base Power: 18  
Move Power Modifier: 0  
Scaling Stat: Intelligence  
Defensive Stat: Spirit  
Cost Type: Flat MP  
Cost Amount: 6  
Base Accuracy: 90%  
Target Pattern: One enemy  
Secondary Effect: Soft Speed reduction or tempo-control effect  
Combo Tags: Gaia, Root, Control, Setup

Root Snare is Flor’s control Art.

It should deal light damage and create tempo pressure without becoming a hard stun. If status effects are not implemented yet, Root Snare can temporarily apply a simple battle modifier such as reduced Speed for the next action or next round.

### Level 30 Art: Verdant Guard

Art ID: `verdant_guard`  
Display Name: Verdant Guard  
Learned At: Level 30 baseline  
Source: Species Art  
Command Source: Art  
Damage Type: Utility / Non-damaging  
Element Mode: Gaia  
Potency Tier: Defensive Utility  
Base Power: None  
Move Power Modifier: 0  
Cost Type: Flat MP  
Cost Amount: 10  
Base Accuracy: Guaranteed  
Target Pattern: One ally  
Effect: Reduces incoming Magic damage or increases Spirit temporarily.  
Combo Tags: Gaia, Guard, Ward, Support, Stabilize

Verdant Guard is Flor’s defensive support Art.

The safest first implementation is single-target protection. Party-wide protection may become too strong in 3v3 unless the effect is modest.

Recommended prototype behavior:

```txt
Target ally receives reduced incoming Magic damage for the current round or next incoming Magic hit.
```

Alternative behavior:

```txt
Target ally gains a temporary Spirit increase for one round.
```

Do not stack both versions at full strength. Pick one clean behavior for implementation.

## Example Art Access By Level Cap

| Level Cap | Natural Arts Available |
|---:|---|
| 10 | Sprout Tap, Petal Mend |
| 20 | Sprout Tap, Petal Mend, Root Snare |
| 30 | Sprout Tap, Petal Mend, Root Snare, Verdant Guard |
| 40+ | Uses later species Art additions if authored |

This table is an example based only on the currently scoped Arts. It is not a final progression lock, not a cap on total move count, and not a requirement that each creature learns exactly one Art per 10 levels. The important rule is that ruleset level cap controls the available natural Art pool.

## Class-Tree Skill and Passive Access

Flor rentals should receive access to legal Skills and Passives from the shared class trees, not Flor-specific passive seeds.

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

For rental modes, this means Flor should have predefined rental build profiles or a rental loadout editor, not species-exclusive passive design.

## Suggested Rental Build Profiles

These are not species passives. These are suggested stat-allocation profiles that determine which shared class-tree Skills and Passives Flor can access in rental play.

### Level 10 Profile: Gaia Support Baseline

Manual Allocation Bias: Spirit / Intelligence  
Expected Class Access: early support options, basic Magic consistency, early defensive utility  
Purpose: Gives Flor healing identity without making it a full stall engine.

### Level 20 Profile: Root Control Support

Manual Allocation Bias: Spirit / Speed or Spirit / Intelligence, depending on final class tree structure  
Expected Class Access: stronger support passives, soft tempo tools, improved Magic reliability  
Purpose: Lets Flor support the team while adding light control.

### Level 30 Profile: Defensive Stabilizer

Manual Allocation Bias: Spirit / Defense / Intelligence  
Expected Class Access: stronger defensive passives, stronger support skills, improved sustain routing  
Purpose: Makes Flor a real support anchor in higher-cap rental battles.

These profiles should be replaced by exact class-tree references once the class tree document is locked.

## Combo Tags

Flor should expose the following species and Art tags:

```txt
Gaia
Plant
Flower
Root
Seed
Heal
Guard
Ward
Support
Stabilize
Setup
```

These tags allow Flor to participate in healing combos, Gaia control combos, defensive team combos, and setup-based 3v3 plays.

## Combo Direction

Flor should enable combos more often than it finishes them.

Good combo identities:

- Gaia + Fire = growth/burn tension
- Gaia + Water = healing bloom / restoration
- Gaia + Wind = pollen, spores, evasive setup
- Gaia + Light = cleansing / protection
- Gaia + Earth = rooted defense / fortification

Flor should not have many direct burst combos. Its strongest combo value should be team stabilization, recovery, or enabling another creature’s attack.

## Draft Strength

Flor is a strong draft pick when the player wants:

- Team sustain
- Anti-burst protection
- Defensive stability
- Gaia combo access
- A safe support anchor
- More forgiveness for fragile attackers

Flor pairs well with creatures that need time to build pressure.

Strong likely partners:

- Emberjaw, because Flor can help it survive long enough to apply physical elemental pressure.
- Galeon, because tempo setup plus sustain can control round flow.
- Aquaphant, because double sustain creates a bruiser-heavy core.
- Lumora, if the player wants a support-heavy control team.

## Draft Weakness

Flor should struggle against:

- Heavy burst teams
- Focus-fire strategies
- Anti-heal effects, if added later
- Dark disruption
- Strong physical attackers that pressure Flor’s weaker Defense side
- Teams that ignore sustain by eliminating one target quickly

Flor should not be able to save every ally from coordinated damage. If three enemies focus one target, Flor should help but not completely invalidate that decision.

## AI Behavior Notes

Flor AI should prioritize actions based on the Arts and class-tree moves available at the selected level cap.

Baseline priority:

1. Use Petal Mend if an ally is below the healing threshold.
2. Use Verdant Guard if available and an ally is likely to be targeted by Magic damage or burst pressure.
3. Use Root Snare if available against a fast or high-priority enemy.
4. Use Sprout Tap when no support action is needed.
5. Use class-tree Skills when they are more efficient than species Arts for the current situation.
6. Use Defend if Flor is low on HP or needs defensive value.

Flor AI should not assume Root Snare or Verdant Guard exists in Level 10 battles.

Suggested healing threshold:

```txt
Use Petal Mend when an ally is at or below 55% HP.
```

Suggested emergency threshold:

```txt
Prioritize Petal Mend strongly when an ally is at or below 35% HP.
```

## Rental Version

Flor rental data should be generated or selected per level cap.

The rental object should include:

```txt
Creature ID
Display Name
Element
Role
Level
Resolved runtime stats
Natural Arts available at that level cap
Class-tree Skills available from the rental stat allocation profile
Class-tree Passives available from the rental stat allocation profile
Equipped Passive slots, if using preset loadouts
Combo Tags
Draft Strength
Draft Weakness
AI Behavior Notes
```

Do not hardcode Flor as always having the full currently scoped Art batch. Higher-cap rulesets should receive all legal Arts, and future additional Arts should be included automatically when their `Learned At` value is within the selected cap.

## Raised / RPG Version Direction

The raised version of Flor can branch into stronger support identities later through manual stat allocation and class-tree progression.

Possible growth directions:

1. Pure healer route
2. Gaia control route
3. Defensive ward route
4. Combo-support route
5. MP-efficient sustain route

RPG progression can expand Flor’s support kit, but the rental version should remain ruleset-compatible with level-cap restrictions.

## Balance Risks

### Risk: Flor creates stall games

Mitigation:

- Keep healing MP costs meaningful.
- Avoid party-wide healing at launch.
- Avoid stacking too many defensive class-tree options in low-cap rental profiles.
- Keep Flor’s natural damage low.

### Risk: Flor becomes too passive

Mitigation:

- Give Root Snare useful tempo pressure at the appropriate level cap.
- Give Sprout Tap reliable chip damage.
- Give Flor relevant combo tags.

### Risk: Flor becomes too complete

Mitigation:

- Keep Strength low.
- Keep Speed below average.
- Avoid high direct damage Arts.
- Do not give Flor both strong healing and strong team-wide mitigation early.

### Risk: Rental rules drift away from RPG rules

Mitigation:

- Rentals must use level-cap Art access.
- Rentals must use shared class-tree Skills and Passives.
- Rental passive access must come from stat allocation/class route assumptions, not species identity.
- Ruleset validation must reject moves, Skills, or Passives above the selected cap.

## Implementation Notes

Flor should use the shared combat core without special-case rules.

Damaging Arts should use:

```txt
Command Source: Art
Damage Type: Magic
Offensive Stat: Intelligence
Defensive Stat: Spirit
Base Power
Element Mode: Gaia
```

Healing Arts should use:

```txt
Command Source: Art
Damage Type: Utility / Non-damaging
Base Heal Value
Relevant Stat: Spirit
Passive healing modifiers from equipped class-tree passives
No critical hits by default
```

Defensive Arts should be represented as explicit temporary battle modifiers, not hidden exceptions.

Rental validation should check:

```txt
Selected ruleset level cap
Allowed natural Arts by `Learned At <= selected level cap`
Allowed class-tree Skills by level and rental stat profile
Allowed class-tree Passives by level and rental stat profile
Equipped Passive count
Ruleset restrictions
```

Do not implement rental Flor as a separate creature ruleset. It must be a predefined resolved creature object that still obeys the shared combat data contract.

## One-Line Summary

Flor is a Gaia sustain/control creature whose natural Arts provide healing, soft root-based tempo control, and defensive support, while its rental Skills and Passives come from shared class-tree access controlled by the selected battle level cap.