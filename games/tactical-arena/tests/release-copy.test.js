import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { UNIT_TYPES } from "../src/core/unitCatalog.js";

const metadata = JSON.parse(readFileSync(new URL("../game.json", import.meta.url), "utf8"));
const draftableUnitCount = Object.values(UNIT_TYPES).filter((unit) => !unit.summon).length;

test("arcade metadata reflects the current release feature set", () => {
  assert.equal(metadata.players, "1-4");
  assert.match(metadata.tagline, /30 units/i);
  assert.match(metadata.description, /campaign/i);
  assert.match(metadata.description, /online/i);
  assert.match(metadata.description, /2v2/i);
  assert.match(metadata.status, /Online/i);
  assert.match(metadata.status, /Tempo/i);
  assert.equal(draftableUnitCount, 30);
});
