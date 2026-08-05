// Guards that keep the balance docs honest against the engine.
//
// The failure these prevent is the one that motivated the rewrite: a unit gets buffed, the
// unit file changes, and the prose documentation quietly keeps describing the old kit. That
// happened to the Miner (turn-start ore), the Fat Cleric (permanent Defend in RAGE), the
// Archer and Fat Bowman (rage reworks), and the Witch Doctor (Hex Strike was never written
// down at all) — all of them shipped while the docs said otherwise.
//
// These are mechanical checks, so a newly added ART shows up as a test failure rather than
// as a documentation gap nobody notices for three months.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { UNIT_TYPES } from "../src/core/unitRegistry.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ARCHETYPES = readFileSync(join(ROOT, "UNIT_ARCHETYPES.md"), "utf8");

const draftable = Object.entries(UNIT_TYPES).filter(([, def]) => !def.summon);

test("every draftable unit has a section in UNIT_ARCHETYPES.md", () => {
  const missing = draftable
    .filter(([, def]) => !new RegExp(`^### ${def.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*—`, "m").test(ARCHETYPES))
    .map(([, def]) => def.name);
  assert.deepEqual(missing, [], `units with no archetype section: ${missing.join(", ")}`);
});

test("archetype stat blocks match the engine", () => {
  // Stat blocks look like: `HP 25 · MP 20 · STR 10 · DEF 5 · MOVE 3 · RNG 1`
  const blockRe = /^### ([^—\n]+?)\s*—[^\n]*\n\n`([^`]*(?:HP|STR)[^`]*)`/gm;
  const byName = Object.fromEntries(draftable.map(([, def]) => [def.name.toLowerCase(), def]));

  const problems = [];
  let match;
  while ((match = blockRe.exec(ARCHETYPES))) {
    const def = byName[match[1].trim().toLowerCase()];
    if (!def) continue; // the summon-only Ghoul section
    const block = match[2];

    const expected = {
      HP: def.stats.maxHp,
      STR: def.stats.strength,
      DEF: def.stats.defense,
      MOVE: def.stats.moveRange,
      RNG: def.stats.attackRange
    };
    for (const [key, want] of Object.entries(expected)) {
      const found = new RegExp(`\\b${key}\\s+(\\d+)`).exec(block);
      // A stat may be deliberately omitted when it is meaningless for that unit (the
      // King's STR/RNG of 0). Only a stated-and-wrong number is a failure.
      if (found && Number(found[1]) !== want) {
        problems.push(`${def.name} ${key}: doc says ${found[1]}, engine says ${want}`);
      }
    }
    const resource = /\b(?:MP|Ore|ORE)\s+(\d+)/.exec(block);
    if (resource && Number(resource[1]) !== def.stats.maxMp) {
      problems.push(`${def.name} resource: doc says ${resource[1]}, engine says ${def.stats.maxMp}`);
    }
  }
  assert.deepEqual(problems, [], `stale stat blocks:\n  ${problems.join("\n  ")}`);
});

test("every passive, ART, and rage ability is named in UNIT_ARCHETYPES.md", () => {
  // Collapse whitespace so a name broken across a line wrap still counts as documented.
  const prose = ARCHETYPES.toLowerCase().replace(/\s+/g, " ");

  const undocumented = [];
  for (const [, def] of draftable) {
    const pieces = [
      def.passive,
      def.ragePassive,
      ...(def.arts ?? []),
      def.rageArt
    ].filter((piece) => piece?.name);

    for (const piece of pieces) {
      if (!prose.includes(piece.name.toLowerCase())) {
        undocumented.push(`${def.name}: ${piece.name}`);
      }
    }
  }
  assert.deepEqual(undocumented, [], `kit pieces missing from the archetypes doc:\n  ${undocumented.join("\n  ")}`);
});

test("archetypes call out units whose basic attacks change damage type", () => {
  // Carried over from the retired tests/tier-list-docs.test.js. A unit whose basic attack
  // silently becomes magic or true damage in RAGE is one of the easiest things to leave out
  // of prose, and one of the most decisive facts about the unit.
  const sectionFor = (name) => {
    const heading = `### ${name} `;
    const start = ARCHETYPES.indexOf(heading);
    if (start === -1) return null;
    const next = ARCHETYPES.indexOf("\n### ", start + heading.length);
    return next === -1 ? ARCHETYPES.slice(start) : ARCHETYPES.slice(start, next);
  };

  for (const [, def] of draftable) {
    const sources = [def.passive, ...(def.arts ?? []), def.ragePassive, def.rageArt].filter(Boolean);
    const damageTypes = new Set(sources.map((s) => s.effect?.attackDamageType).filter(Boolean));
    for (const damageType of damageTypes) {
      const section = sectionFor(def.name);
      assert.ok(section, `missing archetype section for ${def.name}`);
      assert.match(
        section,
        new RegExp(`basic attacks?.{0,80}${damageType}|${damageType}.{0,80}basic attacks?`, "is"),
        `${def.name} archetype should say its basic attacks deal ${damageType} damage`
      );
    }
  }
});

test("BALANCE.md carries a placement note for every draftable unit", () => {
  const balance = readFileSync(join(ROOT, "BALANCE.md"), "utf8");
  const missing = draftable
    .filter(([, def]) => !balance.includes(`#### ${def.name}`))
    .map(([, def]) => def.name);
  assert.deepEqual(missing, [], `units with no placement note in BALANCE.md: ${missing.join(", ")}`);
});

test("the generated kit reference is not stale", () => {
  const kit = JSON.parse(readFileSync(join(ROOT, "balance-data/kit-audit.json"), "utf8"));
  assert.equal(kit.draftableCount, draftable.length,
    "balance-data/kit-audit.json is out of date — run `node scripts/kit-audit.mjs`");

  // Spot-check that recorded base stats still match the live definitions. A full
  // byte-comparison lives in `node scripts/kit-audit.mjs --check`; this catches the
  // common case of a stat edit landing without a regenerate.
  const stale = [];
  for (const [id, def] of draftable) {
    const recorded = kit.units.find((u) => u.id === id);
    if (!recorded) { stale.push(`${id} missing from kit audit`); continue; }
    for (const key of Object.keys(def.stats)) {
      if (recorded.stats[key] !== def.stats[key]) {
        stale.push(`${id}.${key}: audit ${recorded.stats[key]} vs engine ${def.stats[key]}`);
      }
    }
  }
  assert.deepEqual(stale, [], `run \`node scripts/kit-audit.mjs\`:\n  ${stale.join("\n  ")}`);
});
