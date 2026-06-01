#!/usr/bin/env node
import {
  CARD_FILE_PATHS,
  DECK_FILE_PATHS,
  readCardFiles,
  readDeckFiles,
  validateCardCatalog,
  validateDeckCatalog,
} from "./card-schema.mjs";

const paths = process.argv.slice(2);
const files = readCardFiles(paths.length > 0 ? paths : CARD_FILE_PATHS);
const cardResult = validateCardCatalog(files);
const deckResult = validateDeckCatalog(readDeckFiles(DECK_FILE_PATHS), cardResult.cards);
const errors = [...cardResult.errors, ...deckResult.errors];

if (errors.length > 0) {
  console.error(`Validation failed with ${errors.length} error(s):`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  const deckSummary =
    deckResult.decks.length === 0
      ? "no deck files"
      : `${deckResult.decks.length} deck(s): ${deckResult.decks
          .map((deck) => `${deck.name} (${deck.totalCards} card(s), ${deck.status})`)
          .join(", ")}`;
  console.log(`Validation passed for ${cardResult.cards.length} card(s) and ${deckSummary}.`);
}
