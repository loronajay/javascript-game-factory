import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { ARCADE_GAME_SLUGS } from "../arcade-catalog.mjs";

const repoRoot = resolve(import.meta.dirname, "..", "..");

function readRepoFile(...parts) {
  return readFileSync(resolve(repoRoot, ...parts), "utf8");
}

function collectReadmes(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === ".git") return [];
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectReadmes(path);
    return /^README.*\.md$/i.test(entry.name) ? [path] : [];
  });
}

test("every catalog cabinet has a local README", () => {
  for (const entry of ARCADE_GAME_SLUGS) {
    const folder = typeof entry === "string" ? entry : entry.path;
    assert.ok(existsSync(resolve(repoRoot, "games", folder, "README.md")), `${folder} is missing README.md`);
  }
});

test("cabinet READMEs do not publish hard-coded test totals", () => {
  for (const path of collectReadmes(resolve(repoRoot, "games"))) {
    const readme = readFileSync(path, "utf8");
    assert.doesNotMatch(readme, /(?:~\s*)?\b\d+\s+tests\b/i, `${path} contains a drift-prone test total`);
  }
});

test("the game inventory describes Jaybox cabinets as implemented", () => {
  const readme = readRepoFile("games", "README.md");
  assert.doesNotMatch(readme, /Neither is implemented/i);
  assert.match(readme, /playable Questionable Decisions prototype/i);
});

test("Build Buddy documents the shipped pack and online play", () => {
  const readme = readRepoFile("games", "build-buddy", "README.md");
  assert.match(readme, /10-stage pack/i);
  assert.match(readme, /online/i);
  assert.doesNotMatch(readme, /Current registered stage:\s*```text\s*pack_01_stage_01/i);
});

test("Creature Battle's doc map reflects the completed single-stat routes", () => {
  const readme = readRepoFile("games", "creature-battle", "docs", "README.md");
  assert.match(readme, /all five single-stat routes.*complete/i);
  assert.doesNotMatch(readme, /Strength route complete; Defense route next/i);
});

test("Questionable Decisions is identified as a playable prototype", () => {
  const readme = readRepoFile("games", "jaybox", "questionable-decisions", "README.md");
  assert.match(readme, /playable prototype/i);
  assert.doesNotMatch(readme, /is a docs-first/i);
});

test("the API README does not point to a missing Known limits section", () => {
  const readme = readRepoFile("platform-api", "README.md");
  assert.doesNotMatch(readme, /see Known limits below/i);
});
