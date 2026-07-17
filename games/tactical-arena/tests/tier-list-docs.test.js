import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { UNIT_TYPES } from "../src/core/unitCatalog.js";

const rootFile = (path) => new URL(`../${path}`, import.meta.url);

const draftableUnitNames = Object.values(UNIT_TYPES)
  .filter((definition) => !definition.summon)
  .map((definition) => definition.name)
  .sort();

function sortedCounts(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
}

test("unit tier list ranks every draftable unit exactly once", () => {
  const tierList = readFileSync(rootFile("UNIT_TIER_LIST.md"), "utf8");
  const ranked = [...tierList.matchAll(/^- \*\*([^*]+)\*\*/gm)]
    .map((match) => match[1])
    .sort();

  assert.deepEqual(ranked, draftableUnitNames);
  assert.deepEqual(
    sortedCounts(ranked).filter(([, count]) => count !== 1),
    [],
    "tier list should not duplicate a draftable unit"
  );
  assert.doesNotMatch(
    tierList.match(/^- \*\*.*$/gmu)?.join("\n") ?? "",
    /\bGhoul\b/,
    "Ghoul is summon-only and should not appear as a ranked bullet"
  );
});

test("tier-list reasoning includes placement notes for every ranked unit", () => {
  const reasoning = readFileSync(rootFile("UNIT_TIER_LIST_REASONING.md"), "utf8");
  const headings = [...reasoning.matchAll(/^### ([^-]+?) -/gm)]
    .map((match) => match[1].trim())
    .sort();

  assert.deepEqual(headings, draftableUnitNames);
});
