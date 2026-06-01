# Card Data Workflow

Cards are stored as no-dependency JSON so the game can load them directly.

- `<deck-name>/monsters/<card-id>.json` contains one Monster card.
- `<deck-name>/accessories/<card-id>.json` contains one Accessory card.
- `<deck-name>/later/<card-id>.json` contains one Later card.

Use `art` for finished digital art under `card-art/<deck-name>/`. Use `referenceArt` for camera photos under `reference-cards/<deck-name>/`.

Every card has a `deckId` because decks are prebuilt right now. Accessories and Later cards may become interchangeable later, but keep them deck-owned until there is a deck-building engine.

Deck manifests live under `decks/`. Draft decks can contain fewer than 60 cards while they are being built. Change a deck to `status: "ready"` only when it should validate as exactly 60 cards.

Run validation after each small batch:

```powershell
node .\tools\cards\validate-cards.mjs
```

Open the transcription workbench:

```powershell
node .\tools\cards\serve-card-workbench.mjs
```

Then visit:

```text
http://127.0.0.1:4173/dev/card-browser.html
```

Use `implementationStatus: "textOnly"` for cards that are transcribed but not engine-scripted yet. Move to `"partiallyScripted"` or `"scripted"` only when the `effects` data is ready for engine tests.
