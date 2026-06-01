# Core Game Rules

## Players

Each player starts with:

- 20 current HP.
- 20 maximum HP.
- A 60-card premade deck.
- A starting hand of 5 cards.
- No monsters in play.

Player HP behaves like monster HP:

- Current HP cannot exceed current maximum HP.
- Healing cannot exceed current maximum HP.
- If maximum HP increases, current HP increases by the same amount.
- If maximum HP decreases below current HP, current HP clamps down to the new maximum HP.
- A player loses when their HP reaches 0 or below unless a card explicitly prevents death/loss.

## Win and Loss

Default loss condition:

- A player loses at 0 HP or below.

Other loss condition:

- A card may explicitly say the game is over for a player.

Deck-out is not an immediate loss condition.

## Deck Size and Deck Building

Current engine phase:

- Decks are premade.
- Each deck has 60 cards.
- At least 2 premade decks are needed before deck building is introduced.

Future deck-building rule:

- Maximum 4 copies of the same card per deck.

Deck building should not be part of the first engine pass.

## Starting Draw

At game start:

- Each player draws 5 cards.

First-turn draw:

- Player 1 draws 1 card on their first turn.
- Player 2 draws 2 cards on their first turn.

Normal draw:

- After the first-turn rules, each player draws 1 card at the start of their turn.

## Setup Turns

Neither player may take offensive actions on their first turn.

The first turn for each player is a setup turn.

An offensive action is any action or effect that affects the opponent in any way, including:

- Damage.
- Stat changes.
- Star removal or restriction.
- Board restriction.
- Hand/deck/graveyard interference.
- Any Later card, ability, passive, accessory, or attack that affects the opponent, opponent's monsters, opponent's resources, or opponent's zones.

## Hand Limit

Maximum hand size is 7 cards.

If a player has more than 7 cards at the end of their turn, they must discard down to 7 before passing the turn.

This cleanup happens after the optional discard-to-cover-unused-stars action.

## Deck-Out Rule

When a player is required to draw and cannot because their deck is empty, they take 2 damage per card they failed to draw.

Examples:

- Normal draw with empty deck: take 2 damage.
- Draw 2 with only 1 card left: draw 1, fail to draw 1, take 2 damage.
- Draw 3 with empty deck: fail to draw 3, take 6 damage.

This damage targets the player and can trigger normal death-prevention effects.
