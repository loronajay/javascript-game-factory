import test from "node:test";
import assert from "node:assert/strict";

import {
  UNIT_TYPES,
  AI_INTENTS,
  AI_ROLES,
  normalizeUnitAi,
  normalizeArtAi
} from "../src/core/unitCatalog.js";

// Decision 4 (option C): the normalizers above keep the planner crash-proof, but
// these tests are the teeth — a forgotten `ai` block fails the suite instead of
// silently degrading a new unit the CPU then can't play well. See
// CPU_AI_METADATA_SCHEMA.md.

const ENTRIES = Object.entries(UNIT_TYPES);

// Active arts only: passives (immunities, auras, mp-regen, rage stat blocks) are
// not activatable, so they carry no AI intent.
function activeArts(definition) {
  return [...definition.arts, definition.rageArt, definition.ragePassive]
    .filter(Boolean)
    .filter((art) => art.kind === "active");
}

test("every drafted unit declares an explicit ai block", () => {
  for (const [type, definition] of ENTRIES) {
    assert.ok(definition.ai, `${type} is missing its unit-level ai block`);
    assert.ok(
      Number.isFinite(definition.ai.threatValue),
      `${type}.ai.threatValue must be a number`
    );
    assert.ok(
      AI_ROLES.includes(definition.ai.role),
      `${type}.ai.role "${definition.ai.role}" is not a known role`
    );
    assert.equal(
      typeof definition.ai.protect,
      "boolean",
      `${type}.ai.protect must be an explicit boolean`
    );
  }
});

test("every active art declares an explicit, valid ai.intent", () => {
  for (const [type, definition] of ENTRIES) {
    for (const art of activeArts(definition)) {
      assert.ok(art.ai, `${type}.${art.id} (active) is missing its ai block`);
      assert.ok(
        AI_INTENTS.includes(art.ai.intent),
        `${type}.${art.id} has unknown ai.intent "${art.ai?.intent}"`
      );
    }
  }
});

test("placeObject arts declare zoneValue + placeNear (the only authored EV hints)", () => {
  for (const [type, definition] of ENTRIES) {
    for (const art of activeArts(definition)) {
      if (art.ai.intent !== "placeObject") continue;
      assert.ok(
        Number.isFinite(art.ai.evHints?.zoneValue),
        `${type}.${art.id} placeObject needs evHints.zoneValue`
      );
      assert.ok(
        art.ai.evHints?.placeNear,
        `${type}.${art.id} placeObject needs evHints.placeNear`
      );
    }
  }
});

test("normalizeUnitAi falls back safely for an unannotated unit", () => {
  const fallback = normalizeUnitAi({});
  assert.equal(fallback.threatValue, 10);
  assert.equal(fallback.role, "skirmisher");
  assert.equal(fallback.protect, false);

  // protect defaults true for support/caster when omitted.
  assert.equal(normalizeUnitAi({ ai: { role: "support" } }).protect, true);
  assert.equal(normalizeUnitAi({ ai: { role: "caster" } }).protect, true);
});

test("normalizeUnitAi reads an explicit block by type name", () => {
  const mystic = normalizeUnitAi("mystic");
  assert.equal(mystic.role, "support");
  assert.equal(mystic.threatValue, 14);
  assert.equal(mystic.protect, true);
});

test("normalizeArtAi degrades a missing block to a plain strike", () => {
  const fallback = normalizeArtAi({});
  assert.equal(fallback.intent, "strike");
  assert.deepEqual(fallback.tags, []);
  assert.deepEqual(fallback.evHints, {});
  assert.equal(fallback.priority, 1);
});
