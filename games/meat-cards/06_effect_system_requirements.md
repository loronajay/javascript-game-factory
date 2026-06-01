# Effect System Requirements

The game needs a flexible effect engine. Effects can originate from:

- Monster active abilities.
- Monster passives.
- Accessories.
- Later cards.
- Active Later cards.
- Triggered effects.
- Interrupt/reaction effects.

Do not model effects as plain text only. Text can be stored for display, but the engine needs structured behavior for validation and resolution.

## Effect Families Known So Far

Known effect categories include:

- Damage.
- Roll requirement.
- Miss/critical modification.
- Heal.
- Stat change.
- Maximum HP change.
- Strength change.
- Star modification.
- Draw.
- Discard.
- Summon/place monster.
- Equip.
- Free accessory placement.
- Destroy.
- Sacrifice.
- Death trigger.
- Restriction.
- Cost modification.
- Accessory slot modification.
- Attack modification.
- Overflow modification.
- Direct player damage.
- Temporary buff/debuff.
- Persistent buff/debuff.
- Graveyard interaction.
- Deck search.
- Hand interaction.
- Hidden-zone selection.
- Death/loss prevention.
- Monster brace/survival.
- Interrupt/reaction behavior.

## Durations

Effects may have different durations depending on card text.

Supported duration concepts should include:

- Instant.
- Permanent.
- Until end of turn.
- Until start of owner's next turn.
- Until start of opponent's next turn.
- For a fixed number of turns.
- While equipped.
- While this monster remains in play.
- While this Later card remains active.
- While a condition remains true.
- Until the affected monster dies.
- Until explicitly removed by another effect.

Accessory stat changes and rule changes are especially important because accessories can modify monster stats, accessory capacity, costs, attacks, and other behavior.

## Target Categories

Effects may target or affect:

- Own monster.
- Enemy monster.
- Any monster.
- Self/player.
- Opponent player.
- Own hand.
- Opponent hand.
- Own deck.
- Opponent deck.
- Own graveyard.
- Opponent graveyard.
- Attached accessories.
- All monsters.
- All own monsters.
- All enemy monsters.
- Global/no specific target.

## Hidden-Zone Effects

Hidden-zone effects may use different selection methods:

- Random.
- Top card.
- Owner chooses.
- Opponent chooses.
- Search and choose.
- Reveal then choose.
- Peek/look.

Search destination is card-specific.

Deck searches shuffle afterward by default unless the card states otherwise.

## Interrupts and Reactions

Normal actions mostly happen on the active player's turn.

Rare interrupt/reaction cases exist.

Interrupt-like effects may be:

- Automatic triggers.
- Manually triggered reactions.
- Replacement/prevention effects.
- After-event triggers.

Some happen during the opponent's turn and do not stop the opponent's turn. The opponent continues if they still have legal actions.

Costs for these effects vary:

- Some are free.
- Some are paid immediately.
- Some create delayed star costs that are automatically spent at the start of the player's next turn.
- Some are Later cards with star costs.
- Some are monster abilities or rare passives with star costs.

## Event Windows Needed

The engine should eventually support named event windows such as:

- Start of turn.
- Star debt applied.
- Card drawn.
- Monster summoned.
- Accessory equipped.
- Later card played.
- Attack declared.
- Attack target validated.
- Roll required.
- Roll resolved.
- Damage would be dealt.
- Damage dealt.
- Damage taken.
- Monster would die.
- Death prevented.
- Monster dies before overflow.
- Overflow damage calculated.
- Overflow damage applied.
- Monster dies after overflow.
- Card enters graveyard.
- End-turn unused-star check.
- Final discard to cover unused stars.
- Hand-size cleanup.
- End of turn.

Exact priority/ordering can be refined once actual card examples are entered.
