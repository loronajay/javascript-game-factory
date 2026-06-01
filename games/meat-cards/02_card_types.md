# Card Types

The game currently has three card types:

- Monster cards.
- Accessory cards.
- Later cards.

## Monster Cards

Monster cards have:

- Name.
- Star cost, currently up to 4.
- Picture/art.
- HP value.
- Strength value.
- Up to 4 total slots for abilities and/or passives.

Abilities and passives share the same slot limit.

Every monster has access to a normal attack by default unless a passive, accessory, ability, or Later card modifies that rule.

Default normal attack:

- Costs 2 stars.
- Uses the monster's strength value.
- Can be used once per turn per monster.
- Can be modified by card effects.

Monster damage is persistent across turns. Monsters do not automatically heal at turn end.

## Monster Abilities

Active monster abilities:

- Always have a star cost.
- Are normally once per turn per ability.
- Multiple different abilities on the same monster may be used in the same turn if the player has enough stars.
- Can have many target types and effect types depending on the card.

Abilities may include self-sacrifice, self-damage, friendly targeting, death effects, healing, stat changes, graveyard interactions, and other card-specific effects.

## Monster Passives

Most monster passives are active while the monster is in play.

Passive effects can also be conditional, such as:

- While damaged.
- While equipped.
- If the player has no cards in hand.
- After this monster kills another monster.
- When damage is taken.
- When a threshold is reached.
- When the monster would die.

Rare passives can function while the monster is in hand.

Some passives may have an explicit star cost when their condition is met, but that is rare.

## Accessory Cards

Accessories:

- Cost 1 star to equip by default.
- Attach to a monster.
- Can affect stats, rules, costs, limits, and other card behavior.
- Are normally permanent until the equipped monster dies.
- Cannot normally be manually removed, moved, or replaced.
- Can be removed, moved, or replaced only if a Later card, the accessory itself, or another explicit effect allows it.

Default accessory capacity:

- A monster can hold 1 accessory.

This limit can be increased by:

- Accessories.
- Monster passives.
- Later cards.
- Other explicit card effects.

When a monster dies, attached accessories and attached cards go to the graveyard with it.

## Later Cards

Later cards are their own card type.

Later cards:

- Are played on the player's turn by default.
- Have variable star costs depending on power.
- Can have very broad/crazy effects.
- Usually resolve and then go to the graveyard by default.

Some Later cards remain active on the board for reference. These active Later cards are readable by both players while their effect matters. The engine tracks their effect, duration, and cleanup.

Later cards may also create interrupt-like effects, delayed costs, free accessory placement, stat changes, graveyard interaction, player damage, restrictions, and other special rules.
