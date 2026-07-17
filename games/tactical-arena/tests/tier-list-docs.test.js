import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { UNIT_TYPES } from "../src/core/unitCatalog.js";

const rootFile = (path) => new URL(`../${path}`, import.meta.url);

const draftableUnitNames = Object.values(UNIT_TYPES)
  .filter((definition) => !definition.summon)
  .map((definition) => definition.name)
  .sort();

function allPassiveSources(definition) {
  return [definition.passive, ...(definition.arts ?? []), definition.ragePassive, definition.rageArt].filter(Boolean);
}

function archetypeSectionFor(archetypes, unitName) {
  const heading = `### ${unitName} `;
  const start = archetypes.indexOf(heading);
  if (start === -1) return null;
  const next = archetypes.indexOf("\n### ", start + heading.length);
  return next === -1 ? archetypes.slice(start) : archetypes.slice(start, next);
}

function sortedCounts(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function reasoningSectionFor(reasoning, unitName) {
  const heading = `### ${unitName} -`;
  const start = reasoning.indexOf(heading);
  if (start === -1) return null;
  const next = reasoning.indexOf("\n### ", start + heading.length);
  return next === -1 ? reasoning.slice(start) : reasoning.slice(start, next);
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

test("tier-list reasoning names every draftable unit kit piece", () => {
  const reasoning = readFileSync(rootFile("UNIT_TIER_LIST_REASONING.md"), "utf8");

  for (const definition of Object.values(UNIT_TYPES).filter((unit) => !unit.summon)) {
    const section = reasoningSectionFor(reasoning, definition.name);
    assert.ok(section, `missing tier-list reasoning section for ${definition.name}`);

    const kitNames = [
      definition.passive?.name,
      ...(definition.arts ?? []).map((art) => art.name),
      definition.ragePassive?.name,
      definition.rageArt?.name,
    ].filter(Boolean);

    for (const name of kitNames) {
      assert.ok(
        section.includes(name),
        `${definition.name} reasoning should mention ${name}`
      );
    }
  }
});

test("unit archetypes mention custom basic attack damage types", () => {
  const archetypes = readFileSync(rootFile("UNIT_ARCHETYPES.md"), "utf8");

  for (const definition of Object.values(UNIT_TYPES).filter((unit) => !unit.summon)) {
    const customBasicDamageTypes = new Set(
      allPassiveSources(definition)
        .map((source) => source.effect?.attackDamageType)
        .filter(Boolean)
    );
    for (const damageType of customBasicDamageTypes) {
      const section = archetypeSectionFor(archetypes, definition.name);
      assert.ok(section, `missing archetype section for ${definition.name}`);
      assert.match(
        section,
        new RegExp(`basic attacks?.{0,80}${damageType}|${damageType}.{0,80}basic attacks?`, "is"),
        `${definition.name} archetype should mention basic attacks deal ${damageType} damage`
      );
    }
  }
});
