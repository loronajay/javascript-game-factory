import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PACKAGE_ROOT = `${PROJECT_ROOT}/assets/characters/maddie-bloom`;
const REVIEW_ROOT = `${PROJECT_ROOT}/review/maddie-bloom`;
const DIRECTIONS = [
  "front",
  "front-right",
  "right",
  "rear-right",
  "rear",
  "rear-left",
  "left",
  "front-left",
];

function filesUnder(directory) {
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(directory, `${entry.parentPath}/${entry.name}`).replaceAll("\\", "/"))
    .sort();
}

test("the root package contains only the explicitly approved Maddie idle assets", () => {
  const manifest = JSON.parse(readFileSync(`${PACKAGE_ROOT}/character.json`, "utf8"));
  const expectedFiles = [
    "character.json",
    "source/idle-turnaround-approved.png",
    ...DIRECTIONS.map((direction) => `sprites/idle/${direction}.png`),
  ].sort();

  assert.equal(manifest.id, "maddie-bloom");
  assert.equal(manifest.approvalStatus, "approved");
  assert.equal(manifest.assetVersion, 2);
  assert.deepEqual(Object.keys(manifest.actions.idle), DIRECTIONS);
  assert.deepEqual(filesUnder(PACKAGE_ROOT), expectedFiles);
  for (const relativePath of Object.values(manifest.actions.idle)) {
    assert.ok(existsSync(`${PACKAGE_ROOT}/${relativePath}`), relativePath);
  }
});

test("the approved package records the exact accepted source sheet", () => {
  const manifest = JSON.parse(readFileSync(`${PACKAGE_ROOT}/character.json`, "utf8"));
  assert.equal(manifest.source.file, "source/idle-turnaround-approved.png");
  assert.equal(manifest.source.generatedFile, "exec-3f6992ac-748a-4f92-9c53-98671b4ac947.png");
});

test("Maddie's approved outfit uses fashion clothing with gloves as the only boxing gear", () => {
  const manifest = JSON.parse(readFileSync(`${PACKAGE_ROOT}/character.json`, "utf8"));
  assert.deepEqual(manifest.design.boxingGear, ["boxing gloves"]);
  assert.match(manifest.design.outfit, /ruffle skirt/i);
  assert.match(manifest.design.outfit, /fashion sneakers/i);
  assert.doesNotMatch(manifest.design.outfit, /boxing (shorts|boots|trunks)/i);
});

test("rejected prototype and review-workspace trees are not retained", () => {
  assert.equal(existsSync(`${PROJECT_ROOT}/official`), false);
  assert.equal(existsSync(`${PROJECT_ROOT}/v2`), false);
  assert.equal(existsSync(`${PROJECT_ROOT}/v3`), false);
  assert.equal(existsSync(`${PROJECT_ROOT}/viewer/index.html`), true);
});

test("the consistency-locked match guard contains one sprite per direction", () => {
  const guardRoot = `${REVIEW_ROOT}/sprites/guard-v3`;
  assert.deepEqual(
    filesUnder(guardRoot),
    DIRECTIONS.map((direction) => `${direction}.png`).sort(),
  );
});
