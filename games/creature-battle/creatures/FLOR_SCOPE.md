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

## Battle Personality

Flor wants to stabilize the battlefield.

Its ideal turn choices are:

1. Heal a damaged ally.
2. Protect or reinforce an ally before incoming pressure.
3. Slow or disrupt an enemy threat.
4. Use low-damage Gaia pressure when no support action is needed.

Flor should be useful every round, but it should rarely be the most dangerous creature on the field.

## Natural Arts

Flor’s natural Art list should stay compact. Starter rental Flor should use 4 Arts.

### Sprout Tap

Art ID: `sprout_tap`  
Display Name: Sprout Tap  
Source: Species Art  
Damage Category: Art Damage  
Element Mode: Gaia  
Base Damage Tier: Minimal Damage  
Base Damage Value: 22  
Scaling Stat: Intelligence  
Defensive Stat: Spirit  
MP Cost: 4  
Base Accuracy: 96%  
Target Pattern: One enemy  
Combo Tags: Gaia, Plant, Seed, Support

Sprout Tap is Flor’s reliable basic Gaia attack.

It should exist so Flor always has a useful action when healing or support is not needed, but it should not threaten knockouts unless the target is already weakened or weak to Gaia.

### Root Snare

Art ID: `root_snare`  
Display Name: Root Snare  
Source: Species Art  
Damage Category: Art Damage  
Element Mode: Gaia  
Base Damage Tier: Minimal Damage  
Base Damage Value: 18  
Scaling Stat: Intelligence  
Defensive Stat: Spirit  
MP Cost: 6  
Base Accuracy: 90%  
Target Pattern: One enemy  
Secondary Effect: Soft Speed reduction or tempo-control effect  
Combo Tags: Gaia, Root, Control, Setup

Root Snare is Flor’s control Art.

It should deal light damage and create tempo pressure without becoming a hard stun. If status effects are not implemented yet, Root Snare can temporarily apply a simple battle modifier such as reduced Speed for the next action or next round.

Root Snare should be useful against fast enemies but not reliable enough to completely shut them down every round.

### Petal Mend

Art ID: `petal_mend`  
Display Name: Petal Mend  
Source: Species Art  
Damage Category: None  
Element Mode: Gaia  
Healing Tier: Moderate Heal  
Base Heal Value: 34  
Scaling Stat: Spirit  
MP Cost: 8  
Base Accuracy: Guaranteed  
Target Pattern: One ally  
Combo Tags: Gaia, Heal, Flower, Support

Petal Mend is Flor’s core healing Art.

It should restore meaningful HP but should not erase a full enemy turn for free. The MP cost needs to matter. Flor should eventually run out of sustain if it is forced to heal every round.

Petal Mend should be stronger when Flor is built or tuned around Spirit, but the rental version should stay predictable.

### Verdant Guard

Art ID: `verdant_guard`  
Display Name: Verdant Guard  
Source: Species Art  
Damage Category: None  
Element Mode: Gaia  
Effect Tier: Defensive Utility  
Base Damage Value: None  
MP Cost: 10  
Base Accuracy: Guaranteed  
Target Pattern: One ally  
Effect: Reduces incoming Art damage or increases Spirit temporarily  
Combo Tags: Gaia, Guard, Ward, Support, Stabilize

Verdant Guard is Flor’s defensive support Art.

The safest first implementation is single-target protection. Party-wide protection may become too strong in 3v3 unless the effect is modest.

Recommended prototype behavior:

```txt
Target ally receives reduced incoming Art damage for the current round or next incoming Art hit.
```

Alternative behavior:

```txt
Target ally gains a temporary Spirit increase for one round.
```

Do not stack both versions at full strength. Pick one clean behavior for implementation.

## Art List Summary

| Art | Type | Element | Tier | Base Value | Cost | Target |
|---|---|---|---:|---:|---:|---|
| Sprout Tap | Damage | Gaia | Minimal | 22 | 4 MP | One enemy |
| Root Snare | Damage + Control | Gaia | Minimal | 18 | 6 MP | One enemy |
| Petal Mend | Healing | Gaia | Moderate Heal | 34 | 8 MP | One ally |
| Verdant Guard | Defensive Support | Gaia | Utility | None | 10 MP | One ally |

## Passive Direction

Flor’s passive identity should support sustain, Gaia resistance, MP efficiency, and protection.

Flor passives should not push Flor toward high damage. Its offensive contribution should come from combo participation and attrition, not direct burst.

## Passive Seeds

### Soft Roots

Passive ID: `soft_roots`  
Category: Resistance Passive  
Effect Direction: Flor gains minor resistance against Gaia and Earth damage.

Purpose: Reinforces Flor’s natural stability without making it immune to pressure.

### Careful Bloom

Passive ID: `careful_bloom`  
Category: Healing Passive  
Effect Direction: Flor’s healing Arts restore slightly more HP when targeting allies below 50% HP.

Purpose: Improves clutch support without increasing healing spam at full HP.

### Deep Soil

Passive ID: `deep_soil`  
Category: Resource Passive  
Effect Direction: Flor recovers a small amount of MP after using Defend.

Purpose: Encourages defensive play and gives Flor a way to extend support without making healing unlimited.

## Default Equipped Passives

For the starter rental version, Flor should equip:

1. Careful Bloom
2. Deep Soil
3. Soft Roots

If this makes Flor too hard to remove, remove Soft Roots first. The healing and MP identity matter more than resistance stacking.

## Combo Tags

Flor should expose the following combo tags:

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

Flor AI should prioritize actions in this order:

1. Use Petal Mend if an ally is below the healing threshold.
2. Use Verdant Guard if an ally is likely to be targeted by Art damage or burst pressure.
3. Use Root Snare against a fast or high-priority enemy.
4. Use Sprout Tap when no support action is needed.
5. Use Defend if Flor is low on HP or needs to trigger defensive/passive value.

Flor AI should not waste Petal Mend on allies with only minor damage.

Suggested healing threshold:

```txt
Use Petal Mend when an ally is at or below 55% HP.
```

Suggested emergency threshold:

```txt
Prioritize Petal Mend strongly when an ally is at or below 35% HP.
```

## Rental Version

Starter rental Flor should use the full 4-Art list:

```txt
Sprout Tap
Root Snare
Petal Mend
Verdant Guard
```

Default equipped passives:

```txt
Careful Bloom
Deep Soil
Soft Roots
```

Rental Flor should be tuned as a stable support pick, not a high-skill combo engine. It should teach players how healing, defensive support, Gaia typing, and soft control work.

## Raised / RPG Version Direction

The raised version of Flor can branch into stronger support identities later.

Possible growth directions:

1. Pure healer route
2. Gaia control route
3. Defensive ward route
4. Combo-support route
5. MP-efficient sustain route

RPG progression can expand Flor’s support kit, but the rental version should remain the clean baseline.

## Balance Risks

### Risk: Flor creates stall games

Mitigation:

- Keep healing MP costs meaningful.
- Avoid party-wide healing at launch.
- Avoid stacking too many defensive passives.
- Keep Flor’s damage low.

### Risk: Flor becomes too passive

Mitigation:

- Give Root Snare useful tempo pressure.
- Give Sprout Tap reliable chip damage.
- Give Flor relevant combo tags.

### Risk: Flor becomes too complete

Mitigation:

- Keep Strength low.
- Keep Speed below average.
- Avoid high direct damage Arts.
- Do not give Flor both strong healing and strong team-wide mitigation early.

## Implementation Notes

Flor should use the shared combat core without special-case rules.

Damaging Arts should use:

```txt
Art Damage
Intelligence vs Spirit
Base Damage Value
Element Mode: Gaia
```

Healing Arts should use:

```txt
Base Heal Value
Relevant Stat: Spirit
Passive healing modifiers
No critical hits by default
```

Defensive Arts should be represented as explicit temporary battle modifiers, not hidden exceptions.

## One-Line Summary

Flor is a Gaia sustain/control creature that stabilizes allies through healing, soft root-based tempo control, and defensive support while remaining slow, low-damage, and vulnerable to focused pressure.
