# Open Questions and Deferred Scope

This document lists items that are not blocking the initial rules capture, but should be clarified before implementation.

## Open Questions

### Exact Active Later Card Handling

Active Later cards remain on board for reference and are readable by both players.

Open implementation choice:

- Are active Later cards still considered in a normal zone called `activeLaterBoard`?
- Or are they visual references tied to engine-tracked persistent effects?

Current recommendation: model them as `activeLaterBoard` card instances plus separate active effect records.

### Death Timing Details

Known:

- Some death effects happen before overflow damage.
- Some death effects happen after overflow damage.
- Brace/survival effects exist before death is finalized.

Still needs refinement after card examples:

- Whether attached accessories with death triggers resolve before they enter graveyard.
- Whether a death effect can still resolve if the source card is already moved to graveyard.
- Exact order if multiple death effects trigger at once.

### Trigger Ordering

The game has automatic triggers, manual reactions, and rare interrupt effects.

Still needs refinement after card examples:

- If both players have triggers from the same event, whose resolves first?
- Are manual reactions offered in any specific order?
- Can multiple manual reactions chain?
- Can a reaction respond to another reaction?

Current assumption: avoid a full complex priority stack unless real cards require it.

### Own Graveyard Visibility Outside Own Turn

Known:

- Player can view own graveyard during own turn.
- Opponent graveyard is hidden unless an effect allows search/view.

Open:

- Can a player inspect their own graveyard during opponent's turn?

This likely does not matter unless reactions require it.

### Self-Attacking

Normal attacks cannot target own monsters by default.

Friendly-targeting, self-damage, and self-sacrifice effects exist only through explicit card text.

This should remain the rule unless future design intentionally changes it.

### Offensive Ability Roll Edge Cases

Normal attacks and offensive active abilities use the standard d6 roll.

Open implementation details:

- If an offensive ability does not directly deal damage, such as Baseballz's `Pitch`, does a roll of `6` only count as success with no extra damage?
- If an offensive ability has multiple offensive effects and one damage effect, does a `1` miss cancel all offensive effects or only the damage?
- If a Later card explicitly calls for a roll, does it use the standard offensive d6 result table or a card-specific result table?

Current assumption: a `1` cancels the offensive action's offensive effects. A `6` adds 2 damage only to damage dealt by that action, and otherwise resolves as a normal success. Later-card rolls use card-specific text unless they explicitly say to use the standard offensive roll.

## Deferred Scope

### Deck Building

Deferred until:

- Core engine works.
- At least 2 premade decks exist.
- Game can validate normal play flow.

Future known rule:

- 60-card decks.
- Max 4 copies per card.

### Full Card Scripting

Deferred until actual card examples are entered.

The engine should eventually support structured effects, not just text strings.

### Full UI/UX Rules

Deferred.

Needed later:

- Board layout.
- Hand display.
- Hidden-zone search UI.
- Opponent graveyard search UI.
- Active Later card reference area.
- Trigger/reaction prompts.
- End-turn unused-star warning.
- Discard-to-cover-stars flow.
- Hand-limit cleanup flow.

### Balance

Not part of this document.

The purpose here is rule capture and digital model planning, not redesigning the game.
