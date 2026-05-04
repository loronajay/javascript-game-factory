# Salamander Scope Document

## Creature Identity

Creature ID: `salamander`  
Display Name: Salamander  
Element: Fire  
Primary Role: Art pressure  
Secondary Role: Fire offense / burn-style tempo pressure  
Roster Type: Starter rental creature  
Battle Format Target: 3v3 rental draft and direct battle

Salamander is the baseline Fire Art attacker for the starter rental roster. It should teach players how elemental Art pressure works without collapsing into a pure glass cannon that either wins immediately or dies immediately.

Salamander’s role is to apply consistent Fire pressure, punish low-Spirit enemies, and create offensive combo openings. It should be more threatening than Flor, but less physically direct than Emberjaw.

## Design Intent

Salamander should be the “starter caster pressure” pick.

It should threaten enemies through Fire Arts, reliable damage, and matchup pressure. It should make opponents respect elemental weakness, Spirit values, MP management, and target priority.

Salamander should not be a bruiser. If it has strong Art damage, high Speed, and good durability at the same time, it becomes too safe. Its defensive profile needs clear weaknesses.

## Element

Element: Fire

Fire should represent pressure, damage momentum, volatile offense, and aggressive combo setup.

Salamander’s Fire identity should lean toward Art damage and offensive tempo. It should not overlap too heavily with Emberjaw, which should own the physical elemental Fire attacker space.

## Natural Stat Growth Bias

Salamander’s natural growth should prioritize Intelligence and MP, with enough Speed to apply pressure but not enough durability to ignore counterplay.

| Stat | Growth Bias | Notes |
|---|---:|---|
| HP | Low-Medium | Should not survive repeated focus fire. |
| MP | Medium-High | Needs enough MP to use several Fire Arts before falling back to Attack or Defend. |
| Strength | Low | Basic Attack should be a weak fallback. |
| Defense | Low-Medium | Physical attackers should threaten Salamander. |
| Intelligence | High | Core damage stat. Salamander’s Arts should matter. |
| Spirit | Medium | Can handle some Art trades but should not be a magical wall. |
| Speed | Medium | Acts before tanks and supports, but should lose initiative to true tempo creatures. |

## Stat Package Summary

High Stat: Intelligence  
Medium Stats: MP, Speed  
Low-Medium Stat: Spirit  
Weakness Stat: Defense

Salamander should not have high Defense. It needs a real punishment route for opponents who draft physical pressure.

## Battle Personality

Salamander wants to keep pressure on one target until that target is forced into defensive play or knocked out.

Its ideal turn choices are:

1. Use reliable Fire damage against neutral or weak targets.
2. Use stronger Fire damage when a knockout or major HP swing is available.
3. Use setup pressure against enemies that are trying to Defend or stall.
4. Preserve MP when the target resists Fire or when Salamander is likely to be focused.

Salamander should feel active and dangerous, but not self-sufficient.

## Natural Arts

Salamander’s natural Art list should stay compact. Starter rental Salamander should use 4 Arts.

### Cinder Flick

Art ID: `cinder_flick`  
Display Name: Cinder Flick  
Source: Species Art  
Command Source: Art  
Damage Type: Magic  
Element Mode: Fire  
Potency Tier: Minimal Damage  
Base Power: 24  
Scaling Stat: Intelligence  
Defensive Stat: Spirit  
MP Cost: 4  
Base Accuracy: 96%  
Target Pattern: One enemy  
Combo Tags: Fire, Cinder, Spark, Pressure

Cinder Flick is Salamander’s reliable basic Fire Art.

It should be stronger than Flor’s basic chip Art, but still clearly below serious pressure moves. This is Salamander’s low-risk damage button.

### Flare Bite

Art ID: `flare_bite`  
Display Name: Flare Bite  
Source: Species Art  
Command Source: Art  
Damage Type: Magic  
Element Mode: Fire  
Potency Tier: Moderate Damage  
Base Power: 36  
Scaling Stat: Intelligence  
Defensive Stat: Spirit  
MP Cost: 7  
Base Accuracy: 92%  
Target Pattern: One enemy  
Combo Tags: Fire, Fang, Flare, Pressure

Flare Bite is Salamander’s primary offensive Art.

Despite the name, this should still resolve as Magic damage unless explicitly changed later. The name gives flavor, not physical scaling. This keeps Salamander separate from Emberjaw.

### Heat Haze

Art ID: `heat_haze`  
Display Name: Heat Haze  
Source: Species Art  
Command Source: Art  
Damage Type: Utility / Non-damaging  
Element Mode: Fire  
Effect Tier: Offensive Utility  
Base Power: None  
MP Cost: 6  
Base Accuracy: Guaranteed  
Target Pattern: Self  
Effect: Temporarily improves Salamander’s Accuracy or reduces the next incoming hit chance against Salamander by a modest amount  
Combo Tags: Fire, Haze, Setup, Evasion, Pressure

Heat Haze is Salamander’s setup and survival utility.

This should not become a hard evasion wall. The safest first implementation is a modest one-round modifier that helps Salamander stay active without making attacks against it feel pointless.

Recommended prototype behavior:

```txt
Salamander gains a small Accuracy bonus for its next Art and a small Evasion bonus until the end of the round.
```

If that is too much for one move, keep only the Accuracy bonus first.

### Ember Surge

Art ID: `ember_surge`  
Display Name: Ember Surge  
Source: Species Art  
Command Source: Art  
Damage Type: Magic  
Element Mode: Fire  
Potency Tier: Heavy Damage  
Base Power: 52  
Scaling Stat: Intelligence  
Defensive Stat: Spirit  
MP Cost: 12  
Base Accuracy: 88%  
Target Pattern: One enemy  
Combo Tags: Fire, Ember, Surge, Finisher, Pressure

Ember Surge is Salamander’s high-cost pressure Art.

It should threaten serious damage, especially into Fire weakness, but the MP cost and lower accuracy should matter. Salamander should not be able to spam this safely for an entire battle.

## Art List Summary

| Art | Type | Element | Tier | Base Value | Cost | Target |
|---|---|---|---:|---:|---:|---|
| Cinder Flick | Damage | Fire | Minimal | 24 | 4 MP | One enemy |
| Flare Bite | Damage | Fire | Moderate | 36 | 7 MP | One enemy |
| Heat Haze | Utility | Fire | Utility | None | 6 MP | Self |
| Ember Surge | Damage | Fire | Heavy | 52 | 12 MP | One enemy |

## Passive Direction

Salamander’s passive identity should support Fire Art pressure, MP conversion, accuracy stability, and offensive tempo.

Salamander passives should not patch all of its weaknesses. It can have tools to survive pressure, but it should remain punishable by physical attackers and focused targeting.

## Passive Seeds

### Kindled Mind

Passive ID: `kindled_mind`  
Category: Damage Passive  
Effect Direction: Salamander’s Fire Arts gain a small damage increase when targeting enemies above 50% HP.

Purpose: Encourages early pressure without making late knockouts automatic.

### Banked Coals

Passive ID: `banked_coals`  
Category: Resource Passive  
Effect Direction: Salamander recovers a small amount of MP after using a Minimal Damage Art.

Purpose: Lets Salamander maintain light pressure without making Heavy Arts free.

### Flicker Step

Passive ID: `flicker_step`  
Category: Tempo Passive  
Effect Direction: After Salamander uses Heat Haze, it gains a small temporary Speed or Evasion bonus.

Purpose: Supports the caster-pressure identity while keeping the bonus tied to a turn investment.

## Default Equipped Passives

For the starter rental version, Salamander should equip:

1. Kindled Mind
2. Banked Coals
3. Flicker Step

If Salamander’s pressure is too consistent, remove Banked Coals first. Resource extension can quietly become stronger than raw damage because it increases the number of meaningful turns Salamander gets.

## Combo Tags

Salamander should expose the following combo tags:

```txt
Fire
Cinder
Spark
Flare
Ember
Heat
Haze
Fang
Pressure
Setup
Finisher
```

These tags allow Salamander to participate in Fire burst combos, Fire + Wind spread-pressure combos, Fire + Gaia growth/burn tension combos, and Fire + Dark risk/reward offense.

## Combo Direction

Salamander should be a combo damage contributor more often than a defensive combo enabler.

Good combo identities:

- Fire + Wind = flame spread, flare cyclone, multi-target pressure
- Fire + Gaia = overgrowth burn, volatile bloom, damage-over-time pressure if statuses exist later
- Fire + Dark = risky burst, backlash damage, disruption offense
- Fire + Light = cleansing flame, accuracy-stable Fire strike
- Fire + Earth = molten pressure, armor-breaking heat

Salamander should have access to strong two-creature combos, but its solo Art kit should remain the balance baseline.

## Draft Strength

Salamander is a strong draft pick when the player wants:

- Reliable Fire Art pressure
- Punishment against low-Spirit enemies
- Offensive elemental coverage
- Combo access for Fire-based teams
- A damage threat that does not require physical Strength

Salamander pairs well with creatures that can protect it or improve its tempo.

Strong likely partners:

- Flor, because Flor can stabilize Salamander and buy it more casting turns.
- Galeon, because Wind tempo can help Salamander apply pressure before it is focused down.
- Lumora, because accuracy and support tools can make Salamander’s heavier Arts more reliable.
- Nocthorn, if the player wants a high-pressure team that forces defensive mistakes.

## Draft Weakness

Salamander should struggle against:

- Physical burst
- High-Spirit tanks
- Fire-resistant or Fire-absorbing targets
- Focus-fire strategies
- MP attrition
- Faster attackers that can remove it before it casts enough Arts

Salamander should not be safe as a blind first pick unless the player is comfortable drafting protection around it.

## AI Behavior Notes

Salamander AI should prioritize actions in this order:

1. Use Ember Surge if it can secure a knockout or create a decisive HP swing.
2. Use Flare Bite as the default pressure Art.
3. Use Cinder Flick when conserving MP or finishing a very low-HP target.
4. Use Heat Haze when Salamander is threatened but still has enough HP to benefit from setup.
5. Use Defend if Salamander is low on HP and likely to be targeted.

Salamander AI should avoid using Fire Arts into known Fire absorption unless no better action exists.

Suggested knockout threshold:

```txt
Use Ember Surge aggressively when estimated damage can reduce the target to 0 HP or below 20% HP.
```

Suggested MP conservation threshold:

```txt
Prefer Cinder Flick when Salamander has 8 MP or less unless a stronger Art can secure a knockout.
```

## Rental Version

Starter rental Salamander should use the full 4-Art list:

```txt
Cinder Flick
Flare Bite
Heat Haze
Ember Surge
```

Default equipped passives:

```txt
Kindled Mind
Banked Coals
Flicker Step
```

Rental Salamander should be tuned as an accessible Art-pressure creature. It should teach Fire damage, MP tradeoffs, accuracy tradeoffs, and the cost of being fragile.

## Raised / RPG Version Direction

The raised version of Salamander can branch into stronger offensive identities later.

Possible growth directions:

1. Pure Fire caster route
2. Accuracy-stable Art route
3. High-risk burst route
4. MP-efficient pressure route
5. Fire combo specialist route

RPG progression can expand Salamander’s offensive ceiling, but the rental version should remain readable and punishable.

## Balance Risks

### Risk: Salamander deletes targets too quickly

Mitigation:

- Keep Heavy Art MP costs meaningful.
- Keep Ember Surge below perfect accuracy.
- Preserve Salamander’s physical fragility.
- Avoid giving it strong defensive passives at launch.

### Risk: Salamander runs out of MP too quickly

Mitigation:

- Keep Cinder Flick affordable.
- Use Banked Coals for light pressure recovery.
- Avoid making every useful Art expensive.

### Risk: Salamander overlaps with Emberjaw

Mitigation:

- Salamander uses Intelligence vs Spirit.
- Emberjaw should use Strength vs Defense through Physical damage with Fire Element Mode.
- Salamander’s flavor can include claws, bites, and flame body language, but its battle data should remain Art-focused.

### Risk: Heat Haze creates annoying evasion loops

Mitigation:

- Keep evasion bonuses modest.
- Limit the duration to one round or one incoming attack.
- Do not allow repeated stacking.

## Implementation Notes

Salamander should use the shared combat core without special-case rules.

Damaging Arts should use:

```txt
Command Source: Art
Damage Type: Magic
Scaling: Intelligence vs Spirit
Base Power
Element Mode: Fire
```

Utility Arts should use explicit temporary modifiers, not hidden exceptions.

Heat Haze should be represented as a temporary battle modifier with a clear duration and battle log event.

## One-Line Summary

Salamander is a Fire Art-pressure creature that threatens low-Spirit enemies through reliable elemental damage, controlled MP spending, and offensive combo setup while remaining physically fragile and vulnerable to focused pressure.
