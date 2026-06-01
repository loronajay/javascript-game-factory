import fs from "node:fs";
import path from "node:path";

export const CARD_ROOT = "cards";
export const CARD_FILE_PATHS = discoverCardFilePaths(CARD_ROOT);

export const DECK_FILE_PATHS = ["decks/meat-deck.json", "decks/useless-deck.json"];

const CARD_TYPES = new Set(["monster", "accessory", "later"]);
const DECK_STATUSES = new Set(["draft", "ready"]);
const SLOT_KINDS = new Set(["activeAbility", "passive"]);
const IMPLEMENTATION_STATUSES = new Set(["textOnly", "partiallyScripted", "scripted"]);
const LATER_LIFECYCLES = new Set([
  "instantToGraveyard",
  "activeOnBoard",
  "untilEndOfTurn",
  "forDuration",
  "whileConditionTrue",
]);

export function readCardFiles(paths = CARD_FILE_PATHS) {
  return Object.fromEntries(
    paths.map((path) => [path, JSON.parse(fs.readFileSync(path, "utf8"))]),
  );
}

export function discoverCardFilePaths(root = CARD_ROOT) {
  if (!fs.existsSync(root)) return [];

  const files = [];
  visit(root);
  return files.sort((a, b) => a.localeCompare(b));

  function visit(directory) {
    fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
        return;
      }

      if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".json") {
        files.push(entryPath);
      }
    });
  }
}

export function readDeckFiles(paths = DECK_FILE_PATHS) {
  return Object.fromEntries(
    paths
      .filter((path) => fs.existsSync(path))
      .map((path) => [path, JSON.parse(fs.readFileSync(path, "utf8"))]),
  );
}

export function validateCardCatalog(filesByName) {
  const errors = [];
  const cards = [];
  const seenIds = new Map();

  for (const [fileName, value] of Object.entries(filesByName)) {
    const fileCards = Array.isArray(value) ? value : isObject(value) ? [value] : null;
    if (!fileCards) {
      errors.push(`${fileName}: card file must contain a card object`);
      continue;
    }

    fileCards.forEach((card, index) => {
      const label = labelCard(fileName, Array.isArray(value) ? index : null, card);
      validateCard(card, label, errors);

      if (typeof card?.id === "string" && card.id.trim() !== "") {
        if (seenIds.has(card.id)) {
          errors.push(`${label}: Duplicate card id "${card.id}" also used in ${seenIds.get(card.id)}`);
        } else {
          seenIds.set(card.id, label);
        }
      }

      cards.push(card);
    });
  }

  return { ok: errors.length === 0, errors, cards };
}

export function validateDeckCatalog(filesByName, cards) {
  const errors = [];
  const decks = [];
  const cardIds = new Set(cards.map((card) => card.id));
  const seenDeckIds = new Map();

  for (const [fileName, deck] of Object.entries(filesByName)) {
    const label = labelDeck(fileName, deck);
    validateDeck(deck, label, cardIds, errors);

    if (typeof deck?.id === "string" && deck.id.trim() !== "") {
      if (seenDeckIds.has(deck.id)) {
        errors.push(`${label}: Duplicate deck id "${deck.id}" also used in ${seenDeckIds.get(deck.id)}`);
      } else {
        seenDeckIds.set(deck.id, label);
      }
    }

    const totalCards = Array.isArray(deck?.entries)
      ? deck.entries.reduce((sum, entry) => sum + (Number.isInteger(entry?.count) ? entry.count : 0), 0)
      : 0;
    decks.push({ ...deck, totalCards });
  }

  return { ok: errors.length === 0, errors, decks };
}

function validateCard(card, label, errors) {
  if (!isObject(card)) {
    errors.push(`${label}: card must be an object`);
    return;
  }

  requireString(card, "id", label, errors);
  requireString(card, "type", label, errors);
  requireString(card, "name", label, errors);
  requireString(card, "art", label, errors);
  requireString(card, "rulesText", label, errors);

  if (card.referenceArt !== undefined && !isNonEmptyString(card.referenceArt)) {
    errors.push(`${label}: referenceArt must be a non-empty string when present`);
  }

  if (card.artPosition !== undefined) {
    validateArtPosition(card.artPosition, label, errors);
  }

  if (card.artZoom !== undefined) {
    validateArtZoom(card.artZoom, label, errors);
  }

  if (typeof card.type === "string" && !CARD_TYPES.has(card.type)) {
    errors.push(`${label}: type must be monster, accessory, or later`);
  }

  requireString(card, "deckId", label, errors);

  if (
    card.implementationStatus !== undefined &&
    (!isNonEmptyString(card.implementationStatus) ||
      !IMPLEMENTATION_STATUSES.has(card.implementationStatus))
  ) {
    errors.push(
      `${label}: implementationStatus must be textOnly, partiallyScripted, or scripted`,
    );
  }

  if (card.effects !== undefined && !Array.isArray(card.effects)) {
    errors.push(`${label}: effects must be an array when present`);
  }

  if (card.type === "monster") validateMonster(card, label, errors);
  if (card.type === "accessory") validateAccessory(card, label, errors);
  if (card.type === "later") validateLater(card, label, errors);
}

function validateMonster(card, label, errors) {
  requireNumber(card, "summonCostStars", label, errors);
  requireNumber(card, "printedHp", label, errors);
  requireNumber(card, "printedStrength", label, errors);

  if (!Array.isArray(card.effectSlots)) {
    errors.push(`${label}: effectSlots is required and must be an array`);
    return;
  }

  if (card.effectSlots.length > 4) {
    errors.push(`${label}: effectSlots must contain at most 4 slots`);
  }

  card.effectSlots.forEach((slot, index) => {
    const slotLabel = `${label}: effectSlots[${index}]`;
    if (!isObject(slot)) {
      errors.push(`${slotLabel} must be an object`);
      return;
    }

    requireString(slot, "id", slotLabel, errors);
    requireString(slot, "kind", slotLabel, errors);
    requireString(slot, "name", slotLabel, errors);
    requireString(slot, "rulesText", slotLabel, errors);

    if (typeof slot.kind === "string" && !SLOT_KINDS.has(slot.kind)) {
      errors.push(`${slotLabel}.kind must be activeAbility or passive`);
    }

    if (slot.kind === "activeAbility") {
      requireNumber(slot, "costStars", slotLabel, errors);
    }

    if (slot.effects !== undefined && !Array.isArray(slot.effects)) {
      errors.push(`${slotLabel}.effects must be an array when present`);
    }
  });
}

function validateAccessory(card, label, errors) {
  if (card.baseEquipCostStars !== undefined) {
    requireNumber(card, "baseEquipCostStars", label, errors);
  }
}

function validateLater(card, label, errors) {
  requireNumber(card, "playCostStars", label, errors);

  if (card.lifecycle !== undefined) {
    if (!isNonEmptyString(card.lifecycle) || !LATER_LIFECYCLES.has(card.lifecycle)) {
      errors.push(
        `${label}: lifecycle must be instantToGraveyard, activeOnBoard, untilEndOfTurn, forDuration, or whileConditionTrue`,
      );
    }
  }
}

function validateArtPosition(artPosition, label, errors) {
  if (!isObject(artPosition)) {
    errors.push(`${label}: artPosition must be an object when present`);
    return;
  }

  validateArtPositionAxis(artPosition, "x", label, errors);
  validateArtPositionAxis(artPosition, "y", label, errors);
}

function validateArtPositionAxis(artPosition, key, label, errors) {
  if (artPosition[key] === undefined) return;
  if (!Number.isFinite(artPosition[key]) || artPosition[key] < 0 || artPosition[key] > 100) {
    errors.push(`${label}: artPosition.${key} must be a number from 0 to 100`);
  }
}

function validateArtZoom(artZoom, label, errors) {
  if (!Number.isFinite(artZoom) || artZoom < 100 || artZoom > 250) {
    errors.push(`${label}: artZoom must be a number from 100 to 250`);
  }
}

function validateDeck(deck, label, cardIds, errors) {
  if (!isObject(deck)) {
    errors.push(`${label}: deck must be an object`);
    return;
  }

  requireString(deck, "id", label, errors);
  requireString(deck, "name", label, errors);
  requireString(deck, "status", label, errors);

  if (typeof deck.status === "string" && !DECK_STATUSES.has(deck.status)) {
    errors.push(`${label}: status must be draft or ready`);
  }

  if (!Array.isArray(deck.entries)) {
    errors.push(`${label}: entries is required and must be an array`);
    return;
  }

  const seenEntryIds = new Map();
  let totalCards = 0;

  deck.entries.forEach((entry, index) => {
    const entryLabel = `${label}: entries[${index}]`;
    if (!isObject(entry)) {
      errors.push(`${entryLabel} must be an object`);
      return;
    }

    requireString(entry, "cardId", entryLabel, errors);

    if (!Number.isInteger(entry.count) || entry.count < 1) {
      errors.push(`${entryLabel}: count is required and must be a positive integer`);
    } else {
      totalCards += entry.count;
    }

    if (isNonEmptyString(entry.cardId)) {
      if (!cardIds.has(entry.cardId)) {
        errors.push(`${entryLabel}: Unknown card id "${entry.cardId}"`);
      }

      if (seenEntryIds.has(entry.cardId)) {
        errors.push(`${entryLabel}: Duplicate deck entry for card id "${entry.cardId}" also used in ${seenEntryIds.get(entry.cardId)}`);
      } else {
        seenEntryIds.set(entry.cardId, entryLabel);
      }
    }
  });

  if (deck.status === "ready" && totalCards !== 60) {
    errors.push(`${label}: ready decks must contain exactly 60 cards; found ${totalCards}`);
  }
}

function requireString(object, key, label, errors) {
  if (!isNonEmptyString(object[key])) {
    errors.push(`${label}: ${key} is required and must be a non-empty string`);
  }
}

function requireNumber(object, key, label, errors) {
  if (!Number.isFinite(object[key])) {
    errors.push(`${label}: ${key} is required and must be a number`);
  }
}

function labelCard(fileName, index, card) {
  const id = isNonEmptyString(card?.id) ? ` "${card.id}"` : "";
  const indexLabel = Number.isInteger(index) ? `[${index}]` : "";
  return `${fileName}${indexLabel}${id}`;
}

function labelDeck(fileName, deck) {
  const id = isNonEmptyString(deck?.id) ? ` "${deck.id}"` : "";
  return `${fileName}${id}`;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}
