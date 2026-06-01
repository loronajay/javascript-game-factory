# Card Digitization and Engine Plan

This plan describes how paper cards become digital data, how that data becomes testable engine behavior, and what should stay deferred until the real card pool proves it is needed.

The goal is not to make perfect card scripting on day one. The goal is to create a reliable path from paper cards to validated digital cards, then let the engine grow from tested examples.

## Guiding Principles

- The paper cards are the source of truth until their digital versions are reviewed.
- The JSON card files are the canonical digital source of truth once reviewed.
- Reference photos help transcription, but OCR or automated guessing should not be trusted as final card text.
- Every card can enter the catalog as `textOnly`.
- Only cards with tested structured effects should move to `partiallyScripted` or `scripted`.
- The validator should reject broken card data before the game or engine loads it.
- The engine should be built from real card examples, not from speculative support for every possible future effect.
- Keep this cabinet no-dependency unless a dependency is explicitly approved.

## Current Starting Point

Existing assets:

- `blank-cards/blank-monster.png`
- `blank-cards/blank-accessory.png`
- `blank-cards/blank-later.png`
- `reference-cards/monsters/lunch-lady.jpg`
- `reference-cards/accessories/lawn-chair-accessory.jpg`
- `reference-cards/later/big-smac-later.jpg`
- `card-art/meat-deck/monsters/lunch-lady.jfif`
- `card-art/meat-deck/accessories/lawn-chair.jfif`
- `card-art/meat-deck/later/big-smac.jfif`

Initial card data:

- `cards/monsters.json`
- `cards/accessories.json`
- `cards/later.json`
- `decks/meat-deck.json`

Initial tools:

- `tools/cards/card-schema.mjs`
- `tools/cards/validate-cards.mjs`
- `tools/cards/serve-card-workbench.mjs`
- `dev/card-browser.html`

## Canonical Card Data Shape

Use JSON for now because it can be loaded directly by browser code and Node tools with no external dependency.

All card types share:

```json
{
  "id": "big_smac",
  "type": "later",
  "name": "Big Smac",
  "art": "card-art/meat-deck/later/big-smac.jfif",
  "referenceArt": "reference-cards/later/big-smac-later.jpg",
  "rulesText": "Player gains 2 HP.",
  "implementationStatus": "partiallyScripted",
  "effects": []
}
```

`art` is the finished digital card art used by previews and final card rendering. `referenceArt` is the camera photo of the paper card used for transcription and rules review.

`implementationStatus` means:

- `textOnly`: transcribed and viewable, but not engine-scripted.
- `partiallyScripted`: at least one structured effect exists, but the card still needs review or more coverage.
- `scripted`: structured effects are expected to be executable and covered by tests.

Monster cards require:

- `summonCostStars`
- `printedHp`
- `printedStrength`
- `effectSlots`

Accessory cards require:

- `baseEquipCostStars`, unless the default of 1 is intentionally assumed by the engine.
- `effects`

Later cards require:

- `playCostStars`
- `lifecycle`
- `effects`

## Transcription Workflow

Use small batches of 5 to 10 cards.

For each card:

1. Put a clear photo in `reference-cards/`.
2. Put finished digital art in `card-art/<deck-name>/`.
3. Create or duplicate a card in the workbench.
4. Enter core fields:
   - `id`
   - `type`
   - `name`
   - `art`
   - `referenceArt`
   - cost fields
   - HP and strength for monsters
   - rules text
   - monster ability/passive slots
5. Set `implementationStatus` to `textOnly`.
6. Run the validator.
7. Visually compare the workbench reference photo against the paper card.
8. Visually check that the card preview uses the digital art.
9. Review wording before moving on to the next batch.

Preferred id style:

```text
lunch_lady
big_smac
lawn_chair
```

Use stable ids. Do not rename ids casually after decks or saves begin referencing them.

Deck art folders should be named by premade deck. The first deck is:

```text
card-art/meat-deck/
  monsters/
  accessories/
  later/
```

The opposing test deck should get its own sibling folder once it exists.

## Deck Data Shape

Deck manifests live under `decks/`. The first deck is:

```text
decks/meat-deck.json
```

Use counted entries so draft decks are easy to edit:

```json
{
  "id": "meat_deck",
  "name": "Meat Deck",
  "status": "draft",
  "artFolder": "card-art/meat-deck",
  "entries": [
    {
      "cardId": "lunch_lady",
      "count": 1
    }
  ]
}
```

Deck status means:

- `draft`: can contain fewer than 60 cards while transcription and balance work are in progress.
- `ready`: must contain exactly 60 cards and only known card ids.

Deck validation should reject unknown card ids and duplicate card entries. The deck list is not a place to define cards; it only references canonical card ids from `cards/`.

## Wording Normalization

After the first transcription pass, do a wording pass before heavy engine scripting.

Normalize terms such as:

- `heal`, `restore`, and `gain HP`
- `maximum HP`, `max HP`, and `HP boost`
- `strength`, `damage`, and `attack damage`
- `destroy`, `kill`, `dies`, and `goes to the graveyard`
- `play`, `summon`, `equip`, and `attach`
- `owner`, `controller`, `self`, and `opponent`

Keep the original intent of the paper cards, but prefer one digital vocabulary where the rules allow it.

Current wording decisions from reference cards:

- `Attack` is a specific action command. If a card blocks more than attacking, write that broader restriction explicitly.
- `Offensive actions` means actions or effects from that monster that affect the opponent, opponent monsters, opponent cards, opponent resources, opponent stats, opponent board, or opponent available actions.
- If a card blocks all offensive actions from one monster, the engine should still represent `attack` as its own command plus a broader restriction on offensive actions.
- Normal attacks and offensive active abilities use the standard d6 roll: `1` misses, `2-5` resolves normally, and `6` adds 2 damage when the action deals damage.
- Later cards do not use the standard roll by default, but individual Later cards can require a roll if their card text explicitly says so.
- Max HP gains increase current HP by the same amount. This is a `maxHpChange`, not a normal restorative action, so effects that block healing do not automatically block max HP gains.
- Accessory-granted abilities follow normal ability rules unless the card says otherwise, including once-per-turn use.
- Text like `this unit` on an accessory means the equipped monster unless a card explicitly says otherwise.

Reference card clarifications:

- Elderly Turtle has two effects in the current photo: `Retreat`, which is a self-heal active ability, and `Insurance`, which heals the player by 2 HP when Elderly Turtle dies. There is no additional passive below those; the visible marks are artwork.
- Polar Shift uses max values. It changes the equipped monster's strength value based on its max HP value, so boosted max HP can increase the resulting strength.
- Diamond Ring should be worded as a temporary block on all offensive actions from the chosen monster, not just attacking.
- Baseballz's `Pitch` cannot be used if the enemy player already has 4 monsters in play, because there is no available monster slot for the forced summon.

## Structured Effects Strategy

Do not attempt to fully script every card during transcription.

Use `rulesText` for display text and `effects` for engine behavior.

Example simple scripted Later card:

```json
{
  "id": "big_smac",
  "type": "later",
  "name": "Big Smac",
  "rulesText": "Player gains 2 HP.",
  "implementationStatus": "partiallyScripted",
  "playCostStars": 0,
  "lifecycle": "instantToGraveyard",
  "effects": [
    {
      "family": "heal",
      "timing": "onPlay",
      "target": "selfPlayer",
      "amount": 2,
      "duration": "instant"
    }
  ]
}
```

Effect families should stay aligned with `06_effect_system_requirements.md` and `07_digital_data_model_first_pass.md`.

When a card needs an effect the engine does not support yet:

- Keep the card `textOnly` or `partiallyScripted`.
- Add the missing behavior to an engine backlog section.
- Write a failing engine test from that exact card.
- Implement the smallest general effect behavior that passes the test.

## Validation Plan

The validator should grow in layers.

Current validation:

- Card files must be JSON arrays.
- Ids must be unique across all card files.
- Common required fields must be present.
- Type-specific required fields must be present.
- Monster slots are limited to 4.
- Monster slot kinds must be `activeAbility` or `passive`.
- Implementation status must be known.

Near-term validation:

- Validate numeric fields are non-negative integers.
- Validate star costs are within known game limits where appropriate.
- Validate referenced art files exist.
- Validate monster active abilities have `costStars`.
- Validate `scripted` cards have at least one structured effect when the card text implies behavior.
- Validate effect family, timing, target, and duration against known enums.

Later validation:

- Validate deck files are 60 cards.
- Validate no more than 4 copies per card if deck building is enabled.
- Validate premade decks only reference known card ids.
- Validate scripted cards only use engine-supported effect families.

## Workbench Plan

The workbench should remain a convenience tool, not the source of truth.

Current role:

- Load all card JSON.
- Show the reference photo.
- Show a rough rendered card preview.
- Edit common card fields.
- Export draft JSON for review.

Near-term improvements:

- Save each card type back into its matching JSON file through a local tool or explicit copy workflow.
- Add a filter by type and implementation status.
- Add missing-art and validation indicators in the picker.
- Add fields for structured effects once the first engine tests define the shape.
- Improve preview layout so text and art better match the blank templates.

Deferred improvements:

- OCR assistance.
- Automatic cropping of reference photos.
- Batch import from phone photos.
- Finished printable card image export.

## Engine Build Order

Build the engine only after enough cards are transcribed to show real needs.

Recommended order:

1. Card catalog loading and validation.
2. Deterministic deck setup with two premade 60-card decks.
3. Player state:
   - HP and max HP.
   - Deck.
   - Hand.
   - Board.
   - Graveyard.
4. Start-of-game draw and first-turn draw rules.
5. Turn state and 5-star economy.
6. Summoning monsters.
7. Normal monster attacks with standard d6 roll handling.
8. Persistent monster damage and overflow damage.
9. Graveyard movement on death.
10. Accessory attachment and default accessory slot limit.
11. Simple Later cards.
12. Simple passive restrictions.
13. Trigger windows only as cards require them.
14. Interrupt/reaction behavior only after real cards force the design.

Every engine behavior should begin with a test based on an actual card or core rule.

## Test Strategy

Use Node tests for pure rules and validation.

Test first for:

- Card schema validation.
- Catalog loading.
- Deck setup.
- Draw rules.
- Star spending.
- End-turn unused-star penalty.
- Summoning.
- Normal attacks.
- Damage persistence.
- Overflow damage.
- Death and graveyard movement.
- Simple `heal`, `damage`, and `maxHpChange` effects.

Do not test canvas drawing or visual card rendering in unit tests unless rendering becomes data-critical.

Browser checks are useful for the workbench, but engine correctness should live in pure tests.

## Milestones

### Milestone 1: Transcription Ready

Done when:

- Card JSON files exist.
- Validator passes.
- Workbench opens locally.
- At least the three reference cards are represented.

### Milestone 2: First Real Batch

Done when:

- 10 to 20 cards are transcribed.
- `decks/meat-deck.json` references the cards chosen for the first deck draft.
- The wording pass has started.
- Validator checks referenced art files.
- Cards are grouped cleanly by type.

### Milestone 3: Engine Skeleton

Done when:

- Catalog loading is tested.
- Core player and turn state are tested.
- A premade deck can be initialized from card ids.
- Draw and hand-limit rules are tested.

### Milestone 4: Playable Core Loop

Done when:

- Monsters can be summoned.
- Monsters can attack.
- Stars are spent and end-turn penalties apply.
- Damage, death, overflow, and graveyard movement are tested.

### Milestone 5: First Scripted Cards

Done when:

- At least one Later card executes from structured effects.
- At least one accessory modifies a monster.
- At least one monster passive changes legal actions or resolution.
- `implementationStatus` is meaningful in tests.

### Milestone 6: Two Premade Decks

Done when:

- Two 60-card premade decks validate.
- A full local match can be played through the engine using those decks.
- Unsupported card effects are clearly listed.

## Deferred Scope

Do not build these until the core loop and first scripted cards are working:

- Deck building.
- Online multiplayer.
- Full priority stack.
- Complex interrupt chains.
- Automatic OCR as source of truth.
- Printable production-quality card exports.
- Balance changes.
- Full visual game UI.

## Immediate Next Steps

1. Finish the seed pipeline documentation.
2. Add art-file existence checks to the validator.
3. Transcribe the next 5 to 10 paper cards.
4. Normalize wording across those cards.
5. Choose the first 3 simple cards to drive engine tests.
6. Start the engine with catalog loading and core state tests.
