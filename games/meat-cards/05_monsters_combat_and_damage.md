# Monsters, Combat, and Damage

## Summoning

A player may play a monster by paying its star cost.

The monster is placed into one of the player's available monster slots.

Each player may have up to 4 monsters in play.

There is no sacrifice requirement, no evolution requirement, and no summoning sickness.

A monster may attack on the same turn it is played if the player has enough stars.

## Normal Attack

Every monster has a normal attack by default.

Default normal attack:

- Costs 2 stars.
- Uses the monster's current strength value.
- Can be used once per turn per monster.
- Requires a d6 attack roll.

Effects may increase or decrease attack cost, change attack behavior, allow extra attacks, or restrict attacks.

## Attack Roll

Normal attacks use a d6 roll after the attack is declared and its target is validated.

Attack roll results:

- `1`: the attack misses and deals no damage.
- `2-5`: the attack deals normal damage.
- `6`: the attack deals normal damage plus 2 extra damage.

The extra damage is added to the attack's damage before normal death and overflow rules are resolved, unless a card explicitly changes that timing.

## Attack Limits

Each monster may normally attack once per owner turn.

Attack uses reset at the start of the owner's turn.

Rare monsters may have special attack restrictions, such as only attacking once every other turn.

There is no general tapped/exhausted state.

## Ability Limits

Each active ability may normally be used once per owner turn.

A monster may use multiple different abilities in the same turn if the player has enough stars.

Ability uses reset at the start of the owner's turn.

Offensive active abilities also require the same d6 roll as normal attacks.

For offensive abilities:

- `1`: the ability misses and its offensive effects do not resolve.
- `2-5`: the ability resolves normally.
- `6`: if the offensive ability deals damage, it deals 2 extra damage.

Later cards do not use this roll by default. A Later card can require a roll if its own card text explicitly says so.

## Attack Targeting

Monsters may only attack enemy monsters while the opponent has monsters in play.

A player may only be attacked directly if they have no monsters in play.

Normal attacks cannot target the attacker's own monsters by default.

Friendly targeting, self-damage, and self-sacrifice exist only through explicit abilities or card effects.

## Combat Damage

Combat damage is one-way by default.

When a monster attacks another monster:

- The attacker deals damage to the target.
- The defender does not automatically deal damage back.

Some monsters have return-damage effects or other triggered effects when attacked/hit/targeted, but these are card-specific.

## Damage Persistence

Monster damage persists across turns.

Monsters do not automatically heal at turn end.

Strong monsters are intended to be whittled down over multiple turns.

## HP and Strength

Monster HP:

- Printed/base HP exists.
- Current maximum HP is tracked.
- Current HP is tracked separately.
- Maximum HP can be raised or reduced.
- When maximum HP is raised, current HP rises by the same amount.
- Current HP can never exceed current maximum HP.
- Healing cannot exceed current maximum HP.
- When maximum HP is reduced, current HP clamps to current maximum HP.

Monster strength:

- Printed/base strength exists.
- Current strength is tracked separately.
- Strength can be raised or reduced.
- Strength can be modified temporarily or persistently.
- Strength cannot go below 0.

Accessories, abilities, passives, Later cards, and other explicit effects can modify monster stats.

## Overflow Damage

Overflow damage applies by default.

If a monster is killed by damage greater than its remaining HP, the excess damage goes to that monster owner's player HP.

Example:

- Target monster has 1 HP.
- It takes 3 damage.
- The monster dies.
- Its owner takes 2 overflow damage.

Effects can reduce, increase, prevent, or otherwise modify overflow damage.

## Death and Graveyard

When a monster dies:

- The monster goes to the graveyard.
- Attached accessories/cards go to the graveyard with it.

Death effects exist.

Some death effects resolve before overflow damage is applied.

Some death effects resolve after overflow damage is applied.

The timing is card-specific.

## Brace / Survival Effects

Some effects prevent a monster from dying.

These are checked when a monster would die.

Possible card-specific results include:

- Monster survives at 1 HP.
- Damage is reduced.
- Death is canceled.
- Other card-specific survival behavior.

## Damage Triggers

Effects may trigger from damage-related events, including:

- When damage would be taken.
- After damage is taken.
- After surviving damage.
- When an HP threshold is reached.
- When the monster would die.
- On death before overflow.
- On death after overflow.

These timing windows need explicit support in the digital engine.
