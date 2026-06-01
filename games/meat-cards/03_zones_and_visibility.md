# Zones and Visibility

## Current Zones

The current game zones are:

- Deck.
- Hand.
- Monster board.
- Attached to monster.
- Active Later board.
- Graveyard.

There is currently no:

- Banished zone.
- Exile zone.
- Removed-from-game zone.
- Separate discard pile.
- Prize zone.
- Sideboard zone.

## Deck

Decks are hidden by default.

Deck search effects exist. After any deck search, that deck is shuffled by default unless the card states otherwise.

A searched card's destination is determined by the card. Possible destinations include:

- Hand.
- Monster board.
- Graveyard.
- Top of deck.
- Bottom of deck.
- Attached to monster.
- Other existing zone if explicitly supported by the card.

## Hand

Hands are hidden by default.

Some effects interact with hands through:

- Random discard.
- Owner chooses.
- Opponent chooses.
- Reveal then choose.
- Peek/look effects.
- Search effects, if the card allows it.

## Monster Board

Each player may have up to 4 monsters in play.

Players do not start with monsters in play.

Monsters are played by paying their star cost and placing them in an available monster slot.

## Attached to Monster

Accessories and other attached cards are attached to monsters.

Attached cards go to the graveyard with the monster when the monster dies unless a card says otherwise.

Attached card effects may need to remain readable during death resolution if they have death-related triggers.

## Active Later Board

Most Later cards resolve and go to the graveyard.

Some Later cards remain active on the board. These cards stay visible so either player can read them while their effect is active.

The engine should track the active effect separately from the visible card reference.

## Graveyard

The graveyard is an active gameplay zone, not just a trash pile.

Cards in the graveyard preserve identity, ownership, and card type because abilities and Later cards can interact with them.

Visibility:

- A player may view their own graveyard during their own turn.
- The opponent's graveyard is hidden by default.
- A player may search or inspect the opponent's graveyard only if a Later card, ability, or other explicit effect allows it.

Graveyard interactions may include revival, retrieval, counting cards, searching, targeting, or other card-specific effects.
